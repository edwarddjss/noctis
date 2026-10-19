import { DirectoryStore, UpstreamUnavailable } from "./store.ts";
import type { Channel, League, Match, Provider } from "./types.ts";

const API = "/api/v1";
const ROOT_ROUTES = [
  "GET /api/v1/catalog",
  "GET /api/v1/matches",
  "GET /api/v1/matches/:id",
  "GET /api/v1/matches/:id/options",
  "GET /api/v1/matches/:id/options/:embedId",
  "GET /api/v1/leagues",
  "GET /api/v1/leagues/:slug/matches",
  "GET /api/v1/channels",
  "GET /api/v1/channels/:id/matches",
  "GET /api/v1/providers",
  "GET /api/v1/providers/:host/matches",
  "GET /api/v1/health"
];

export type CorsOrigin = string;
interface ApiConfig { corsOrigin?: CorsOrigin; }

function send(headers: Headers, status: number, data: unknown): Response {
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers });
}

function optionalParam(url: URL, key: string): string | null {
  const v = url.searchParams.get(key)?.trim();
  return v ? v : null;
}

function intParam(url: URL, key: string, fallback: number, max: number): number {
  const raw = optionalParam(url, key);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) throw new InputError(`${key} must be a nonnegative integer`);
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number > max) throw new InputError(`${key} must be <= ${max}`);
  return number;
}

class InputError extends Error {}

function page<T>(items: T[], url: URL, defaultLimit = 50) {
  const offset = intParam(url, "offset", 0, 100_000);
  const limit = intParam(url, "limit", defaultLimit, 200);
  if (limit === 0) throw new InputError("limit must be at least 1");
  return { total: items.length, limit, offset, hasMore: offset + limit < items.length, items: items.slice(offset, offset + limit) };
}

