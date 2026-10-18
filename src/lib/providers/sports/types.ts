import type { Competition, Match, MatchDetails, Player, StandingsGroup, Team, TeamDetails } from "../../domain";

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface FixtureQuery {
  teamId?: string;
  competitionId?: string;
  /** "next" = upcoming + live, "last" = recently completed. */
  direction: "next" | "last";
  limit?: number;
}

export interface PlayerDetails extends Player {
  /** Current club, used to build the Following feed for a followed player. */
  teamId?: string;
  teamName?: string;
}

/**
 * Contract every sports-data adapter implements. Adapters run on the server
 * only; credentials never reach the browser.
 */
export interface SportsDataProvider {
  readonly id: string;
  searchTeams(query: string, opts?: RequestOptions): Promise<Team[]>;
  searchPlayers(query: string, opts?: RequestOptions): Promise<Player[]>;
  getTeam(id: string, opts?: RequestOptions): Promise<TeamDetails | null>;
  getPlayer(id: string, opts?: RequestOptions): Promise<PlayerDetails | null>;
  getCompetitions(opts?: RequestOptions & { search?: string }): Promise<Competition[]>;
  getFixtures(query: FixtureQuery, opts?: RequestOptions): Promise<Match[]>;
  getLiveMatches(opts?: RequestOptions): Promise<Match[]>;
  getMatchDetails(id: string, opts?: RequestOptions): Promise<MatchDetails | null>;
  /** Every covered match on a calendar day (YYYY-MM-DD, provider's local day). */
  getMatchesByDate(date: string, opts?: RequestOptions): Promise<Match[]>;
  /** League table(s); empty for knockout cups or when unavailable. */
  getStandings(competitionId: string, opts?: RequestOptions): Promise<StandingsGroup[]>;
  /** Attribution line the UI must show for this data source. */
  readonly attribution: string;
}

/** Search input rules shared by all adapters and API routes. */
export function normalizeQuery(q: string): string | null {
  const s = q.normalize("NFKC").replace(/[^\p{L}\p{N} .'\-]/gu, "").replace(/\s+/g, " ").trim();
  if (s.length < 3 || s.length > 40) return null;
  return s;
}

export function isValidDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().startsWith(d);
}

export function isValidId(id: string): boolean {
  return /^[A-Za-z0-9_.-]{1,60}$/.test(id) && !id.includes("..");
}
