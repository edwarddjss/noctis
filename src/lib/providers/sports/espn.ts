/**
 * ESPN soccer adapter (site.api.espn.com).
 *
 * IMPORTANT: these endpoints are public but UNDOCUMENTED. ESPN publishes no
 * terms, rate limits or stability guarantees for them, and they can change
 * without notice. This adapter is isolated so it can be swapped for a
 * licensed provider (see api-football.ts) without touching the UI.
 *
 * Etiquette: every call goes through the shared server cache, so many users
 * cost the same upstream traffic as one. No auth, cookies or headers are
 * spoofed; requests are plain GETs to public JSON.
 *
 * Ids are composite "<leagueSlug>.<espnId>" (e.g. "eng.1.359") because most
 * ESPN endpoints are scoped by league.
 */
import { z } from "zod";
import type { Competition, Lineup, Match, MatchDetails, MatchEvent, MatchStatus, Player, StandingsGroup, Team, TeamDetails } from "../../domain";
import { ProviderError } from "../../errors";
import { TtlCache } from "../../http/cache";
import { fetchJson, sharedCache } from "../../http/fetch-json";
import { log } from "../../log";
import { ESPN_LEAGUES, LEAGUE_BY_SLUG, makeId, parseId, type LeagueInfo } from "./espn-leagues";
import type { FixtureQuery, PlayerDetails, RequestOptions, SportsDataProvider } from "./types";

// ---- Lenient wire schemas (ESPN shapes vary slightly between endpoints) -------

const str = z.string().nullish();
const num = z.number().nullish();
const Logo = z.object({ href: z.string() });

const WireTeam = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  displayName: z.string().optional(),
  name: z.string().optional(),
  shortDisplayName: str,
  abbreviation: str,
  location: str,
  logo: str,
  logos: z.array(Logo).nullish(),
  isNational: z.boolean().nullish(),
});

/** Scoreboard uses "2"; schedule uses { value, displayValue }. */
const Score = z
  .union([z.string(), z.number(), z.object({ value: num, displayValue: str }).passthrough()])
  .nullish()
  .transform((s) => {
    if (s == null) return null;
    if (typeof s === "number") return s;
    if (typeof s === "string") return s.trim() === "" || isNaN(Number(s)) ? null : Number(s);
    if (s.value != null) return s.value;
    return s.displayValue != null && !isNaN(Number(s.displayValue)) ? Number(s.displayValue) : null;
  });

const WireStatus = z.object({
  clock: num,
  displayClock: str,
  period: num,
  type: z.object({ name: str, state: str, completed: z.boolean().nullish(), description: str, detail: str, shortDetail: str }),
});

const WireCompetitor = z.object({
  homeAway: z.enum(["home", "away"]),
  score: Score,
  team: WireTeam,
});

const WireDetail = z.object({
  type: z.object({ text: str, type: str }).passthrough().nullish(),
  clock: z.object({ value: num, displayValue: str }).nullish(),
  team: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).nullish(),
  scoringPlay: z.boolean().nullish(),
  yellowCard: z.boolean().nullish(),
  redCard: z.boolean().nullish(),
  penaltyKick: z.boolean().nullish(),
  ownGoal: z.boolean().nullish(),
  athletesInvolved: z.array(z.object({ displayName: str }).passthrough()).nullish(),
});

const WireCompetition = z.object({
  id: z.union([z.string(), z.number()]).transform(String).optional(),
  date: str,
  venue: z.object({ fullName: str }).passthrough().nullish(),
  competitors: z.array(WireCompetitor),
  status: WireStatus.nullish(),
  details: z.array(WireDetail).nullish(),
});

const WireEvent = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  date: z.string(),
  name: str,
  status: WireStatus.nullish(),
  competitions: z.array(WireCompetition).min(1),
  season: z.object({ year: num, slug: str }).passthrough().nullish(),
  league: z.object({ slug: str, name: str }).passthrough().nullish(),
});

const WireLeague = z.object({ slug: str, name: str, abbreviation: str, logos: z.array(Logo).nullish(), season: z.object({ year: num }).passthrough().nullish() }).passthrough();

