/** Server-only provider wiring. Reads env vars; never imported by client code. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ProviderError } from "../errors";
import { log } from "../log";
import { ApiFootballProvider } from "../providers/sports/api-football";
import { EspnProvider } from "../providers/sports/espn";
import type { SportsDataProvider } from "../providers/sports/types";
import { ConfigStreamProvider } from "../providers/streams/config-provider";
import { StreamConfigSchema } from "../providers/streams/config-schema";
import { NoStreamProvider } from "../providers/streams/none";
import type { StreamProvider } from "../providers/streams/types";
import { parseAllowlist } from "../security/stream-url";

if (typeof window !== "undefined") throw new Error("registry is server-only");

let sports: SportsDataProvider | undefined;
let streams: StreamProvider | undefined;

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export function getSportsProvider(): SportsDataProvider {
  if (sports) return sports;
  const kind = process.env.SPORTS_PROVIDER ?? "espn";
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
  } else if (kind === "espn") {
    sports = new EspnProvider({
      baseUrl: process.env.ESPN_BASE_URL,
      webBaseUrl: process.env.ESPN_WEB_BASE_URL,
      ttl: {
        live: num(process.env.CACHE_TTL_LIVE, 30),
        fixtures: num(process.env.CACHE_TTL_FIXTURES, 300),
        static: num(process.env.CACHE_TTL_STATIC, 86_400),
      },
    });
  } else {
    throw new ProviderError("not_configured", `Unknown SPORTS_PROVIDER "${kind}"`);
  }
  log.info("registry.sports_provider", { provider: sports.id });
  return sports;
}

export function getStreamProvider(): StreamProvider {
  if (streams) return streams;
  const kind = process.env.STREAM_PROVIDER ?? "none";
  if (kind === "config") {
    const file = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STREAM_CONFIG_PATH ?? "./config/authorized-streams.json");
    const parsed = StreamConfigSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.success) {
      log.error("registry.stream_config_invalid", { issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      throw new ProviderError("not_configured", "Authorized stream configuration is invalid");
    }
    streams = new ConfigStreamProvider(parsed.data, {
      globalAllowlist: parseAllowlist(process.env.STREAM_HOST_ALLOWLIST),
      // test/dev only: lets the config point at same-origin /demo/ test media
      allowLocalMedia: process.env.STREAM_ALLOW_LOCAL_MEDIA === "1",
    });
  } else if (kind === "none") {
    streams = new NoStreamProvider();
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
