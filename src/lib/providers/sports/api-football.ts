/**
 * Adapter for API-Football (API-Sports) v3 — a commercially licensed, documented
 * football data API covering ~1,000+ leagues and cups, teams, squads, players,
 * fixtures and live scores. Docs: https://www.api-football.com/documentation-v3
 *
 * Requires a plan from API-Sports. The key is read from API_FOOTBALL_KEY on the
 * server and sent only in the `x-apisports-key` header — never to the browser.
 * Note: on the free plan some parameters (e.g. next/last) and seasons are
 * restricted; the adapter surfaces that as a `plan_restricted` error.
 */
import { z } from "zod";
import type { Competition, Match, MatchDetails, MatchEvent, MatchStatus, Player, Team, TeamDetails } from "../../domain";
import { ProviderError } from "../../errors";
import { TtlCache } from "../../http/cache";
import { fetchJson, sharedCache } from "../../http/fetch-json";
import { log } from "../../log";
import type { FixtureQuery, PlayerDetails, RequestOptions, SportsDataProvider } from "./types";

// ---- Wire schemas (validated at runtime; unknown fields ignored) -------------

const nstr = z.string().nullable().optional();
const nnum = z.number().nullable().optional();

const EnvelopeSchema = z.object({
  errors: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
  results: z.number().optional(),
  response: z.array(z.unknown()),
});

const WireTeam = z.object({
  id: z.number(),
  name: z.string(),
  code: nstr,
  country: nstr,
  founded: nnum,
  national: z.boolean().nullable().optional(),
  logo: nstr,
});
const WireVenue = z.object({ name: nstr, city: nstr }).nullable().optional();
const WireTeamItem = z.object({ team: WireTeam, venue: WireVenue });

const WireLeagueItem = z.object({
  league: z.object({ id: z.number(), name: z.string(), type: nstr, logo: nstr }),
  country: z.object({ name: nstr }).nullable().optional(),
  seasons: z.array(z.object({ year: z.number(), current: z.boolean().nullable().optional() })).optional(),
});

const WireFixtureTeam = z.object({ id: z.number(), name: z.string(), logo: nstr });
const WireFixtureItem = z.object({
  fixture: z.object({
    id: z.number(),
    date: z.string(),
    venue: z.object({ name: nstr }).nullable().optional(),
    status: z.object({ long: nstr, short: nstr, elapsed: nnum, extra: nnum }),
  }),
  league: z.object({ id: z.number(), name: z.string(), country: nstr, logo: nstr, season: nnum, round: nstr }),
  teams: z.object({ home: WireFixtureTeam, away: WireFixtureTeam }),
  goals: z.object({ home: nnum, away: nnum }),
  events: z
    .array(
      z.object({
        time: z.object({ elapsed: nnum, extra: nnum }),
        team: z.object({ id: z.number().nullable().optional() }),
        player: z.object({ name: nstr }).nullable().optional(),
        type: nstr,
        detail: nstr,
      }),
    )
    .optional(),
});

const WirePlayer = z.object({
  id: z.number(),
  name: z.string(),
  age: nnum,
  number: nnum,
  nationality: nstr,
  position: nstr,
  photo: nstr,
});
const WirePlayerProfileItem = z.object({ player: WirePlayer });
const WireSquadItem = z.object({
  team: z.object({ id: z.number(), name: z.string() }),
  players: z.array(WirePlayer.partial({ nationality: true })),
});
const WirePlayerTeamsItem = z.object({
  team: z.object({ id: z.number(), name: z.string(), logo: nstr }),
  seasons: z.array(z.number()),
});

// ---- Mapping -----------------------------------------------------------------

export function mapStatus(short: string | null | undefined): MatchStatus {
  switch (short) {
    case "TBD":
    case "NS":
      return "scheduled";
    case "1H":
    case "2H":
    case "ET":
    case "BT":
    case "P":
    case "LIVE":
    case "INT":
    case "SUSP":
      return "live";
    case "HT":
      return "halftime";
    case "FT":
    case "AET":
    case "PEN":
      return "finished";
    case "PST":
      return "postponed";
    case "CANC":
    case "ABD":
    case "AWD":
    case "WO":
      return "cancelled";
    default:
      return "unknown";
  }
}

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

function mapTeam(t: z.infer<typeof WireTeam> | z.infer<typeof WireFixtureTeam>): Team {
  const full = t as Partial<z.infer<typeof WireTeam>>;
  return {
    id: String(t.id),
    name: t.name,
    shortName: opt(full.code),
    country: opt(full.country),
    crestUrl: t.logo ?? null,
    national: opt(full.national),
  };
}

