import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ConfigStreamProvider } from "@/lib/providers/streams/config-provider";
import { StreamConfigSchema } from "@/lib/providers/streams/config-schema";
import { NoStreamProvider } from "@/lib/providers/streams/none";

describe("stream providers", () => {
  it("defaults to no streams anywhere", async () => {
    const p = new NoStreamProvider();
    expect(await p.getAuthorizedStreamForMatch()).toBeNull();
    expect(await p.getAvailability(["a", "b"])).toEqual({ a: false, b: false });
  });

  it("only allows local test media when explicitly enabled", async () => {
    const cfg = StreamConfigSchema.parse(JSON.parse(readFileSync("tests/fixtures/streams.e2e.json", "utf8")));
    const off = new ConfigStreamProvider(cfg, { globalAllowlist: [] });
    expect(await off.getAuthorizedStreamForMatch("eng.1.900001")).toBeNull();
    const on = new ConfigStreamProvider(cfg, { globalAllowlist: [], allowLocalMedia: true });
    expect(await on.getAuthorizedStreamForMatch("eng.1.900001")).toMatchObject({ isDemo: true, captions: [{ srclang: "en" }] });
    expect(await on.getAvailability(["eng.1.900001", "eng.1.900002"])).toEqual({ "eng.1.900001": true, "eng.1.900002": false });
  });

  it("the shipped example config is valid", () => {
    expect(StreamConfigSchema.safeParse(JSON.parse(readFileSync("config/authorized-streams.example.json", "utf8"))).success).toBe(true);
  });
});
