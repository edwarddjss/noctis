/**
 * MOCK sports-data provider. Every team, league, player and fixture here is
 * FICTIONAL and exists only so the app runs without a licensed data feed.
 * Today's fixtures cycle through scheduled → live → finished every 150 minutes
 * so the Live tab always has something to show.
 */
import type { Competition, Match, MatchDetails, MatchEvent, MatchStatus, Player, Team, TeamDetails } from "../../domain";
import { isLive } from "../../domain";
import type { FixtureQuery, PlayerDetails, RequestOptions, SportsDataProvider } from "./types";

const COUNTRY = "Mockland";

export const MOCK_COMPETITIONS: Competition[] = [
  { id: "mock-pd", name: "Mock Premier Division", country: COUNTRY, type: "league", season: 2026, logoUrl: null },
  { id: "mock-ch", name: "Mock Championship", country: COUNTRY, type: "league", season: 2026, logoUrl: null },
  { id: "mock-cup", name: "Mock Continental Cup", country: "International (mock)", type: "cup", season: 2026, logoUrl: null },
];

const TEAM_NAMES: [string, string, string][] = [
  // [id, name, short]
  ["mt-aurora", "Aurora Falcons", "AUR"],
  ["mt-cobalt", "Cobalt Rovers", "COB"],
  ["mt-ember", "Ember City", "EMB"],
  ["mt-granite", "Granite Athletic", "GRA"],
  ["mt-harbor", "Harbor Lights", "HAR"],
  ["mt-juniper", "Juniper United", "JUN"],
  ["mt-kestrel", "Kestrel Town", "KES"],
  ["mt-lumen", "Lumen FC", "LUM"],
  ["mt-nimbus", "Nimbus Wanderers", "NIM"],
  ["mt-onyx", "Onyx Athletic", "ONY"],
  ["mt-quartz", "Quartz City", "QUA"],
  ["mt-saffron", "Saffron Rangers", "SAF"],
];

export const MOCK_TEAMS: Team[] = TEAM_NAMES.map(([id, name, shortName]) => ({
  id,
  name,
  shortName,
  country: COUNTRY,
  crestUrl: null,
  national: false,
}));

const FIRST = ["Alex", "Sam", "Jordan", "Rui", "Kenji", "Luca", "Mateo", "Noah", "Omar", "Pavel", "Tomas", "Yusuf", "Ivo", "Dario"];
const LAST = ["Varga", "Okafor", "Lindqvist", "Moreau", "Tanaka", "Silva", "Novak", "Haddad", "Brennan", "Costa", "Ibsen", "Rahman", "Petrov", "Quinn"];
const POSITIONS = ["Goalkeeper", "Defender", "Defender", "Defender", "Defender", "Midfielder", "Midfielder", "Midfielder", "Attacker", "Attacker", "Attacker"];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const MOCK_PLAYERS: Player[] = MOCK_TEAMS.flatMap((team, ti) =>
  POSITIONS.map((position, pi) => {
    const h = hash(`${team.id}-${pi}`);
    return {
      id: `mp-${team.id.slice(3)}-${pi + 1}`,
      name: `${FIRST[(ti + pi * 3) % FIRST.length]} ${LAST[(ti * 5 + pi) % LAST.length]}`,
      nationality: COUNTRY,
      position,
      number: pi + 1,
      age: 18 + (h % 17),
      photoUrl: null,
      teamId: team.id,
      teamName: team.name,
    };
  }),
);

const teamById = new Map(MOCK_TEAMS.map((t) => [t.id, t]));
const compById = new Map(MOCK_COMPETITIONS.map((c) => [c.id, c]));

interface FixtureSpec {
  id: string;
  competitionId: string;
  homeId: string;
  awayId: string;
  round: string;
  /** Fixed day offset from today (UTC 15:00 kickoff) OR cycling slot for today. */
  dayOffset?: number;
  cycleSlot?: number;
}

/** Circle-method round robin for an even number of teams. */
function roundRobin(ids: string[]): [string, string][][] {
  const arr = [...ids];
  const rounds: [string, string][][] = [];
  for (let r = 0; r < arr.length - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < arr.length / 2; i++) {
      const a = arr[i]!;
      const b = arr[arr.length - 1 - i]!;
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop()!);
  }
  return rounds;
}

