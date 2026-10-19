import { describe, expect, it, vi } from "vitest";
import { redact } from "@/lib/log";
import { selectSource, type Capabilities } from "@/lib/playback/select-source";
import { ConfigStreamProvider } from "@/lib/providers/streams/config-provider";
import { StreamConfigSchema } from "@/lib/providers/streams/config-schema";
import { probeStreamUrl } from "@/lib/security/probe";
import { checkStreamUrl, isPrivateAddress, parseAllowlist } from "@/lib/security/stream-url";

const HOST = "streams.example.com";
const policy = { providerHosts: [HOST], globalAllowlist: [HOST] };

describe("checkStreamUrl", () => {
  it("accepts allowlisted https URLs", () => {
    expect(checkStreamUrl(`https://${HOST}/live/master.m3u8?token=abc`, policy)).toBeNull();
  });
  it.each([
    ["http://streams.example.com/a.m3u8", "https"],
    ["https://evil.example.net/a.m3u8", "allowedHosts"],
    ["https://user:pw@streams.example.com/a.m3u8", "credentials"],
    ["https://streams.example.com:8443/a.m3u8", "port"],
    ["https://127.0.0.1/a.m3u8", "IP"],
    ["javascript:alert(1)", "https"],
    ["/demo/x.m3u8", "absolute"],
  ])("rejects %s", (url, why) => {
    expect(checkStreamUrl(url, policy)).toMatch(new RegExp(why, "i"));
  });
  it("requires the deployment allowlist too", () => {
    expect(checkStreamUrl(`https://${HOST}/a.m3u8`, { providerHosts: [HOST], globalAllowlist: [] })).toMatch(/STREAM_HOST_ALLOWLIST/);
  });
  it("allows local demo media only in demo mode, without traversal", () => {
    expect(checkStreamUrl("/demo/hls-a/index.m3u8", { ...policy, allowLocalDemo: true })).toBeNull();
    expect(checkStreamUrl("/demo/../api/x", { ...policy, allowLocalDemo: true })).not.toBeNull();
  });
  it("parses allowlist env", () => {
    expect(parseAllowlist(" A.com, b.com ,,")).toEqual(["a.com", "b.com"]);
  });
});

describe("isPrivateAddress", () => {
  it.each(["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.5.4", "192.168.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])(
    "%s is private",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["93.184.216.34", "2606:4700::1111"])("%s is public", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("probeStreamUrl (SSRF)", () => {
  it("refuses hosts resolving to private IPs without fetching", async () => {
    const fetchImpl = vi.fn();
    const r = await probeStreamUrl(`https://${HOST}/a.m3u8`, "hls", policy, { resolve: async () => ["10.1.2.3"], fetchImpl });
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("re-checks redirect targets against the allowlist", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } }));
    const r = await probeStreamUrl(`https://${HOST}/a.m3u8`, "hls", policy, { resolve: async () => ["93.184.216.34"], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/IP/) });
  });
  it("accepts a real-looking playlist", async () => {
    const fetchImpl = vi.fn(async () => new Response("#EXTM3U\n#EXT-X-VERSION:3\n", { status: 200, headers: { "content-type": "application/vnd.apple.mpegurl" } }));
    const r = await probeStreamUrl(`https://${HOST}/a.m3u8`, "hls", policy, { resolve: async () => ["93.184.216.34"], fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(true);
  });
});

const baseConfig = {
  version: 1,
  providers: [{ id: "lic", name: "Licensed", allowedHosts: [HOST], airplayAllowed: false, rightsNote: "Under agreement" }],
  competitions: [{ competitionId: "c1", providerId: "lic" }],
  streams: [
    {
      matchId: "m1",
      competitionId: "c1",
      providerId: "lic",
      label: "Feed",
      sources: [{ url: `https://${HOST}/m1.m3u8`, type: "hls" }],
      availableFrom: "2026-01-01T00:00:00Z",
      availableUntil: "2026-01-01T03:00:00Z",
    },
  ],
};

describe("authorized stream config", () => {
  it("rejects streams for competitions the provider isn't authorized for", () => {
    const bad = { ...baseConfig, streams: [{ ...baseConfig.streams[0]!, competitionId: "other" }] };
    expect(StreamConfigSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects IP or port hosts in allowedHosts", () => {
    const bad = { ...baseConfig, providers: [{ ...baseConfig.providers[0]!, allowedHosts: ["10.0.0.1"] }] };
    expect(StreamConfigSchema.safeParse(bad).success).toBe(false);
  });
  it("only serves streams inside their availability window and on allowlisted hosts", async () => {
    const cfg = StreamConfigSchema.parse(baseConfig);
    const at = (iso: string) => new ConfigStreamProvider(cfg, { globalAllowlist: [HOST], now: () => Date.parse(iso) });
    expect(await at("2026-01-01T01:00:00Z").getAuthorizedStreamForMatch("m1")).toMatchObject({ airplayAllowed: false, isDemo: false });
    expect(await at("2025-12-31T23:00:00Z").getAuthorizedStreamForMatch("m1")).toBeNull();
    expect(await at("2026-01-01T04:00:00Z").getAuthorizedStreamForMatch("m1")).toBeNull();
    const noAllow = new ConfigStreamProvider(cfg, { globalAllowlist: [], now: () => Date.parse("2026-01-01T01:00:00Z") });
    expect(await noAllow.getAuthorizedStreamForMatch("m1")).toBeNull();
    expect(await at("2026-01-01T01:00:00Z").getAuthorizedStreamForMatch("unknown")).toBeNull();
  });
});

describe("selectSource", () => {
  const caps = (over: Partial<Record<string, string>>, mse = false): Capabilities => ({
    canPlayType: (m) => over[m] ?? "",
    mseTypeSupported: () => mse,
  });
  const sources = [
    { url: "a.m3u8", type: "hls" as const },
    { url: "a.webm", type: "webm" as const },
  ];
  it("prefers native HLS (Safari / AirPlay)", () => {
    expect(selectSource(sources, caps({ "application/vnd.apple.mpegurl": "maybe" }))).toMatchObject({ engine: "native", index: 0 });
  });
  it("uses hls.js when MSE can decode H.264", () => {
    expect(selectSource(sources, caps({}, true))).toMatchObject({ engine: "hlsjs", index: 0 });
  });
  it("falls back to the next playable source", () => {
    expect(selectSource(sources, caps({ 'video/webm; codecs="vp8, opus"': "probably" }))).toMatchObject({ engine: "native", index: 1 });
  });
  it("returns null when nothing is playable", () => {
    expect(selectSource(sources, caps({}))).toBeNull();
  });
});

describe("log redaction", () => {
  it("removes secrets and URL query strings", () => {
    const out = redact({ apiKey: "s3cret", headers: { authorization: "Bearer x", cookie: "c" }, url: "https://h.example.com/p?token=abc", note: "https://h.example.com/q?sig=1" });
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/s3cret|Bearer|token=abc|sig=1/);
    expect(text).toContain("https://h.example.com/p");
  });
});
