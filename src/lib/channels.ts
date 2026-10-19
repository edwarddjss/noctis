import type { StreamSource } from "./providers/streams/types";

/** Curated public channel feeds, not a mapping of fixtures to broadcasters.
 * Verified manifests and segments on 2026-10-19. Sources: iptv-org/iptv.
 * No captured credentials, provider HTML, or token renewal is involved.
 */
export const LIVE_CHANNELS: { id: string; name: string; description: string; sources: StreamSource[] }[] = [
  { id: "golazo", name: "CBS Sports Golazo Network", description: "Football coverage and selected live matches · English", sources: [{ type: "hls", url: "https://dai.google.com/linear/hls/event/7f3Wv6f7QEKfQna22jHqLQ/master.m3u8" }] },
  { id: "bein-xtra", name: "beIN SPORTS XTRA", description: "Sports coverage and selected live matches · English", sources: [{ type: "hls", url: "https://bein-xtra-bein.amagi.tv/playlist.m3u8" }] },
  { id: "africa24", name: "Africa 24 Sport", description: "African sports coverage · French", sources: [{ type: "hls", url: "https://africa24.vedge.infomaniak.com/livecast/ik:africa24sport/manifest.m3u8" }] },
];

// CDN subdomains can rotate between playlist refreshes. Only media/connect
// permissions use these origins; script and frame permissions stay unchanged.
export const CHANNEL_MEDIA_ORIGINS = [
  "https://dai.google.com", "https://*.airspace-cdn.cbsivideo.com",
  "https://bein-xtra-bein.amagi.tv", "https://*.vedge.infomaniak.com",
];
