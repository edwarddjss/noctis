import type { StreamSource } from "../providers/streams/types";

export type PlaybackEngine = "native" | "hlsjs";

export interface Capabilities {
  canPlayType(mime: string): string; // "", "maybe", "probably"
  mseTypeSupported(mime: string): boolean;
}

export interface SelectedSource {
  source: StreamSource;
  engine: PlaybackEngine;
  index: number;
}

const HLS_MIME = "application/vnd.apple.mpegurl";
const H264_AAC = 'video/mp4; codecs="avc1.4d401e,mp4a.40.2"';

/**
 * Choose the first source this browser can play, preferring native playback
 * (Safari HLS is required for AirPlay; MSE-backed playback can't be AirPlayed).
 * hls.js is used only where native HLS is absent but MSE can decode H.264/AAC.
 */
export function selectSource(sources: StreamSource[], caps: Capabilities, startAt = 0): SelectedSource | null {
  for (let i = startAt; i < sources.length; i++) {
    const s = sources[i]!;
    if (s.type === "hls") {
      if (caps.canPlayType(HLS_MIME)) return { source: s, engine: "native", index: i };
      if (caps.mseTypeSupported(H264_AAC)) return { source: s, engine: "hlsjs", index: i };
    } else if (s.type === "mp4") {
      if (caps.canPlayType("video/mp4")) return { source: s, engine: "native", index: i };
    } else if (s.type === "webm") {
      if (caps.canPlayType('video/webm; codecs="vp8, opus"') || caps.canPlayType("video/webm")) return { source: s, engine: "native", index: i };
    }
  }
  return null;
}

export function browserCapabilities(video: HTMLVideoElement): Capabilities {
  const MS: typeof MediaSource | undefined =
    typeof window !== "undefined" ? (window.MediaSource ?? (window as unknown as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource) : undefined;
  return {
    canPlayType: (m) => video.canPlayType(m),
    mseTypeSupported: (m) => Boolean(MS && typeof MS.isTypeSupported === "function" && MS.isTypeSupported(m)),
  };
}
