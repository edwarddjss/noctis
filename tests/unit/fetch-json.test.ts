import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { TtlCache } from "@/lib/http/cache";
import { backoffDelay, fetchJson, parseRetryAfter } from "@/lib/http/fetch-json";

const schema = z.object({ v: z.number() });
const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers });

describe("fetchJson", () => {
  it("honours Retry-After on 429", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({}, 429, { "retry-after": "2" })).mockResolvedValueOnce(json({ v: 1 }));
    expect(await fetchJson("https://x.test/a", { schema, fetchImpl, sleep })).toEqual({ v: 1 });
    expect(sleep).toHaveBeenCalledWith(2000, undefined);
  });

  it("gives up after the configured retries", async () => {
    const fetchImpl = vi.fn(async () => json({}, 500));
    await expect(fetchJson("https://x.test/a", { schema, fetchImpl, sleep: async () => {}, retries: 2 })).rejects.toMatchObject({ code: "upstream" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry 4xx", async () => {
    const fetchImpl = vi.fn(async () => json({}, 401));
    await expect(fetchJson("https://x.test/a", { schema, fetchImpl, sleep: async () => {} })).rejects.toMatchObject({ code: "unauthorized" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("aborts", async () => {
    const c = new AbortController();
    c.abort();
    await expect(fetchJson("https://x.test/a", { schema, fetchImpl: vi.fn(), signal: c.signal })).rejects.toMatchObject({ code: "aborted" });
  });

  it("serves stale cache when upstream fails", async () => {
    let t = 0;
    const cache = new TtlCache(10, () => t);
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ v: 7 })).mockResolvedValue(json({}, 500));
    const opts = { schema, fetchImpl, cache, cacheKey: "k", ttlMs: 1000, sleep: async () => {}, retries: 0 };
    expect(await fetchJson("https://x.test/a", opts)).toEqual({ v: 7 });
    t = 5000; // expired but inside stale window
    expect(await fetchJson("https://x.test/a", opts)).toEqual({ v: 7 });
  });

  it("dedupes concurrent requests for the same key", async () => {
    const fetchImpl = vi.fn(async () => json({ v: 1 }));
    const cache = new TtlCache();
    await Promise.all([1, 2, 3].map(() => fetchJson("https://x.test/a", { schema, fetchImpl, cache, cacheKey: "same" })));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("backoff helpers", () => {
  it("grows exponentially with jitter and caps", () => {
    expect(backoffDelay(0, 300, 5000, () => 0)).toBe(150);
    expect(backoffDelay(3, 300, 5000, () => 1)).toBe(2400);
    expect(backoffDelay(10, 300, 5000, () => 1)).toBe(5000);
  });
  it("parses Retry-After seconds and dates", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4000)).toBe(6000);
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe("shared in-flight requests", () => {
  it("one caller aborting does not cancel the request for others", async () => {
    let release!: (r: Response) => void;
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeDefined();
      return new Promise<Response>((r) => (release = r));
    });
    const cache = new TtlCache();
    const a = new AbortController();
    const opts = { schema, fetchImpl: fetchImpl as unknown as typeof fetch, cache, cacheKey: "shared" };
    const first = fetchJson("https://x.test/s", { ...opts, signal: a.signal });
    const second = fetchJson("https://x.test/s", opts);
    a.abort();
    await expect(first).rejects.toMatchObject({ code: "aborted" });
    release(json({ v: 42 }));
    await expect(second).resolves.toEqual({ v: 42 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
