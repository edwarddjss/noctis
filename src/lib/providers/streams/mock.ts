/**
 * MOCK stream provider. Points a few fictional mock matches at locally
 * generated test-pattern media in /public/demo (created by
 * scripts/make-demo-media.sh with ffmpeg's synthetic sources — no third-party
 * content). One entry is deliberately broken to exercise playback failure.
 */
import type { StreamConfig } from "./config-schema";
import { StreamConfigSchema } from "./config-schema";
import { ConfigStreamProvider } from "./config-provider";

const DEMO_A = [
  { url: "/demo/hls-a/index.m3u8", type: "hls" as const },
  { url: "/demo/demo-a.webm", type: "webm" as const },
];
const DEMO_B = [
  { url: "/demo/hls-b/index.m3u8", type: "hls" as const },
  { url: "/demo/demo-b.webm", type: "webm" as const },
];

export const MOCK_STREAM_CONFIG: StreamConfig = StreamConfigSchema.parse({
  version: 1,
  providers: [
    {
      id: "mock-demo",
      name: "MatchNest Demo Feed (mock)",
      allowedHosts: ["demo.matchnest.invalid"],
      airplayAllowed: true,
      rightsNote: "Synthetic test-pattern video generated locally for development. Not a real broadcast.",
    },
  ],
  competitions: [
    { competitionId: "mock-pd", providerId: "mock-demo" },
    { competitionId: "mock-ch", providerId: "mock-demo" },
    { competitionId: "mock-cup", providerId: "mock-demo" },
  ],
  streams: [
    {
      matchId: "m-pd-r3-1",
      competitionId: "mock-pd",
      providerId: "mock-demo",
      label: "Demo feed A",
      sources: DEMO_A,
      captions: [{ src: "/demo/demo-a.en.vtt", srclang: "en", label: "English (demo)", default: false }],
    },
    { matchId: "m-pd-r3-2", competitionId: "mock-pd", providerId: "mock-demo", label: "Demo feed B", sources: DEMO_B },
    {
      matchId: "m-ch-r3-1",
      competitionId: "mock-ch",
      providerId: "mock-demo",
      label: "Demo feed (intentionally broken)",
      sources: [
        { url: "/demo/missing/index.m3u8", type: "hls" },
        { url: "/demo/missing/feed.webm", type: "webm" },
      ],
    },
    { matchId: "m-cup-qf-1", competitionId: "mock-cup", providerId: "mock-demo", label: "Demo feed A", sources: DEMO_A },
    { matchId: "m-cup-qf-2", competitionId: "mock-cup", providerId: "mock-demo", label: "Demo feed B", sources: DEMO_B },
  ],
});

export function createMockStreamProvider(now?: () => number) {
  return new ConfigStreamProvider(MOCK_STREAM_CONFIG, { globalAllowlist: [], demo: true, now });
}