export function mapFixture(f: z.infer<typeof WireFixtureItem>): Match {
  const status = mapStatus(f.fixture.status.short);
  const elapsed = f.fixture.status.elapsed ?? null;
  const extra = f.fixture.status.extra ?? null;
  let label = f.fixture.status.short ?? "";
  if (status === "live" && elapsed != null) label = extra ? `${elapsed}+${extra}'` : `${elapsed}'`;
  if (status === "scheduled") label = "";
  return {
    id: String(f.fixture.id),
    competition: {
      id: String(f.league.id),
      name: f.league.name,
      country: opt(f.league.country),
      logoUrl: f.league.logo ?? null,
      season: opt(f.league.season),
    },
    kickoff: new Date(f.fixture.date).toISOString(),
    status,
    statusLabel: label,
    minute: elapsed,
    home: mapTeam(f.teams.home),
    away: mapTeam(f.teams.away),
    score: { home: f.goals.home ?? null, away: f.goals.away ?? null },
    venue: opt(f.fixture.venue?.name),
    round: opt(f.league.round),
  };
}

function mapEvent(e: NonNullable<z.infer<typeof WireFixtureItem>["events"]>[number], homeId: number): MatchEvent {
  const t = (e.type ?? "").toLowerCase();
  const type: MatchEvent["type"] = t === "goal" ? "goal" : t === "card" ? "card" : t === "subst" ? "substitution" : t === "var" ? "var" : "other";
  return {
    minute: e.time.elapsed ?? 0,
    extra: e.time.extra ?? null,
    type,
    side: e.team.id === homeId ? "home" : "away",
    player: opt(e.player?.name),
    detail: opt(e.detail),
  };
}

function mapPlayer(p: Partial<z.infer<typeof WirePlayer>> & { id: number; name: string }, team?: { id: number; name: string }): Player {
  return {
    id: String(p.id),
    name: p.name,
    nationality: opt(p.nationality),
    position: opt(p.position),
    photoUrl: p.photo ?? null,
    age: opt(p.age),
    number: p.number ?? null,
    teamId: team ? String(team.id) : undefined,
    teamName: team?.name,
  };
}

/** Parse each item independently so one malformed record doesn't sink the list. */
function parseItems<S extends z.ZodType>(items: unknown[], schema: S, what: string): z.infer<S>[] {
  const out: z.infer<S>[] = [];
  let dropped = 0;
  for (const it of items) {
    const r = schema.safeParse(it);
    if (r.success) out.push(r.data);
    else dropped++;
  }
  if (dropped) log.warn("api_football.dropped_items", { what, dropped });
  return out;
}

export function classifyErrors(errors: unknown): ProviderError | null {
  if (!errors) return null;
  const entries = Array.isArray(errors) ? errors.map((v, i) => [String(i), v] as const) : Object.entries(errors as Record<string, unknown>);
  if (entries.length === 0) return null;
  const text = entries.map(([k, v]) => `${k}: ${String(v)}`).join("; ");
  const keys = entries.map(([k]) => k.toLowerCase());
  if (keys.includes("token") || /api key|token/i.test(text)) return new ProviderError("unauthorized", "API-Football rejected the API key");
  if (keys.includes("requests") || keys.includes("ratelimit") || /limit/i.test(text)) return new ProviderError("rate_limited", "API-Football request quota reached");
  if (keys.includes("plan") || /plan/i.test(text)) return new ProviderError("plan_restricted", "This query is not available on the current API-Football plan");
  return new ProviderError("upstream", "API-Football returned an error");
}

// ---- Adapter -------------------------------------------------------------------

