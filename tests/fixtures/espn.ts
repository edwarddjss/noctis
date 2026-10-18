/**
 * TEST FIXTURES ONLY: responses shaped like ESPN's public soccer JSON, used by
 * unit tests and the e2e stand-in server so tests are deterministic and
 * offline. The app itself never reads this file.
 */
const H = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, "Z");

export const TEAMS: Record<string, { id: string; displayName: string; abbreviation: string; league: string }> = {
  "359": { id: "359", displayName: "Arsenal", abbreviation: "ARS", league: "eng.1" },
  "363": { id: "363", displayName: "Chelsea", abbreviation: "CHE", league: "eng.1" },
  "364": { id: "364", displayName: "Liverpool", abbreviation: "LIV", league: "eng.1" },
  "382": { id: "382", displayName: "Manchester City", abbreviation: "MNC", league: "eng.1" },
  "367": { id: "367", displayName: "Tottenham Hotspur", abbreviation: "TOT", league: "eng.1" },
  "360": { id: "360", displayName: "Manchester United", abbreviation: "MAN", league: "eng.1" },
  "361": { id: "361", displayName: "Newcastle United", abbreviation: "NEW", league: "eng.1" },
  "362": { id: "362", displayName: "Aston Villa", abbreviation: "AVL", league: "eng.1" },
  "368": { id: "368", displayName: "Everton", abbreviation: "EVE", league: "eng.1" },
  "331": { id: "331", displayName: "Brighton & Hove Albion", abbreviation: "BHA", league: "eng.1" },
  "83": { id: "83", displayName: "Barcelona", abbreviation: "BAR", league: "esp.1" },
  "86": { id: "86", displayName: "Real Madrid", abbreviation: "RMA", league: "esp.1" },
};

const team = (id: string) => ({ ...TEAMS[id]!, name: TEAMS[id]!.displayName, shortDisplayName: TEAMS[id]!.displayName, logo: `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png` });

type State = { state: "pre" | "in" | "post"; name: string; clock?: string; detail?: string };
const status = (s: State) => ({
  clock: 0,
  displayClock: s.clock ?? "0'",
  period: s.state === "in" ? 2 : 0,
  type: { name: s.name, state: s.state, completed: s.state === "post", description: s.detail ?? "", detail: s.detail ?? s.clock ?? "", shortDetail: s.detail ?? s.clock ?? "" },
});

function event(id: string, league: string, home: string, away: string, s: State, score: [number, number] | null, kickoff: string, details: unknown[] = [], scoreAsObject = false) {
  const sc = (n: number | undefined) => (n === undefined ? undefined : scoreAsObject ? { value: n, displayValue: String(n) } : String(n));
  return {
    id,
    date: kickoff,
    name: `${TEAMS[away]!.displayName} at ${TEAMS[home]!.displayName}`,
    season: { year: 2026, slug: "2026-27" },
    status: status(s),
    competitions: [
      {
        id,
        date: kickoff,
        venue: { fullName: `${TEAMS[home]!.displayName} Stadium` },
        status: status(s),
        competitors: [
          { homeAway: "home", score: score ? sc(score[0]) : undefined, team: team(home) },
          { homeAway: "away", score: score ? sc(score[1]) : undefined, team: team(away) },
        ],
        details,
      },
    ],
  };
}

const goal = (min: string, teamId: string, player: string) => ({ type: { text: "Goal" }, clock: { value: 0, displayValue: min }, team: { id: teamId }, scoringPlay: true, athletesInvolved: [{ displayName: player }] });

export function scoreboard(league: string) {
  const leagues = [{ slug: league, name: league === "eng.1" ? "English Premier League" : "Spanish LALIGA", abbreviation: league, logos: [{ href: `https://a.espncdn.com/i/leaguelogos/soccer/500/${league === "eng.1" ? 23 : 15}.png` }], season: { year: 2026 } }];
  if (league === "eng.1")
    return {
      leagues,
      events: [
        event("900001", "eng.1", "359", "363", { state: "in", name: "STATUS_SECOND_HALF", clock: "67'" }, [2, 1], iso(-1.2 * H), [goal("12'", "359", "Bukayo Saka"), goal("40'", "363", "Cole Palmer"), goal("58'", "359", "Martin Ødegaard")]),
        event("900002", "eng.1", "364", "382", { state: "in", name: "STATUS_HALFTIME", clock: "45'", detail: "Halftime" }, [0, 0], iso(-0.9 * H)),
        event("900003", "eng.1", "367", "360", { state: "in", name: "STATUS_FIRST_HALF", clock: "12'" }, [0, 0], iso(-0.25 * H)),
        event("900004", "eng.1", "361", "362", { state: "pre", name: "STATUS_SCHEDULED" }, null, iso(26 * H)),
        event("900005", "eng.1", "368", "331", { state: "post", name: "STATUS_FULL_TIME", detail: "FT" }, [1, 1], iso(-22 * H)),
      ],
    };
  if (league === "esp.1") return { leagues, events: [event("910001", "esp.1", "83", "86", { state: "in", name: "STATUS_FIRST_HALF", clock: "30'" }, [1, 0], iso(-0.6 * H))] };
  return { leagues: [], events: [] };
}