const ScoreboardSchema = z.object({ leagues: z.array(WireLeague).nullish(), events: z.array(z.unknown()).default([]) }).passthrough();
const ScheduleSchema = z.object({ events: z.array(z.unknown()).default([]) }).passthrough();
const TeamsListSchema = z
  .object({ sports: z.array(z.object({ leagues: z.array(z.object({ teams: z.array(z.object({ team: z.unknown() })).default([]) }).passthrough()) })).default([]) })
  .passthrough();
const TeamSchemaWire = z.object({ team: WireTeam.extend({ venue: z.object({ fullName: str }).passthrough().nullish() }).passthrough() }).passthrough();

const WireAthlete = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    displayName: z.string(),
    jersey: str,
    age: num,
    citizenship: str,
    position: z.object({ displayName: str, name: str, abbreviation: str }).passthrough().nullish(),
    headshot: z.object({ href: z.string() }).passthrough().nullish(),
    team: z.object({ id: z.union([z.string(), z.number()]).transform(String).optional(), displayName: str }).passthrough().nullish(),
  })
  .passthrough();
const RosterSchema = z.object({ athletes: z.array(z.unknown()).default([]) }).passthrough();
const AthleteSchemaWire = z.object({ athlete: WireAthlete }).passthrough();

const SearchSchema = z.object({ items: z.array(z.unknown()).default([]) }).passthrough();
const SearchItem = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    displayName: z.string(),
    type: str,
    sport: str,
    league: str,
    defaultLeagueSlug: str,
    image: z.object({ default: str }).passthrough().nullish(),
    teamRelationships: z.array(z.object({ id: z.union([z.string(), z.number()]).transform(String), displayName: str }).passthrough()).nullish(),
  })
  .passthrough();

const SummarySchema = z
  .object({
    header: z.object({ id: z.union([z.string(), z.number()]).transform(String).optional(), competitions: z.array(WireCompetition).min(1), league: z.object({ slug: str, name: str }).passthrough().nullish() }).passthrough(),
    keyEvents: z.array(z.unknown()).nullish(),
    gameInfo: z.object({ venue: z.object({ fullName: str }).passthrough().nullish() }).passthrough().nullish(),
    rosters: z.array(z.unknown()).nullish(),
  })
  .passthrough();