export const CYCLE_MIN = 150;
const PRE_MATCH_MIN = 20;
const DAY_OFFSETS = [-6, -3, 0, 3, 7]; // round 3 (index 2) is "today"

function buildSpecs(): FixtureSpec[] {
  const specs: FixtureSpec[] = [];
  let slot = 0;
  const leagues: [string, string[]][] = [
    ["mock-pd", MOCK_TEAMS.slice(0, 6).map((t) => t.id)],
    ["mock-ch", MOCK_TEAMS.slice(6, 12).map((t) => t.id)],
  ];
  for (const [competitionId, ids] of leagues) {
    roundRobin(ids).forEach((pairs, r) => {
      pairs.forEach(([homeId, awayId], i) => {
        const today = DAY_OFFSETS[r] === 0;
        specs.push({
          id: `${competitionId.replace("mock-", "m-")}-r${r + 1}-${i + 1}`,
          competitionId,
          homeId,
          awayId,
          round: `Round ${r + 1}`,
          ...(today ? { cycleSlot: slot++ } : { dayOffset: DAY_OFFSETS[r] }),
        });
      });
    });
  }
  specs.push(
    { id: "m-cup-qf-1", competitionId: "mock-cup", homeId: "mt-aurora", awayId: "mt-lumen", round: "Quarter-final", cycleSlot: slot++ },
    { id: "m-cup-qf-2", competitionId: "mock-cup", homeId: "mt-onyx", awayId: "mt-cobalt", round: "Quarter-final", cycleSlot: slot++ },
    { id: "m-cup-sf-1", competitionId: "mock-cup", homeId: "mt-ember", awayId: "mt-nimbus", round: "Semi-final", dayOffset: 10 },
  );
  return specs;
}

export const MOCK_FIXTURE_SPECS = buildSpecs();
const TODAY_SLOTS = MOCK_FIXTURE_SPECS.filter((s) => s.cycleSlot !== undefined).length;

function goalsFor(spec: FixtureSpec): { minute: number; side: "home" | "away"; scorer: string }[] {
  const h = hash(spec.id);
  const homeGoals = h % 4;
  const awayGoals = (h >>> 3) % 3;
  const goals: { minute: number; side: "home" | "away"; scorer: string }[] = [];
  const squad = (teamId: string) => MOCK_PLAYERS.filter((p) => p.teamId === teamId && p.position !== "Goalkeeper");
  for (let g = 0; g < homeGoals + awayGoals; g++) {
    const side = g < homeGoals ? "home" : "away";
    const players = squad(side === "home" ? spec.homeId : spec.awayId);
    goals.push({
      minute: 3 + (hash(`${spec.id}-g${g}`) % 87),
      side,
      scorer: players[hash(`${spec.id}-s${g}`) % players.length]!.name,
    });
  }
  return goals.sort((a, b) => a.minute - b.minute);
}

interface Clock {
  status: MatchStatus;
  minute: number | null;
  kickoff: Date;
  label: string;
}

function clockFor(spec: FixtureSpec, now: Date): Clock {
  if (spec.dayOffset !== undefined) {
    const k = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + spec.dayOffset, 15, 0));
    const past = k.getTime() + 115 * 60_000 < now.getTime();
    return past
      ? { status: "finished", minute: 90, kickoff: k, label: "FT" }
      : { status: "scheduled", minute: null, kickoff: k, label: "" };
  }
  const nowMin = now.getTime() / 60_000;
  const phase = (spec.cycleSlot! * CYCLE_MIN) / TODAY_SLOTS;
  const elapsed = ((nowMin + phase) % CYCLE_MIN) - PRE_MATCH_MIN;
  const kickoff = new Date(Math.round(now.getTime() - elapsed * 60_000));
  kickoff.setUTCSeconds(0, 0);
  if (elapsed < 0) return { status: "scheduled", minute: null, kickoff, label: "" };
  if (elapsed < 45) return { status: "live", minute: Math.floor(elapsed) + 1, kickoff, label: `${Math.floor(elapsed) + 1}'` };
  if (elapsed < 60) return { status: "halftime", minute: 45, kickoff, label: "HT" };
  if (elapsed < 108) {
    const m = Math.floor(elapsed) - 14;
    return { status: "live", minute: m, kickoff, label: m > 90 ? `90+${m - 90}'` : `${m}'` };
  }
  return { status: "finished", minute: 90, kickoff, label: "FT" };
}