function textMatch(value: string | null, needle: string | null): boolean {
  return !needle || (value ?? "").toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

function matchesFiltered(matches: Match[], url: URL): Match[] {
  const q = optionalParam(url, "q");
  const league = optionalParam(url, "league");
  const country = optionalParam(url, "country");
  const date = optionalParam(url, "date");
  const status = optionalParam(url, "status");
  const channel = optionalParam(url, "channel");
  const provider = optionalParam(url, "provider");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new InputError("date must be YYYY-MM-DD in America/Lima");
  const validStatuses = ["upcoming", "live-inferred", "finished-inferred", "unknown"];
  if (status && !validStatuses.includes(status)) throw new InputError(`status must be one of: ${validStatuses.join(", ")}`);
  return matches.filter(m =>
    (!q || textMatch([m.teams, m.description, m.league, m.country, ...m.options.map(o => o.name + " " + (o.channelId ?? ""))].join(" "), q)) &&
    (!league || m.leagueSlug === league.toLowerCase() || m.league.toLowerCase() === league.toLowerCase()) &&
    (!country || m.country?.toLowerCase() === country.toLowerCase()) &&
    (!date || m.eventDate === date) &&
    (!status || m.status === status) &&
    ((!channel && !provider) || m.options.some(o =>
      (!channel || o.channelId?.toLowerCase() === channel.toLowerCase()) &&
      (!provider || o.provider.toLowerCase() === provider.toLowerCase())
    ))
  );
}

function leaguesFor(matches: Match[]): League[] {
  const groups = new Map<string, League>();
  for (const m of matches) {
    const current = groups.get(m.leagueSlug);
    if (current) current.matchCount += 1;
    else groups.set(m.leagueSlug, { slug: m.leagueSlug, name: m.league, country: m.country, matchCount: 1 });
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || (a.country ?? "").localeCompare(b.country ?? ""));
}

function channelsFor(matches: Match[]): Channel[] {
  const groups = new Map<string, { channel: Channel; matches: Set<string> }>();
  for (const m of matches) for (const option of m.options) {
    if (!option.channelId) continue;
    // The same stream slug can exist at two providers: treat the pair as a channel key.
    const key = `${option.provider}\u0000${option.channelId}`;
    let entry = groups.get(key);
    if (!entry) {
      entry = { channel: { id: option.channelId, provider: option.provider, matchCount: 0, optionCount: 0 }, matches: new Set() };
      groups.set(key, entry);
    }
    entry.channel.optionCount++;
    entry.matches.add(m.id);
  }
  return [...groups.values()].map(({ channel, matches: ids }) => ({ ...channel, matchCount: ids.size }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.provider.localeCompare(b.provider));
}

function providersFor(matches: Match[]): Provider[] {
  const groups = new Map<string, { provider: Provider; matches: Set<string> }>();
  for (const m of matches) for (const o of m.options) {
    const host = o.provider;
    let entry = groups.get(host);
    if (!entry) {
      entry = { provider: { host, matchCount: 0, optionCount: 0 }, matches: new Set() };
      groups.set(host, entry);
    }
    entry.provider.optionCount++;
    entry.matches.add(m.id);
  }
  return [...groups.values()].map(({ provider, matches: ids }) => ({ ...provider, matchCount: ids.size }))
    .sort((a, b) => b.optionCount - a.optionCount || a.host.localeCompare(b.host));
}

function segments(path: string): string[] {
  return path.split("/").filter(Boolean).map(s => {
    try { return decodeURIComponent(s); }
    catch { throw new InputError("Malformed URL encoding"); }
  });
}

/** Read-only API: never fetches player pages, m3u8 playlists or tokenized segments. */
export function createDirectoryHandler(store: DirectoryStore, config: ApiConfig = {}) {
  return async (req: Request): Promise<Response> => {
    const res = new Headers();
    res.set("Access-Control-Allow-Origin", config.corsOrigin ?? "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: res });
    if (req.method !== "GET") { return send(res, 405, { error: "Method not allowed" }); }
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = segments(url.pathname);
      if (url.pathname === "/") { return send(res, 200, { name: "Match Directory REST API", routes: ROOT_ROUTES, docs: "/api/v1" }); }
      if (url.pathname === API) { return send(res, 200, { routes: ROOT_ROUTES }); }
      if (!url.pathname.startsWith(`${API}/`)) { return send(res, 404, { error: "Not found" }); }
      if (path.length === 3 && path[2] === "health") {
        return send(res, 200, { status: "ok", service: "match-directory-api" });
      }
      const { matches, meta } = await store.getMatches();
      // One-call complete snapshot, grouped by league and with reverse channel/provider indexes.
      if (path.length === 3 && path[2] === "catalog") {
        const selection = matchesFiltered(matches, url);
        const leagues = leaguesFor(selection).map(l => ({ ...l, matches: selection.filter(m => m.leagueSlug === l.slug) }));
        return send(res, 200, { matchCount: selection.length, leagues, channels: channelsFor(selection), providers: providersFor(selection), meta });
      }
      // api/v1/matches
      if (path.length === 3 && path[2] === "matches") {
        return send(res, 200, { ...page(matchesFiltered(matches, url), url), meta });
      }
      if (path.length === 4 && path[2] === "matches") {
        const match = matches.find(m => m.id === path[3]);
        return send(res, match ? 200 : 404, match ? { match, meta } : { error: "Match not found" });
      }
      if (path.length === 5 && path[2] === "matches" && path[4] === "options") {
        const match = matches.find(m => m.id === path[3]);
        return send(res, match ? 200 : 404, match ? { matchId: match.id, options: match.options, meta } : { error: "Match not found" });
      }
      if (path.length === 6 && path[2] === "matches" && path[4] === "options") {
        const match = matches.find(m => m.id === path[3]);
        if (!match) { return send(res, 404, { error: "Match not found" }); }
        const option = match.options.find(o => o.embedId === path[5]);
        return send(res, option ? 200 : 404, option ? { matchId: match.id, option, meta } : { error: "Option not found" });
      }
      if (path.length === 3 && path[2] === "leagues") {
        const leagues = leaguesFor(matches).filter(l => textMatch(l.name, optionalParam(url, "q")) && textMatch(l.country, optionalParam(url, "country")));
        return send(res, 200, { ...page(leagues, url), meta });
      }
      if (path.length === 5 && path[2] === "leagues" && path[4] === "matches") {
        const league = leaguesFor(matches).find(l => l.slug === path[3]);
        return send(res, league ? 200 : 404, league ? { league, ...page(matchesFiltered(matches.filter(m => m.leagueSlug === league.slug), url), url), meta } : { error: "League not found" });
      }
      if (path.length === 3 && path[2] === "channels") {
        const channels = channelsFor(matches).filter(c => textMatch(c.id, optionalParam(url, "q")) && textMatch(c.provider, optionalParam(url, "provider")));
        return send(res, 200, { ...page(channels, url), meta });
      }
      if (path.length === 5 && path[2] === "channels" && path[4] === "matches") {
        const id = path[3]?.toLowerCase();
        const provider = optionalParam(url, "provider")?.toLowerCase();
        const selected = channelsFor(matches).filter(c => c.id.toLowerCase() === id && (!provider || c.provider.toLowerCase() === provider));
        const relevant = matches.filter(m => m.options.some(o => o.channelId?.toLowerCase() === id && (!provider || o.provider.toLowerCase() === provider)));
        return send(res, selected.length ? 200 : 404, selected.length ? { channels: selected, ...page(matchesFiltered(relevant, url), url), meta } : { error: "Channel not found" });
      }
      if (path.length === 3 && path[2] === "providers") {
        return send(res, 200, { ...page(providersFor(matches).filter(p => textMatch(p.host, optionalParam(url, "q"))), url), meta });
      }
      if (path.length === 5 && path[2] === "providers" && path[4] === "matches") {
        const host = path[3]?.toLowerCase();
        const provider = providersFor(matches).find(p => p.host.toLowerCase() === host);
        const relevant = matches.filter(m => m.options.some(o => o.provider.toLowerCase() === host));
        return send(res, provider ? 200 : 404, provider ? { provider, ...page(matchesFiltered(relevant, url), url), meta } : { error: "Provider not found" });
      }
      return send(res, 404, { error: "Not found" });
    } catch (error) {
      if (error instanceof InputError) { return send(res, 400, { error: error.message }); }
      if (error instanceof UpstreamUnavailable) { return send(res, 503, { error: "Upstream match directory unavailable; retry later" }); }
      // Don't expose raw upstream response bodies or opaque credentials in error output.
      console.error("API request failed:", error);
      return send(res, 500, { error: "Internal server error" });
    }
  };
}
