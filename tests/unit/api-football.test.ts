import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/lib/http/cache";
import { ApiFootballProvider, classifyErrors, mapStatus } from "@/lib/providers/sports/api-football";

// Fixture payloads shaped like the documented API-Football v3 responses (values are made up).
const fixtureItem = (over: Record<string, unknown> = {}) => ({
  fixture: { id: 1001, date: "2026-10-18T15:00:00+00:00", venue: { name: "Test Ground" }, status: { long: "First Half", short: "1H", elapsed: 23, extra: null } },
  league: { id: 99, name: "Test League", country: "Testland", logo: "https://media.api-sports.io/x.png", season: 2026, round: "Regular Season - 8" },
  teams: { home: { id: 1, name: "Home FC", logo: null }, away: { id: 2, name: "Away FC", logo: null } },
  goals: { home: 1, away: 0 },
  events: [{ time: { elapsed: 12, extra: null }, team: { id: 1 }, player: { name: "Scorer" }, type: "Goal", detail: "Normal Goal" }],
  ...over,
});

const envelope = (response: unknown[], extra: Record<string, unknown> = {}) => ({ get: "x", parameters: {}, errors: [], results: response.length, response, ...extra });

function setup(responses: (() => Response)[]) {
  const fetchImpl = vi.fn(async () => responses.shift()!());
  const provider = new ApiFootballProvider({ apiKey: "test-key", fetchImpl: fetchImpl as unknown as typeof fetch, cache: new TtlCache(), sleep: async () => {} });
  return { provider, fetchImpl };
}
const ok = (body: unknown, headers: Record<string, string> = {}) => () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });

describe("ApiFootballProvider", () => {
  it("requires an API key", () => {
    expect(() => new ApiFootballProvider({ apiKey: "" })).toThrow(/API_FOOTBALL_KEY/);
  });

  it("sends the key only as a header and maps live fixtures", async () => {
    const { provider, fetchImpl } = setup([ok(envelope([fixtureItem()]))]);
    const [m] = await provider.getLiveMatches();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://v3.football.api-sports.io/fixtures?live=all");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-apisports-key"]).toBe("test-key");
    expect(m).toMatchObject({ id: "1001", status: "live", minute: 23, statusLabel: "23'", score: { home: 1, away: 0 }, competition: { id: "99", name: "Test League" } });
  });

  it("maps match details with events", async () => {
    const { provider } = setup([ok(envelope([fixtureItem()]))]);
    const d = await provider.getMatchDetails("1001");
    expect(d?.events[0]).toMatchObject({ type: "goal", side: "home", player: "Scorer", minute: 12 });
  });

  it("drops malformed items instead of failing the whole list", async () => {
    const { provider } = setup([ok(envelope([fixtureItem(), { fixture: "broken" }]))]);
    expect(await provider.getLiveMatches()).toHaveLength(1);
  });

  it("rejects responses that fail envelope validation", async () => {
    const { provider } = setup([ok({ nope: true }), ok({ nope: true }), ok({ nope: true })]);
    await expect(provider.getLiveMatches()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("searches teams and builds fixtures queries", async () => {
    const { provider, fetchImpl } = setup([
      ok(envelope([{ team: { id: 33, name: "Example United", code: "EXU", country: "Testland", founded: 1900, national: false, logo: null }, venue: { name: "Park" } }])),
      ok(envelope([fixtureItem()])),
    ]);
    const teams = await provider.searchTeams("Example");
    expect(teams[0]).toMatchObject({ id: "33", shortName: "EXU" });
    await provider.getFixtures({ teamId: "33", direction: "next", limit: 3 });
    expect((fetchImpl.mock.calls[1] as unknown as [string])[0]).toBe("https://v3.football.api-sports.io/fixtures?next=3&team=33");
  });

  it("retries 5xx with backoff then succeeds", async () => {
    const { provider, fetchImpl } = setup([() => new Response("", { status: 503 }), ok(envelope([fixtureItem()]))]);
    expect(await provider.getLiveMatches()).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry provider-level errors and classifies them", async () => {
    const { provider, fetchImpl } = setup([ok(envelope([], { errors: { token: "Error/Missing application key" } }))]);
    await expect(provider.getLiveMatches()).rejects.toMatchObject({ code: "unauthorized" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops calling upstream after the daily quota is exhausted", async () => {
    const { provider, fetchImpl } = setup([ok(envelope([fixtureItem()]), { "x-ratelimit-requests-remaining": "0" })]);
    await provider.getLiveMatches();
    await expect(provider.getFixtures({ teamId: "1", direction: "next" })).rejects.toMatchObject({ code: "rate_limited" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("caches responses", async () => {
    const { provider, fetchImpl } = setup([ok(envelope([fixtureItem()]))]);
    await provider.getLiveMatches();
    await provider.getLiveMatches();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("mapping helpers", () => {
  it("maps status codes", () => {
    expect(mapStatus("NS")).toBe("scheduled");
    expect(mapStatus("2H")).toBe("live");
    expect(mapStatus("HT")).toBe("halftime");
    expect(mapStatus("PEN")).toBe("finished");
    expect(mapStatus("PST")).toBe("postponed");
    expect(mapStatus("ABD")).toBe("cancelled");
    expect(mapStatus("???")).toBe("unknown");
  });
  it("classifies error payloads", () => {
    expect(classifyErrors([])).toBeNull();
    expect(classifyErrors({})).toBeNull();
    expect(classifyErrors({ requests: "You have reached the request limit for the day" })?.code).toBe("rate_limited");
    expect(classifyErrors({ plan: "Free plans do not have access to this parameter." })?.code).toBe("plan_restricted");
    expect(classifyErrors({ season: "bad" })?.code).toBe("upstream");
  });
});