export function teamsList(league: string) {
  const ids = Object.values(TEAMS).filter((t) => t.league === league).map((t) => t.id);
  return { sports: [{ leagues: [{ teams: ids.map((id) => ({ team: team(id) })) }] }] };
}

export function teamDetail(id: string) {
  return TEAMS[id] ? { team: { ...team(id), venue: { fullName: `${TEAMS[id]!.displayName} Stadium` } } } : null;
}

export function roster(id: string) {
  if (id !== "359") return { athletes: [] };
  return {
    athletes: [
      { id: "248949", displayName: "Bukayo Saka", jersey: "7", age: 25, citizenship: "England", position: { displayName: "Forward" } },
      { id: "202766", displayName: "Martin Ødegaard", jersey: "8", age: 27, citizenship: "Norway", position: { displayName: "Midfielder" } },
      { id: "250765", displayName: "William Saliba", jersey: "2", age: 25, citizenship: "France", position: { displayName: "Defender" } },
    ],
  };
}

export function schedule(id: string, fixture: boolean) {
  if (id !== "359") return { events: [] };
  return fixture
    ? { events: [event("900001", "eng.1", "359", "363", { state: "in", name: "STATUS_SECOND_HALF", clock: "67'" }, [2, 1], iso(-1.2 * H), [], true), event("900010", "eng.1", "362", "359", { state: "pre", name: "STATUS_SCHEDULED" }, null, iso(7 * 24 * H), [], true)] }
    : { events: [event("900011", "eng.1", "359", "368", { state: "post", name: "STATUS_FULL_TIME", detail: "FT" }, [3, 0], iso(-6 * 24 * H), [], true)] };
}

export function summary(eventId: string) {
  const all = [...scoreboard("eng.1").events, ...scoreboard("esp.1").events];
  const e = all.find((x) => x.id === eventId);
  if (!e) return null;
  return {
    header: { id: e.id, league: { slug: eventId.startsWith("91") ? "esp.1" : "eng.1", name: "League" }, competitions: e.competitions },
    keyEvents: (e.competitions[0]!.details as ReturnType<typeof goal>[]).map((d) => ({
      type: { type: "goal", text: "Goal" },
      clock: d.clock,
      team: d.team,
      scoringPlay: true,
      participants: d.athletesInvolved.map((a) => ({ athlete: a })),
    })),
    gameInfo: { venue: { fullName: e.competitions[0]!.venue.fullName } },
    rosters:
      eventId === "900001"
        ? [
            {
              homeAway: "home",
              formation: "4-3-3",
              roster: [
                { starter: true, jersey: "22", athlete: { displayName: "David Raya" }, position: { abbreviation: "G" } },
                { starter: true, jersey: "7", athlete: { displayName: "Bukayo Saka" }, position: { abbreviation: "RW" } },
                { starter: false, jersey: "19", athlete: { displayName: "Leandro Trossard" }, position: { abbreviation: "SUB" } },
              ],
            },
            { homeAway: "away", formation: { name: "4-2-3-1" }, roster: [{ starter: true, jersey: "10", athlete: { displayName: "Cole Palmer" }, position: { abbreviation: "AM" } }] },
          ]
        : [],
  };
}

export function standings(league: string) {
  if (league !== "eng.1") return { children: [] };
  const rows: [string, number, number, number, number, number, number][] = [
    ["359", 8, 6, 2, 0, 18, 5],
    ["364", 8, 6, 1, 1, 17, 7],
    ["382", 8, 5, 2, 1, 16, 8],
    ["363", 8, 4, 2, 2, 13, 10],
  ];
  return {
    children: [
      {
        name: "English Premier League",
        standings: {
          entries: rows.map(([id, gp, w, d, l, gf, ga], i) => ({
            team: team(id),
            note: i === 0 ? { description: "Champions League" } : undefined,
            stats: [
              { name: "rank", value: i + 1 },
              { name: "gamesPlayed", value: gp },
              { name: "wins", value: w },
              { name: "ties", value: d },
              { name: "losses", value: l },
              { name: "pointsFor", value: gf },
              { name: "pointsAgainst", value: ga },
              { name: "pointDifferential", value: gf - ga },
              { name: "points", value: w * 3 + d },
            ],
          })),
        },
      },
    ],
  };
}

export function search(q: string) {
  const players = [{ id: "248949", displayName: "Bukayo Saka", type: "player", sport: "soccer", defaultLeagueSlug: "eng.1", teamRelationships: [{ id: "359", displayName: "Arsenal" }] }];
  return { items: players.filter((p) => p.displayName.toLowerCase().includes(q.toLowerCase())) };
}

export function athlete(id: string) {
  if (id !== "248949") return null;
  return { athlete: { id, displayName: "Bukayo Saka", jersey: "7", age: 25, citizenship: "England", position: { displayName: "Forward" }, team: { id: "359", displayName: "Arsenal" } } };
}