function toMatch(spec: FixtureSpec, now: Date): Match & { _goals: ReturnType<typeof goalsFor> } {
  const clock = clockFor(spec, now);
  const goals = goalsFor(spec);
  const upTo = clock.status === "finished" ? 999 : clock.status === "scheduled" ? -1 : (clock.minute ?? 0);
  const scored = goals.filter((g) => g.minute <= upTo);
  const started = clock.status !== "scheduled";
  return {
    id: spec.id,
    competition: compById.get(spec.competitionId)!,
    kickoff: clock.kickoff.toISOString(),
    status: clock.status,
    statusLabel: clock.label,
    minute: clock.minute,
    home: teamById.get(spec.homeId)!,
    away: teamById.get(spec.awayId)!,
    score: {
      home: started ? scored.filter((g) => g.side === "home").length : null,
      away: started ? scored.filter((g) => g.side === "away").length : null,
    },
    venue: `${teamById.get(spec.homeId)!.name} Ground (mock)`,
    round: spec.round,
    _goals: scored,
  };
}

function strip(m: Match & { _goals?: unknown }): Match {
  const { _goals, ...rest } = m;
  void _goals;
  return rest;
}

function checkAbort(opts?: RequestOptions) {
  if (opts?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function matches(q: string, ...fields: (string | undefined)[]): boolean {
  const needle = q.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(needle));
}

export class MockSportsDataProvider implements SportsDataProvider {
  readonly id = "mock";
  readonly isMock = true;
  constructor(private readonly now: () => Date = () => new Date()) {}

  private all(): ReturnType<typeof toMatch>[] {
    const now = this.now();
    return MOCK_FIXTURE_SPECS.map((s) => toMatch(s, now));
  }

  async searchTeams(query: string, opts?: RequestOptions): Promise<Team[]> {
    checkAbort(opts);
    return MOCK_TEAMS.filter((t) => matches(query, t.name, t.shortName));
  }

  async searchPlayers(query: string, opts?: RequestOptions): Promise<Player[]> {
    checkAbort(opts);
    return MOCK_PLAYERS.filter((p) => matches(query, p.name, p.teamName)).slice(0, 25);
  }

  async getTeam(id: string, opts?: RequestOptions): Promise<TeamDetails | null> {
    checkAbort(opts);
    const t = teamById.get(id);
    if (!t) return null;
    return { ...t, founded: null, venue: `${t.name} Ground (mock)`, squad: MOCK_PLAYERS.filter((p) => p.teamId === id) };
  }

  async getPlayer(id: string, opts?: RequestOptions): Promise<PlayerDetails | null> {
    checkAbort(opts);
    return MOCK_PLAYERS.find((p) => p.id === id) ?? null;
  }

  async getCompetitions(opts?: RequestOptions & { search?: string }): Promise<Competition[]> {
    checkAbort(opts);
    const s = opts?.search;
    return s ? MOCK_COMPETITIONS.filter((c) => matches(s, c.name, c.country)) : MOCK_COMPETITIONS;
  }

  async getFixtures(query: FixtureQuery, opts?: RequestOptions): Promise<Match[]> {
    checkAbort(opts);
    const limit = query.limit ?? 10;
    const list = this.all().filter(
      (m) =>
        (!query.teamId || m.home.id === query.teamId || m.away.id === query.teamId) &&
        (!query.competitionId || m.competition.id === query.competitionId),
    );
    if (query.direction === "last") {
      return list
        .filter((m) => m.status === "finished")
        .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
        .slice(0, limit)
        .map(strip);
    }
    return list
      .filter((m) => m.status === "scheduled" || isLive(m.status))
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
      .slice(0, limit)
      .map(strip);
  }

  async getLiveMatches(opts?: RequestOptions): Promise<Match[]> {
    checkAbort(opts);
    return this.all().filter((m) => isLive(m.status)).map(strip);
  }

  async getMatchDetails(id: string, opts?: RequestOptions): Promise<MatchDetails | null> {
    checkAbort(opts);
    const m = this.all().find((x) => x.id === id);
    if (!m) return null;
    const events: MatchEvent[] = m._goals.map((g) => ({ minute: g.minute, type: "goal", side: g.side, player: g.scorer, detail: "Goal" }));
    return { ...strip(m), events };
  }
}