const WireRoster = z
  .object({
    homeAway: z.enum(["home", "away"]),
    formation: z.union([z.string(), z.object({ name: str }).passthrough()]).nullish(),
    roster: z
      .array(
        z
          .object({
            starter: z.boolean().nullish(),
            jersey: str,
            athlete: z.object({ displayName: z.string() }).passthrough(),
            position: z.object({ abbreviation: str, displayName: str }).passthrough().nullish(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export function mapRosters(raw: unknown[] | null | undefined): MatchDetails["lineups"] {
  if (!raw?.length) return undefined;
  const out: { home: Lineup | null; away: Lineup | null } = { home: null, away: null };
  for (const r of raw) {
    const p = WireRoster.safeParse(r);
    if (!p.success || p.data.roster.length === 0) continue;
    const players = p.data.roster.map((x) => ({
      name: x.athlete.displayName,
      number: x.jersey && !isNaN(Number(x.jersey)) ? Number(x.jersey) : null,
      position: x.position?.abbreviation ?? x.position?.displayName ?? undefined,
      starter: Boolean(x.starter),
    }));
    const f = p.data.formation;
    out[p.data.homeAway] = {
      formation: (typeof f === "string" ? f : f?.name) ?? undefined,
      starters: players.filter((x) => x.starter).map(({ starter, ...rest }) => (void starter, rest)),
      substitutes: players.filter((x) => !x.starter).map(({ starter, ...rest }) => (void starter, rest)),
    };
  }
  return out.home || out.away ? out : undefined;
}
const KeyEvent = z
  .object({
    type: z.object({ type: str, text: str }).passthrough().nullish(),
    clock: z.object({ value: num, displayValue: str }).passthrough().nullish(),
    team: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).passthrough().nullish(),
    scoringPlay: z.boolean().nullish(),
    text: str,
    participants: z.array(z.object({ athlete: z.object({ displayName: str }).passthrough().nullish() }).passthrough()).nullish(),
  })
  .passthrough();

const StandingsSchema = z.object({ children: z.array(z.unknown()).nullish(), standings: z.unknown().optional() }).passthrough();
const StandingsChild = z.object({
  name: str,
  standings: z.object({
    entries: z.array(
      z.object({
        team: WireTeam,
        note: z.object({ description: str }).passthrough().nullish(),
        stats: z.array(z.object({ name: str, type: str, value: num }).passthrough()),
      }),
    ),
  }),
});

// ---- Mapping --------------------------------------------------------------------

export function mapEspnStatus(type: { name?: string | null; state?: string | null } | undefined | null): MatchStatus {
  const name = (type?.name ?? "").toUpperCase();
  if (name.includes("POSTPONED") || name.includes("DELAYED")) return "postponed";
  if (name.includes("CANCEL") || name.includes("ABANDON") || name.includes("FORFEIT")) return "cancelled";
  if (name.includes("HALFTIME") || name === "STATUS_END_PERIOD") return "halftime";
  switch (type?.state) {
    case "pre":
      return "scheduled";
    case "in":
      return "live";
    case "post":
      return "finished";
  }
  return "unknown";
}

function logoOf(t: z.infer<typeof WireTeam>): string | null {
  return t.logo ?? t.logos?.[0]?.href ?? null;
}

function mapTeam(t: z.infer<typeof WireTeam>, league: string): Team {
  return {
    id: makeId(league, t.id),
    name: t.displayName ?? t.name ?? t.shortDisplayName ?? "Unknown",
    shortName: t.abbreviation ?? undefined,
    country: undefined,
    crestUrl: logoOf(t),
    national: t.isNational ?? undefined,
  };
}

function competitionFor(league: string, wire?: z.infer<typeof WireLeague> | null): Competition {
  const known = LEAGUE_BY_SLUG.get(league);
  return {
    id: league,
    name: known?.name ?? wire?.name ?? league,
    country: known?.country,
    type: known?.type ?? "other",
    logoUrl: wire?.logos?.[0]?.href ?? null,
    season: wire?.season?.year ?? undefined,
  };
}

function statusLabel(status: MatchStatus, s: z.infer<typeof WireStatus> | null | undefined): string {
  if (status === "scheduled") return "";
  if (status === "halftime") return "HT";
  if (status === "live") return s?.displayClock || s?.type.shortDetail || "Live";
  if (status === "finished") {
    const d = (s?.type.shortDetail ?? "").toUpperCase();
    return d.includes("PEN") ? "PEN" : d.includes("AET") || d.includes("ET") ? "AET" : "FT";
  }
  return s?.type.shortDetail ?? "";
}

function minuteOf(s: z.infer<typeof WireStatus> | null | undefined): number | null {
  const m = /^(\d+)/.exec(s?.displayClock ?? "");
  if (m) return Number(m[1]);
  return s?.clock != null && s.clock > 0 ? Math.floor(s.clock / 60) : null;
}

function mapDetail(d: z.infer<typeof WireDetail>, homeId: string): MatchEvent | null {
  const minute = Number(/^(\d+)/.exec(d.clock?.displayValue ?? "")?.[1] ?? Math.floor((d.clock?.value ?? 0) / 60));
  const extra = Number(/\+(\d+)/.exec(d.clock?.displayValue ?? "")?.[1] ?? 0) || null;
  const text = d.type?.text ?? "";
  const type: MatchEvent["type"] = d.scoringPlay ? "goal" : d.yellowCard || d.redCard ? "card" : /sub/i.test(text) ? "substitution" : /var/i.test(text) ? "var" : "other";
  if (type === "other") return null;
  return {
    minute,
    extra,
    type,
    side: d.team?.id === homeId ? "home" : "away",
    player: d.athletesInvolved?.[0]?.displayName ?? undefined,
    detail: d.ownGoal ? "Own goal" : d.penaltyKick && d.scoringPlay ? "Penalty" : d.redCard ? "Red card" : d.yellowCard ? "Yellow card" : text || undefined,
  };
}

export function mapEvent(raw: unknown, league: string, wireLeague?: z.infer<typeof WireLeague> | null): (Match & { _details: MatchEvent[] }) | null {
  const parsed = WireEvent.safeParse(raw);
  if (!parsed.success) return null;
  const e = parsed.data;
  const comp = e.competitions[0]!;
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;
  const s = comp.status ?? e.status;
  const status = mapEspnStatus(s?.type);
  const started = status !== "scheduled" && status !== "postponed" && status !== "cancelled";
  const lg = e.league?.slug ?? league;
  return {
    id: makeId(lg, e.id),
    competition: competitionFor(lg, wireLeague),
    kickoff: new Date(comp.date ?? e.date).toISOString(),
    status,
    statusLabel: statusLabel(status, s),
    minute: status === "live" ? minuteOf(s) : null,
    home: mapTeam(home.team, lg),
    away: mapTeam(away.team, lg),
    score: { home: started ? (home.score ?? 0) : null, away: started ? (away.score ?? 0) : null },
    venue: comp.venue?.fullName ?? undefined,
    _details: (comp.details ?? []).map((d) => mapDetail(d, home.team.id)).filter((x): x is MatchEvent => x !== null),
  };
}

const strip = ({ _details, ...m }: Match & { _details?: unknown }): Match => (void _details, m);

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = { status: "fulfilled", value: await fn(items[i]!) };
        } catch (reason) {
          out[i] = { status: "rejected", reason };
        }
      }
    }),
  );
  return out;
}

