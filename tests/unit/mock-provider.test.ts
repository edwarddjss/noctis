import { describe, expect, it } from "vitest";
import { isLive } from "@/lib/domain";
import { CYCLE_MIN, MOCK_TEAMS, MockSportsDataProvider } from "@/lib/providers/sports/mock";
import { normalizeQuery } from "@/lib/providers/sports/types";
import { createMockStreamProvider } from "@/lib/providers/streams/mock";

/** A time where cycle position = 40 min (same anchor the e2e tests use). */
const FROZEN = new Date(Math.floor(Date.UTC(2026, 9, 18, 12) / (CYCLE_MIN * 60_000)) * CYCLE_MIN * 60_000 + 40 * 60_000);
const provider = new MockSportsDataProvider(() => FROZEN);

describe("MockSportsDataProvider", () => {
  it("searches teams case-insensitively", async () => {
    expect((await provider.searchTeams("aurora")).map((t) => t.id)).toEqual(["mt-aurora"]);
    expect(await provider.searchTeams("zzzz")).toEqual([]);
  });

  it("returns team details with a squad", async () => {
    const t = await provider.getTeam("mt-cobalt");
    expect(t?.name).toBe("Cobalt Rovers");
    expect(t?.squad.length).toBe(11);
    expect(await provider.getTeam("missing")).toBeNull();
  });

  it("finds players and their club", async () => {
    const [p] = await provider.searchPlayers("Varga");
    expect(p).toBeDefined();
    const d = await provider.getPlayer(p!.id);
    expect(d?.teamId).toMatch(/^mt-/);
  });

  it("produces deterministic live matches at a fixed time", async () => {
    const live = await provider.getLiveMatches();
    const ids = live.map((m) => m.id).sort();
    expect(ids).toEqual(["m-ch-r3-1", "m-ch-r3-2", "m-cup-qf-2", "m-pd-r3-1", "m-pd-r3-2", "m-pd-r3-3"]);
    expect(live.every((m) => isLive(m.status) && m.score.home !== null)).toBe(true);
    expect(live.find((m) => m.id === "m-pd-r3-3")?.status).toBe("halftime");
  });

  it("splits fixtures into next and last for a team", async () => {
    for (const team of MOCK_TEAMS.slice(0, 6)) {
      const next = await provider.getFixtures({ teamId: team.id, direction: "next", limit: 10 });
      const last = await provider.getFixtures({ teamId: team.id, direction: "last", limit: 10 });
      expect(next.every((m) => m.status !== "finished")).toBe(true);
      expect(last.every((m) => m.status === "finished")).toBe(true);
      expect(last.length).toBeGreaterThan(0);
      expect([...next, ...last].every((m) => m.home.id === team.id || m.away.id === team.id)).toBe(true);
    }
  });

  it("returns match details whose goal events match the score", async () => {
    const live = await provider.getLiveMatches();
    for (const m of live) {
      const d = await provider.getMatchDetails(m.id);
      const goals = d!.events.filter((e) => e.type === "goal");
      expect(goals.filter((g) => g.side === "home").length).toBe(d!.score.home);
      expect(goals.filter((g) => g.side === "away").length).toBe(d!.score.away);
    }
  });

  it("honours abort signals", async () => {
    const c = new AbortController();
    c.abort();
    await expect(provider.searchTeams("aur", { signal: c.signal })).rejects.toThrow();
  });
});

describe("mock stream provider", () => {
  const streams = createMockStreamProvider(() => FROZEN.getTime());
  it("has streams only for configured matches", async () => {
    expect(await streams.getAuthorizedStreamForMatch("m-pd-r3-1")).not.toBeNull();
    expect(await streams.getAuthorizedStreamForMatch("m-pd-r3-3")).toBeNull();
    const a = await streams.getAvailability(["m-pd-r3-1", "m-pd-r3-3"]);
    expect(a).toEqual({ "m-pd-r3-1": true, "m-pd-r3-3": false });
  });
  it("exposes captions and metadata", async () => {
    expect((await streams.getCaptions("m-pd-r3-1"))[0]?.srclang).toBe("en");
    expect((await streams.getPlaybackMetadata("m-pd-r3-1"))?.isDemo).toBe(true);
  });
});

describe("normalizeQuery", () => {
  it("strips unsafe characters and enforces length", () => {
    expect(normalizeQuery("  Real   Madrid ")).toBe("Real Madrid");
    expect(normalizeQuery("ab")).toBeNull();
    expect(normalizeQuery("<script>")).toBe("script");
    expect(normalizeQuery("x".repeat(41))).toBeNull();
    expect(normalizeQuery("São Paulo")).toBe("São Paulo");
  });
});
