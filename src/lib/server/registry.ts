/** Server-only provider wiring. Reads env vars; never imported by client code. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ProviderError } from "../errors";
import { log } from "../log";
import { ApiFootballProvider } from "../providers/sports/api-football";
import { MockSportsDataProvider } from "../providers/sports/mock";
import type { SportsDataProvider } from "../providers/sports/types";
import { ConfigStreamProvider } from "../providers/streams/config-provider";
import { StreamConfigSchema } from "../providers/streams/config-schema";
import { createMockStreamProvider } from "../providers/streams/mock";
import type { StreamProvider } from "../providers/streams/types";
import { parseAllowlist } from "../security/stream-url";

if (typeof window !== "undefined") throw new Error("registry is server-only");

let sports: SportsDataProvider | undefined;
let streams: StreamProvider | undefined;

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

/** Mock clock override for deterministic demos and e2e tests (mock provider only). */
function mockNow(): () => Date {
  const frozen = process.env.MOCK_FREEZE_TIME;
  if (!frozen) return () => new Date();
  const at = Date.parse(frozen);
  if (!Number.isFinite(at)) return () => new Date();
  const startedAt = Date.now();
  // time keeps moving from the frozen point so match minutes still advance
  return () => new Date(at + (Date.now() - startedAt));
}

export function getSportsProvider(): SportsDataProvider {
  if (sports) return sports;
  const kind = process.env.SPORTS_PROVIDER ?? "mock";
  if (kind === "api-football") {
    sports = new ApiFootballProvider({
      apiKey: process.env.API_FOOTBALL_KEY ?? "",
      baseUrl: process.env.API_FOOTBALL_BASE_URL,
      ttl: {
        live: num(process.env.CACHE_TTL_LIVE, 20),
        fixtures: num(process.env.CACHE_TTL_FIXTURES, 300),
        static: num(process.env.CACHE_TTL_STATIC, 86_400),
      },
    });
  } else if (kind === "mock") {
    sports = new MockSportsDataProvider(mockNow());
  } else {
    throw new ProviderError("not_configured", `Unknown SPORTS_PROVIDER "${kind}"`);
  }
  log.info("registry.sports_provider", { provider: sports.id });
  return sports;
}

export function getStreamProvider(): StreamProvider {
  if (streams) return streams;
  const kind = process.env.STREAM_PROVIDER ?? "mock";
  if (kind === "config") {
    const file = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STREAM_CONFIG_PATH ?? "./config/authorized-streams.json");
    const parsed = StreamConfigSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success) {
      log.error("registry.stream_config_invalid", { issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      throw new ProviderError("not_configured", "Authorized stream configuration is invalid");
    }
    streams = new ConfigStreamProvider(parsed.data, { globalAllowlist: parseAllowlist(process.env.STREAM_HOST_ALLOWLIST) });
  } else if (kind === "mock") {
    const n = mockNow();
    streams = createMockStreamProvider(() => n().getTime());
  } else {
    throw new ProviderError("not_configured", `Unknown STREAM_PROVIDER "${kind}"`);
  }
  log.info("registry.stream_provider", { provider: streams.id });
  return streams;
}

/** Test hook. */
export function resetRegistry() {
  sports = undefined;
  streams = undefined;
}
