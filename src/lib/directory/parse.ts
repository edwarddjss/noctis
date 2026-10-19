import type { InferredStatus, Match, PlayerOption, PlayerTechnology, StoredMatch } from "./types.ts";

const SITE_ORIGIN = "https://futbollibrefullhd.org";
const LIMA_UTC_OFFSET_HOURS = 5; // Peru observes UTC-05:00 year-round.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const asObj = (v: unknown): Obj => isObj(v) ? v : {};
const asString = (v: unknown): string | null => typeof v === "string" ? v : null;
const getArray = (v: unknown): unknown[] => Array.isArray(v) ? v : (Array.isArray(asObj(v).data) ? asObj(v).data as unknown[] : []);
const collapseWhitespace = (s: string): string => s.replace(/\s+/g, " ").trim();

export function slugify(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

/** The source's league is unstructured free text. Include country to avoid Serie A collisions. */
export function leagueSlug(league: string, country: string | null): string {
  return slugify(`${league}--${country ?? "unknown"}`);
}

/** Parse a plain source-calendar date + HH:mm:ss in America/Lima. */
export function parseLimaKickoff(date: unknown, hour: unknown): string | null {
  if (typeof date !== "string" || typeof hour !== "string") return null;
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const h = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(hour);
  if (!d || !h) return null;
  const [year, month, day, hh, mm, ss] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(h[1]), Number(h[2]), Number(h[3] ?? 0)];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hh > 23 || mm > 59 || ss > 59) return null;
  // Date.UTC normalizes invalid calendar dates; reject those, don't silently shift them.
  const wall = new Date(Date.UTC(year, month - 1, day, hh, mm, ss));
  if (wall.getUTCFullYear() !== year || wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day) return null;
  return new Date(wall.getTime() + LIMA_UTC_OFFSET_HOURS * 3_600_000).toISOString();
}

/** This is an estimate, not a broadcaster's live/finished flag. */
export function inferStatus(kickoff: string | null, now = Date.now()): InferredStatus {
  if (!kickoff) return "unknown";
  const mins = (now - Date.parse(kickoff)) / 60_000;
  if (mins < -15) return "upcoming";
  if (mins <= 135) return "live-inferred";
  return "finished-inferred";
}

function safeHttpUrl(value: string, base?: string): URL | null {
  try {
    const u = new URL(value, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch { return null; }
}

/** Decode Base64 player PAGE reference; we never request provider URLs or video tokens. */
export function decodePlayerUrl(embedUrl: string): URL | null {
  const url = safeHttpUrl(embedUrl, SITE_ORIGIN);
  const r = url?.searchParams.get("r");
  if (!r || r.length > 8192) return null;
  try {
    const decoded = Buffer.from(r, "base64").toString("utf8");
    return safeHttpUrl(decoded);
  } catch { return null; }
}

function classify(playerPage: URL | null): { provider: string; channelId: string | null; technology: PlayerTechnology } {
  if (!playerPage) return { provider: "unknown", channelId: null, technology: "unknown" };
  const provider = playerPage.hostname.toLowerCase();
  if (playerPage.pathname.startsWith("/drm/")) {
    const file = playerPage.pathname.split("/").pop() ?? "";
    return { provider, channelId: decodeURIComponent(file.replace(/\.php$/i, "")) || null, technology: "drm-bitmovin" };
  }
  const channelId = playerPage.searchParams.get("stream")?.trim() || null;
  const technology = provider === "tvf90.com" || provider === "golazohd.com" ? "hls-clappr" : "unknown";
  return { provider, channelId, technology };
}

function parseOption(raw: unknown): PlayerOption | null {
  const option = asObj(raw);
  const attrs = asObj(option.attributes ?? option);
  const originalEmbed = asString(attrs.embed_iframe);
  if (!originalEmbed) return null;
  const publishedEmbed = safeHttpUrl(originalEmbed, SITE_ORIGIN);
  if (!publishedEmbed) return null;
  const player = decodePlayerUrl(originalEmbed);
  return {
    embedId: String(option.id ?? attrs.id ?? "unknown"),
    name: collapseWhitespace(asString(attrs.embed_name) ?? "Option"),
    ...classify(player),
    embedPageUrl: publishedEmbed.toString(),
    playerPageUrl: player?.toString() ?? null
  };
}

function parseMatch(raw: unknown): StoredMatch | null {
  const row = asObj(raw);
  if (row.id == null) return null;
  const a = asObj(row.attributes ?? row);
  const desc = collapseWhitespace(asString(a.diary_description) ?? "Sports event");
  const splitAt = desc.indexOf(":");
  const league = splitAt > 0 ? desc.slice(0, splitAt).trim() : "Events";
  const teams = splitAt > 0 ? desc.slice(splitAt + 1).trim() : desc;
  const countryData = asObj(asObj(a.country).data ?? a.country);
  const country = asString(asObj(countryData.attributes ?? countryData).name);
  const embeds = getArray(a.embeds);
  const options = embeds.map(parseOption).filter((v): v is PlayerOption => v !== null);
  return {
    id: String(row.id), description: desc, teams, league, country,
    leagueSlug: leagueSlug(league, country),
    eventDate: asString(a.date_diary),
    kickoff: parseLimaKickoff(a.date_diary, a.diary_hour), options
  };
}

export function parseDirectory(payload: unknown): StoredMatch[] {
  const array = Array.isArray(payload) ? payload : asObj(payload).data;
  if (!Array.isArray(array)) throw new Error("Directory must contain a data array");
  // Reject a shape change that would otherwise silently replace good cached data with nothing.
  if (array.length && !array.some((entry) => isObj(entry) && ("attributes" in entry || "diary_description" in entry))) {
    throw new Error("Unexpected event schema");
  }
  const seen = new Set<string>();
  const result: StoredMatch[] = [];
  for (const raw of array) {
    const m = parseMatch(raw);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    result.push(m);
  }
  result.sort((a, b) => (a.kickoff ?? "9999").localeCompare(b.kickoff ?? "9999") || a.id.localeCompare(b.id));
  return result;
}

export function materializeMatch(stored: StoredMatch, now = Date.now()): Match {
  return { ...stored, status: inferStatus(stored.kickoff, now) };
}