// ---- Adapter ----------------------------------------------------------------------

export interface EspnConfig {
  baseUrl?: string;
  webBaseUrl?: string;
  leagues?: LeagueInfo[];
  /** seconds */
  ttl?: { live: number; fixtures: number; static: number };
  fetchImpl?: typeof fetch;
  cache?: TtlCache<unknown>;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => Date;
  concurrency?: number;
}

export class EspnProvider implements SportsDataProvider {
  readonly id = "espn";
  readonly attribution = "Scores and data: ESPN (unofficial public endpoints)";
  private readonly base: string;
  private readonly web: string;
  private readonly leagues: LeagueInfo[];
  private readonly ttl: { live: number; fixtures: number; static: number };
  private readonly now: () => Date;

  constructor(private readonly cfg: EspnConfig = {}) {
    this.base = (cfg.baseUrl ?? "https://site.api.espn.com").replace(/\/+$/, "");
    this.web = (cfg.webBaseUrl ?? "https://site.web.api.espn.com").replace(/\/+$/, "");
    this.leagues = cfg.leagues ?? ESPN_LEAGUES;
    this.ttl = cfg.ttl ?? { live: 30, fixtures: 300, static: 86_400 };
    this.now = cfg.now ?? (() => new Date());
  }

  private get<S extends z.ZodType>(url: string, schema: S, ttlSec: number, opts?: RequestOptions): Promise<z.infer<S>> {
    return fetchJson(url, {
      schema,
      headers: { accept: "application/json" },
      signal: opts?.signal,
      cacheKey: `espn:${url}`,
      ttlMs: ttlSec * 1000,
      cache: this.cfg.cache ?? sharedCache,
      fetchImpl: this.cfg.fetchImpl,
      sleep: this.cfg.sleep,
      retries: 1,
    });
  }

  private soccer(league: string, path: string) {
    return `${this.base}/apis/site/v2/sports/soccer/${encodeURIComponent(league)}${path}`;
  }

  private league(slug: string): string {
    if (!/^[a-z0-9_.-]{2,40}$/i.test(slug)) throw new ProviderError("not_found", "Unknown competition");
    return slug.toLowerCase();
  }

