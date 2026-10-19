import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/lib/http/cache";
import { EspnProvider, mapEspnStatus, mapEvent } from "@/lib/providers/sports/espn";
import { makeId, parseId } from "@/lib/providers/sports/espn-leagues";
import * as F from "../fixtures/espn.ts";

function router(url: string): unknown {
  const u = new URL(url);
  const p = u.pathname;
  let m: RegExpExecArray | null;
  if ((m = /\/soccer\/([^/]+)\/scoreboard$/.exec(p))) return F.scoreboard(m[1]!);
  if ((m = /\/soccer\/([^/]+)\/teams$/.exec(p))) return F.teamsList(m[1]!);
  if ((m = /\/teams\/(\d+)$/.exec(p))) return F.teamDetail(m[1]!);
  if ((m = /\/teams\/(\d+)\/roster$/.exec(p))) return F.roster(m[1]!);
  if ((m = /\/teams\/(\d+)\/schedule$/.exec(p))) return F.schedule(m[1]!, u.searchParams.get("fixture") === "true");
  if (p.endsWith("/summary")) return F.summary(u.searchParams.get("event") ?? "");
  if ((m = /\/apis\/v2\/sports\/soccer\/([^/]+)\/standings$/.exec(p))) return F.standings(m[1]!);
  if (p.endsWith("/search")) return F.search(u.searchParams.get("query") ?? "");
  if ((m = /\/athletes\/(\d+)$/.exec(p))) return F.athlete(m[1]!);
  return null;
}

function setup(overrides: { fail?: RegExp } = {}) {
  const fetchImpl = vi.fn(async (url: string) => {
    if (overrides.fail?.test(url)) return new Response("", { status: 503 });
    const body = router(url);
    return new Response(JSON.stringify(body ?? { code: 404 }), { status: body ? 200 : 404 });
  });
  const provider = new EspnProvider({
    baseUrl: "https://espn.test",
    webBaseUrl: "https://web.espn.test",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    cache: new TtlCache(),
    sleep: async () => {},
  });
  return { provider, fetchImpl };
}

describe("composite ids", () => {
  it("round-trips league + id, including dotted league slugs", () => {
    expect(parseId(makeId("eng.1", 359))).toEqual({ league: "eng.1", id: "359" });
    expect(parseId("uefa.europa.conf.12345")).toEqual({ league: "uefa.europa.conf", id: "12345" });
    expect(parseId("359")).toBeNull();
    expect(parseId("eng.1.abc")).toBeNull();
  });
});

describe("status mapping", () => {
  it.each([
    [{ name: "STATUS_SCHEDULED", state: "pre" }, "scheduled"],
    [{ name: "STATUS_FIRST_HALF", state: "in" }, "live"],
    [{ name: "STATUS_HALFTIME", state: "in" }, "halftime"],
    [{ name: "STATUS_FULL_TIME", state: "post" }, "finished"],
    [{ name: "STATUS_FINAL_PEN", state: "post" }, "finished"],
    [{ name: "STATUS_POSTPONED", state: "post" }, "postponed"],
    [{ name: "STATUS_CANCELED", state: "post" }, "cancelled"],
    [{ name: "STATUS_ABANDONED", state: "post" }, "cancelled"],
  ] as const)("%o → %s", (type, expected) => expect(mapEspnStatus(type)).toBe(expected));

  it("ignores malformed events", () => {
    expect(mapEvent({ id: 1 }, "eng.1")).toBeNull();
    expect(mapEvent({ id: "1", date: "2026-01-01T00:00Z", competitions: [{ competitors: [] }] }, "eng.1")).toBeNull();
  });
});