export interface ApiFootballConfig {
  apiKey: string;
  baseUrl?: string;
  ttl?: { live: number; fixtures: number; static: number }; // seconds
  fetchImpl?: typeof fetch;
  cache?: TtlCache<unknown>;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export class ApiFootballProvider implements SportsDataProvider {
  readonly id = "api-football";
  readonly isMock = false;
  private readonly baseUrl: string;
  private readonly ttl: { live: number; fixtures: number; static: number };
  private blockedUntil = 0;
  private readonly now: () => number;

  constructor(private readonly cfg: ApiFootballConfig) {
    if (!cfg.apiKey) throw new ProviderError("not_configured", "API_FOOTBALL_KEY is not set");
    this.baseUrl = (cfg.baseUrl ?? "https://v3.football.api-sports.io").replace(/\/+$/, "");
    this.ttl = cfg.ttl ?? { live: 20, fixtures: 300, static: 86_400 };
    this.now = cfg.now ?? Date.now;
  }

  /** Track quota headers so we stop calling upstream once a limit is hit. */
  private onResponse = (res: Response) => {
    const perMinute = res.headers.get("x-ratelimit-remaining");
    const daily = res.headers.get("x-ratelimit-requests-remaining");
    if (daily !== null && Number(daily) <= 0) {
      const d = new Date(this.now());
      this.blockedUntil = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
      log.warn("api_football.daily_quota_exhausted");
    } else if (perMinute !== null && Number(perMinute) <= 0) {
      this.blockedUntil = this.now() + 60_000;
      log.warn("api_football.minute_quota_exhausted");
    }
  };

  private async get(path: string, params: Record<string, string | number>, ttlSec: number, opts?: RequestOptions): Promise<unknown[]> {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const url = `${this.baseUrl}${path}?${qs}`;
    const cacheKey = `api-football:${path}?${qs}`;
    const cache = this.cfg.cache ?? sharedCache;

    const preflight =
      this.blockedUntil > this.now()
        ? new ProviderError("rate_limited", "API-Football quota exhausted; waiting for reset", this.blockedUntil - this.now())
        : undefined;

    const body = await fetchJson(url, {
      schema: EnvelopeSchema,
      headers: { "x-apisports-key": this.cfg.apiKey, accept: "application/json" },
      signal: opts?.signal,
      cacheKey,
      ttlMs: ttlSec * 1000,
      cache,
      fetchImpl: this.cfg.fetchImpl,
      sleep: this.cfg.sleep,
      onResponse: this.onResponse,
      preflight,
      validate: (b) => classifyErrors(b.errors),
    });
    return body.response;
  }

  async searchTeams(query: string, opts?: RequestOptions): Promise<Team[]> {
    const items = parseItems(await this.get("/teams", { search: query }, this.ttl.static, opts), WireTeamItem, "teams");
    return items.map((i) => mapTeam(i.team));
  }

  async searchPlayers(query: string, opts?: RequestOptions): Promise<Player[]> {
    const items = parseItems(await this.get("/players/profiles", { search: query }, this.ttl.static, opts), WirePlayerProfileItem, "players");
    return items.map((i) => mapPlayer(i.player));
  }

  async getTeam(id: string, opts?: RequestOptions): Promise<TeamDetails | null> {
    const [teams, squads] = await Promise.all([
      this.get("/teams", { id }, this.ttl.static, opts),
      this.get("/players/squads", { team: id }, this.ttl.static, opts).catch((e) => {
        log.warn("api_football.squad_unavailable", { code: (e as ProviderError).code });
        return [] as unknown[];
      }),
    ]);
    const t = parseItems(teams, WireTeamItem, "team")[0];
    if (!t) return null;
    const squad = parseItems(squads, WireSquadItem, "squad")[0];
    return {
      ...mapTeam(t.team),
      founded: t.team.founded ?? null,
      venue: opt(t.venue?.name),
      squad: squad ? squad.players.map((p) => mapPlayer(p, squad.team)) : [],
    };
  }

  async getPlayer(id: string, opts?: RequestOptions): Promise<PlayerDetails | null> {
    const [profiles, teams] = await Promise.all([
      this.get("/players/profiles", { player: id }, this.ttl.static, opts),
      this.get("/players/teams", { player: id }, this.ttl.static, opts).catch(() => [] as unknown[]),
    ]);
    const p = parseItems(profiles, WirePlayerProfileItem, "player")[0];
    if (!p) return null;
    // Most recent season wins; prefer clubs over national teams when tied.
    const history = parseItems(teams, WirePlayerTeamsItem, "player_teams").sort(
      (a, b) => Math.max(...b.seasons, 0) - Math.max(...a.seasons, 0),
    );
    return mapPlayer(p.player, history[0]?.team);
  }

  async getCompetitions(opts?: RequestOptions & { search?: string }): Promise<Competition[]> {
    const params: Record<string, string> = opts?.search ? { search: opts.search } : { current: "true" };
    const items = parseItems(await this.get("/leagues", params, this.ttl.static, opts), WireLeagueItem, "leagues");
    return items.map((i) => ({
      id: String(i.league.id),
      name: i.league.name,
      country: opt(i.country?.name),
      logoUrl: i.league.logo ?? null,
      type: i.league.type === "League" ? "league" : i.league.type === "Cup" ? "cup" : "other",
      season: i.seasons?.find((s) => s.current)?.year,
    }));
  }

  async getFixtures(query: FixtureQuery, opts?: RequestOptions): Promise<Match[]> {
    const params: Record<string, string | number> = { [query.direction]: Math.min(Math.max(query.limit ?? 10, 1), 50) };
    if (query.teamId) params.team = query.teamId;
    if (query.competitionId) params.league = query.competitionId;
    if (!query.teamId && !query.competitionId) throw new ProviderError("invalid_response", "teamId or competitionId is required");
    const items = parseItems(await this.get("/fixtures", params, this.ttl.fixtures, opts), WireFixtureItem, "fixtures");
    return items.map(mapFixture);
  }

  async getLiveMatches(opts?: RequestOptions): Promise<Match[]> {
    const items = parseItems(await this.get("/fixtures", { live: "all" }, this.ttl.live, opts), WireFixtureItem, "live");
    return items.map(mapFixture);
  }

  async getMatchDetails(id: string, opts?: RequestOptions): Promise<MatchDetails | null> {
    const item = parseItems(await this.get("/fixtures", { id }, this.ttl.live, opts), WireFixtureItem, "fixture")[0];
    if (!item) return null;
    return { ...mapFixture(item), events: (item.events ?? []).map((e) => mapEvent(e, item.teams.home.id)) };
  }
}