  private async scoreboard(league: string, dates: string | null, ttl: number, opts?: RequestOptions) {
    const qs = dates ? `?dates=${dates}&limit=200` : "?limit=200";
    const body = await this.get(this.soccer(league, `/scoreboard${qs}`), ScoreboardSchema, ttl, opts);
    const wl = body.leagues?.[0];
    return body.events.map((e) => mapEvent(e, league, wl)).filter((m): m is NonNullable<typeof m> => m !== null);
  }

  /** All teams of a league (cached a day) — powers team search. */
  private async leagueTeams(league: string, opts?: RequestOptions): Promise<Team[]> {
    const body = await this.get(this.soccer(league, "/teams"), TeamsListSchema, this.ttl.static, opts);
    const raw = body.sports.flatMap((s) => s.leagues.flatMap((l) => l.teams.map((t) => t.team)));
    const out: Team[] = [];
    for (const r of raw) {
      const p = WireTeam.safeParse(r);
      if (p.success) out.push({ ...mapTeam(p.data, league), country: LEAGUE_BY_SLUG.get(league)?.country });
    }
    return out;
  }

  async searchTeams(query: string, opts?: RequestOptions): Promise<Team[]> {
    const q = query.toLowerCase();
    // Club leagues only (cups/internationals repeat the same clubs).
    const leagues = this.leagues.filter((l) => l.type === "league");
    const results = await pool(leagues, this.cfg.concurrency ?? 6, (l) => this.leagueTeams(l.slug, opts));
    const seen = new Set<string>();
    const hits: Team[] = [];
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const t of r.value) {
        const espnId = parseId(t.id)?.id;
        if (!espnId || seen.has(espnId)) continue;
        if (t.name.toLowerCase().includes(q) || t.shortName?.toLowerCase() === q) {
          seen.add(espnId);
          hits.push(t);
        }
      }
    }
    if (results.every((r) => r.status === "rejected")) throw (results[0] as PromiseRejectedResult).reason;
    return hits.sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))).slice(0, 25);
  }

  async searchPlayers(query: string, opts?: RequestOptions): Promise<Player[]> {
    const url = `${this.web}/apis/common/v3/search?query=${encodeURIComponent(query)}&type=player&sport=soccer&limit=20`;
    const body = await this.get(url, SearchSchema, this.ttl.static, opts);
    const out: Player[] = [];
    for (const raw of body.items) {
      const p = SearchItem.safeParse(raw);
      if (!p.success) continue;
      const it = p.data;
      if (it.sport && it.sport !== "soccer") continue;
      if (it.type && it.type !== "player") continue;
      const league = it.defaultLeagueSlug ?? it.league;
      if (!league) continue;
      const team = it.teamRelationships?.[0];
      out.push({
        id: makeId(league, it.id),
        name: it.displayName,
        photoUrl: it.image?.default ?? null,
        teamId: team ? makeId(league, team.id) : undefined,
        teamName: team?.displayName ?? undefined,
      });
    }
    return out;
  }

  async getTeam(id: string, opts?: RequestOptions): Promise<TeamDetails | null> {
    const p = parseId(id);
    if (!p) return null;
    const [team, roster] = await Promise.all([
      this.get(this.soccer(p.league, `/teams/${p.id}`), TeamSchemaWire, this.ttl.static, opts).catch((e) => {
        if (e instanceof ProviderError && e.code === "not_found") return null;
        throw e;
      }),
      this.get(this.soccer(p.league, `/teams/${p.id}/roster`), RosterSchema, this.ttl.static, opts).catch(() => ({ athletes: [] as unknown[] })),
    ]);
    if (!team) return null;
    const base = mapTeam(team.team, p.league);
    const squad: Player[] = [];
    for (const raw of roster.athletes) {
      const a = WireAthlete.safeParse(raw);
      if (!a.success) continue;
      squad.push({
        id: makeId(p.league, a.data.id),
        name: a.data.displayName,
        number: a.data.jersey && !isNaN(Number(a.data.jersey)) ? Number(a.data.jersey) : null,
        position: a.data.position?.displayName ?? undefined,
        nationality: a.data.citizenship ?? undefined,
        age: a.data.age ?? undefined,
        photoUrl: a.data.headshot?.href ?? null,
        teamId: base.id,
        teamName: base.name,
      });
    }
    return {
      ...base,
      country: LEAGUE_BY_SLUG.get(p.league)?.country,
      venue: team.team.venue?.fullName ?? undefined,
      founded: null,
      competitionId: p.league,
      squad,
    };
  }

  async getPlayer(id: string, opts?: RequestOptions): Promise<PlayerDetails | null> {
    const p = parseId(id);
    if (!p) return null;
    const body = await this.get(`${this.web}/apis/common/v3/sports/soccer/${encodeURIComponent(p.league)}/athletes/${p.id}`, AthleteSchemaWire, this.ttl.static, opts).catch((e) => {
      if (e instanceof ProviderError && e.code === "not_found") return null;
      throw e;
    });
    if (!body) return null;
    const a = body.athlete;
    return {
      id,
      name: a.displayName,
      position: a.position?.displayName ?? undefined,
      nationality: a.citizenship ?? undefined,
      age: a.age ?? undefined,
      photoUrl: a.headshot?.href ?? null,
      number: a.jersey && !isNaN(Number(a.jersey)) ? Number(a.jersey) : null,
      teamId: a.team?.id ? makeId(p.league, a.team.id) : undefined,
      teamName: a.team?.displayName ?? undefined,
    };
  }

  async getCompetitions(opts?: RequestOptions & { search?: string }): Promise<Competition[]> {
    const s = opts?.search?.toLowerCase();
    return this.leagues
      .filter((l) => !s || l.name.toLowerCase().includes(s) || l.country.toLowerCase().includes(s))
      .map((l) => ({ id: l.slug, name: l.name, country: l.country, type: l.type, logoUrl: null }));
  }

  async getFixtures(query: FixtureQuery, opts?: RequestOptions): Promise<Match[]> {
    const limit = query.limit ?? 10;
    let matches: Match[];
    if (query.teamId) {
      const p = parseId(query.teamId);
      if (!p) return [];
      // results by default; upcoming with fixture=true
      const path = `/teams/${p.id}/schedule${query.direction === "next" ? "?fixture=true" : ""}`;
      const body = await this.get(this.soccer(p.league, path), ScheduleSchema, this.ttl.fixtures, opts);
      matches = body.events.map((e) => mapEvent(e, p.league)).filter((m): m is NonNullable<typeof m> => m !== null).map(strip);
    } else if (query.competitionId) {
      const league = this.league(query.competitionId);
      const now = this.now();
      const day = 86_400_000;
      const range =
        query.direction === "next" ? `${ymd(now)}-${ymd(new Date(now.getTime() + 14 * day))}` : `${ymd(new Date(now.getTime() - 14 * day))}-${ymd(now)}`;
      matches = (await this.scoreboard(league, range, this.ttl.fixtures, opts)).map(strip);
    } else {
      throw new ProviderError("invalid_response", "teamId or competitionId is required");
    }
    if (query.direction === "last") {
      return matches.filter((m) => m.status === "finished").sort((a, b) => b.kickoff.localeCompare(a.kickoff)).slice(0, limit);
    }
    return matches
      .filter((m) => m.status === "scheduled" || m.status === "live" || m.status === "halftime")
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
      .slice(0, limit);
  }

  async getLiveMatches(opts?: RequestOptions): Promise<Match[]> {
    // Today's scoreboard per covered league, fanned out with a concurrency cap and
    // shared caching (one upstream sweep per TTL regardless of user count).
    const results = await pool(this.leagues, this.cfg.concurrency ?? 6, (l) => this.scoreboard(l.slug, null, this.ttl.live, opts));
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<EspnProvider["scoreboard"]>>> => r.status === "fulfilled");
    if (ok.length === 0 && results.length) throw (results[0] as PromiseRejectedResult).reason;
    const failed = results.length - ok.length;
    if (failed) log.warn("espn.live_partial", { failed, total: results.length });
    const byId = new Map<string, Match>();
    for (const r of ok) for (const m of r.value) if (m.status === "live" || m.status === "halftime") byId.set(m.id, strip(m));
    return [...byId.values()];
  }

  async getMatchesByDate(date: string, opts?: RequestOptions): Promise<Match[]> {
    const compact = date.replace(/-/g, "");
    const isToday = compact === ymd(this.now());
    const ttl = isToday ? this.ttl.live : this.ttl.fixtures;
    const results = await pool(this.leagues, this.cfg.concurrency ?? 6, (l) => this.scoreboard(l.slug, compact, ttl, opts));
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<EspnProvider["scoreboard"]>>> => r.status === "fulfilled");
    if (ok.length === 0 && results.length) throw (results[0] as PromiseRejectedResult).reason;
    const byId = new Map<string, Match>();
    for (const r of ok) for (const m of r.value) byId.set(m.id, strip(m));
    return [...byId.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  }

  async getMatchDetails(id: string, opts?: RequestOptions): Promise<MatchDetails | null> {
    const p = parseId(id);
    if (!p) return null;
    const body = await this.get(this.soccer(p.league, `/summary?event=${p.id}`), SummarySchema, this.ttl.live, opts).catch((e) => {
      if (e instanceof ProviderError && e.code === "not_found") return null;
      throw e;
    });
    if (!body) return null;
    const event = { id: body.header.id ?? p.id, date: body.header.competitions[0]!.date ?? new Date().toISOString(), competitions: body.header.competitions, league: body.header.league };
    const m = mapEvent(event, p.league);
    if (!m) return null;
    const homeId = parseId(m.home.id)?.id ?? "";
    let events: MatchEvent[] = m._details;
    if (body.keyEvents?.length) {
      events = [];
      for (const raw of body.keyEvents) {
        const k = KeyEvent.safeParse(raw);
        if (!k.success) continue;
        const ev = mapDetail(
          {
            type: { text: k.data.type?.text ?? k.data.type?.type ?? "" },
            clock: k.data.clock ?? null,
            team: k.data.team ?? null,
            scoringPlay: k.data.scoringPlay ?? /goal/i.test(k.data.type?.type ?? ""),
            yellowCard: /yellow/i.test(k.data.type?.type ?? k.data.type?.text ?? ""),
            redCard: /red/i.test(k.data.type?.type ?? k.data.type?.text ?? ""),
            athletesInvolved: k.data.participants?.map((x) => ({ displayName: x.athlete?.displayName ?? null })) ?? null,
          },
          homeId,
        );
        if (ev) events.push(ev);
      }
    }
    return { ...strip(m), venue: m.venue ?? body.gameInfo?.venue?.fullName ?? undefined, events, lineups: mapRosters(body.rosters) };
  }

  async getStandings(competitionId: string, opts?: RequestOptions): Promise<StandingsGroup[]> {
    const league = this.league(competitionId);
    const body = await this.get(`${this.base}/apis/v2/sports/soccer/${encodeURIComponent(league)}/standings`, StandingsSchema, this.ttl.fixtures, opts);
    const children = body.children ?? (body.standings ? [{ name: LEAGUE_BY_SLUG.get(league)?.name ?? league, standings: body.standings }] : []);
    const groups: StandingsGroup[] = [];
    for (const c of children) {
      const g = StandingsChild.safeParse(c);
      if (!g.success) continue;
      const rows = g.data.standings.entries.map((e) => {
        const stat = (...names: string[]) => e.stats.find((s) => names.includes(s.name ?? "") || names.includes(s.type ?? ""))?.value ?? 0;
        return {
          rank: stat("rank"),
          team: mapTeam(e.team, league),
          played: stat("gamesPlayed"),
          won: stat("wins"),
          drawn: stat("ties", "draws"),
          lost: stat("losses"),
          goalsFor: stat("pointsFor", "goalsFor"),
          goalsAgainst: stat("pointsAgainst", "goalsAgainst"),
          goalDifference: stat("pointDifferential", "goalDifference"),
          points: stat("points"),
          note: e.note?.description ?? undefined,
        };
      });
      rows.sort((a, b) => (a.rank || 999) - (b.rank || 999));
      groups.push({ name: g.data.name ?? "Table", rows });
    }
    return groups;
  }
}