describe("EspnProvider", () => {
  it("collects live matches across leagues (live + half-time only)", async () => {
    const { provider } = setup();
    const live = await provider.getLiveMatches();
    expect(live.map((m) => m.id).sort()).toEqual(["eng.1.900001", "eng.1.900002", "eng.1.900003", "esp.1.910001"]);
    const ars = live.find((m) => m.id === "eng.1.900001")!;
    expect(ars).toMatchObject({
      status: "live",
      minute: 67,
      statusLabel: "67'",
      home: { id: "eng.1.359", name: "Arsenal" },
      away: { name: "Chelsea" },
      score: { home: 2, away: 1 },
      competition: { id: "eng.1", name: "Premier League", country: "England" },
    });
    expect(ars.home.crestUrl).toContain("a.espncdn.com");
    expect(live.find((m) => m.id === "eng.1.900002")?.statusLabel).toBe("HT");
  });

  it("still returns live matches when some leagues fail", async () => {
    const { provider } = setup({ fail: /esp\.1/ });
    const live = await provider.getLiveMatches();
    expect(live.some((m) => m.id.startsWith("eng.1."))).toBe(true);
    expect(live.some((m) => m.id.startsWith("esp.1."))).toBe(false);
  });

  it("searches teams across league team lists, de-duplicated", async () => {
    const { provider } = setup();
    expect((await provider.searchTeams("arsenal")).map((t) => t.id)).toEqual(["eng.1.359"]);
    const manchester = await provider.searchTeams("manchester");
    expect(manchester.map((t) => t.name).sort()).toEqual(["Manchester City", "Manchester United"]);
    expect((await provider.searchTeams("barcelona"))[0]).toMatchObject({ id: "esp.1.83", country: "Spain" });
  });

  it("returns team details with squad", async () => {
    const { provider } = setup();
    const t = await provider.getTeam("eng.1.359");
    expect(t).toMatchObject({ name: "Arsenal", venue: "Arsenal Stadium" });
    expect(t?.squad.map((p) => p.name)).toContain("Bukayo Saka");
    expect(t?.squad[0]).toMatchObject({ id: "eng.1.248949", number: 7, teamId: "eng.1.359" });
    expect(await provider.getTeam("eng.1.999999")).toBeNull();
    expect(await provider.getTeam("bogus")).toBeNull();
  });

  it("splits a team's schedule into next and last (object-style scores)", async () => {
    const { provider } = setup();
    const next = await provider.getFixtures({ teamId: "eng.1.359", direction: "next" });
    const last = await provider.getFixtures({ teamId: "eng.1.359", direction: "last" });
    expect(next.map((m) => m.id)).toEqual(["eng.1.900001", "eng.1.900010"]);
    expect(next[0]!.score).toEqual({ home: 2, away: 1 });
    expect(last.map((m) => m.id)).toEqual(["eng.1.900011"]);
    expect(last[0]!.score).toEqual({ home: 3, away: 0 });
  });

  it("gets competition fixtures from a date-ranged scoreboard", async () => {
    const { provider, fetchImpl } = setup();
    const next = await provider.getFixtures({ competitionId: "eng.1", direction: "next" });
    expect(next.every((m) => m.status !== "finished")).toBe(true);
    expect(String(fetchImpl.mock.calls.at(-1)![0])).toMatch(/scoreboard\?dates=\d{8}-\d{8}&limit=200$/);
    const last = await provider.getFixtures({ competitionId: "eng.1", direction: "last" });
    expect(last.map((m) => m.id)).toEqual(["eng.1.900005"]);
  });

  it("maps match details with key events", async () => {
    const { provider } = setup();
    const d = await provider.getMatchDetails("eng.1.900001");
    expect(d?.events.map((e) => [e.minute, e.side, e.player])).toEqual([
      [12, "home", "Bukayo Saka"],
      [40, "away", "Cole Palmer"],
      [58, "home", "Martin Ødegaard"],
    ]);
    expect(d?.venue).toBe("Arsenal Stadium");
    expect(await provider.getMatchDetails("eng.1.1")).toBeNull();
  });

  it("maps line-ups with formations, starters and substitutes", async () => {
    const { provider } = setup();
    const d = await provider.getMatchDetails("eng.1.900001");
    expect(d?.lineups?.home).toMatchObject({ formation: "4-3-3", starters: [{ name: "David Raya", number: 22, position: "G" }, { name: "Bukayo Saka" }], substitutes: [{ name: "Leandro Trossard" }] });
    expect(d?.lineups?.away?.formation).toBe("4-2-3-1");
    expect((await provider.getMatchDetails("eng.1.900002"))?.lineups).toBeUndefined();
  });

  it("lists every match on a day across leagues, in kickoff order", async () => {
    const { provider, fetchImpl } = setup();
    const day = await provider.getMatchesByDate("2026-10-18");
    expect(day.map((m) => m.id)).toHaveLength(6);
    expect(day.map((m) => m.kickoff)).toEqual([...day.map((m) => m.kickoff)].sort());
    expect(day.some((m) => m.status === "scheduled") && day.some((m) => m.status === "finished")).toBe(true);
    expect(fetchImpl.mock.calls.some((c) => /scoreboard\?dates=20261018&limit=200$/.test(String(c[0])))).toBe(true);
  });

  it("links a team to its league", async () => {
    const { provider } = setup();
    expect((await provider.getTeam("esp.1.83"))?.competitionId).toBe("esp.1");
  });

  it("maps standings", async () => {
    const { provider } = setup();
    const [table] = await provider.getStandings("eng.1");
    expect(table!.rows[0]).toMatchObject({ rank: 1, team: { name: "Arsenal" }, played: 8, won: 6, drawn: 2, lost: 0, goalDifference: 13, points: 20, note: "Champions League" });
    expect(await provider.getStandings("esp.2")).toEqual([]);
  });

  it("searches players and resolves their club", async () => {
    const { provider } = setup();
    const [p] = await provider.searchPlayers("saka");
    expect(p).toMatchObject({ id: "eng.1.248949", name: "Bukayo Saka", teamId: "eng.1.359", teamName: "Arsenal" });
    const d = await provider.getPlayer("eng.1.248949");
    expect(d).toMatchObject({ position: "Forward", nationality: "England", teamId: "eng.1.359" });
  });

  it("lists covered competitions in priority order and filters them", async () => {
    const { provider } = setup();
    const all = await provider.getCompetitions();
    expect(all[0]!.id).toBe("uefa.champions");
    expect(all.slice(0, 3).map((c) => c.name)).toContain("Premier League");
    expect((await provider.getCompetitions({ search: "spain" })).map((c) => c.id)).toContain("esp.1");
  });

  it("caches upstream calls", async () => {
    const { provider, fetchImpl } = setup();
    await provider.getStandings("eng.1");
    await provider.getStandings("eng.1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
