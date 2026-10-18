"use client";
/**
 * Attaches one authorized source to a <video> element using native playback
 * or hls.js, and reports normalized fatal errors. No request rewriting, token
 * handling or header injection happens here: the browser fetches exactly the
 * URL the server authorized.
 */
import type { SelectedSource } from "./select-source";

export type FatalKind = "network" | "unauthorized" | "unavailable" | "decode" | "unsupported";

export interface EngineHandle {
  destroy(): void;
  /** Re-attempt loading after a network failure. */
  reload(): void;
  /** hls.js only: stop/resume segment downloads while paused. */
  stopLoad?(): void;
  startLoad?(): void;
}

export interface EngineCallbacks {
  onFatal(kind: FatalKind): void;
}

export async function attachSource(video: HTMLVideoElement, sel: SelectedSource, cb: EngineCallbacks): Promise<EngineHandle> {
  if (sel.engine === "native") {
    const onError = () => {
      const code = video.error?.code;
      // MEDIA_ERR_NETWORK=2, DECODE=3, SRC_NOT_SUPPORTED=4 (also what a 404/403 manifest yields natively)
      cb.onFatal(code === 2 ? "network" : code === 3 ? "decode" : "unavailable");
    };
    video.addEventListener("error", onError);
    video.src = sel.source.url;
    video.load();
    return {
      destroy() {
        video.removeEventListener("error", onError);
        video.removeAttribute("src");
        video.load();
      },
      reload() {
        const t = video.currentTime;
        video.src = sel.source.url;
        video.load();
        if (Number.isFinite(t) && t > 0) video.currentTime = t;
      },
    };
  }

  const { default: Hls } = await import("hls.js");
  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: true,
    backBufferLength: 30,
    // keep hls.js' own retries modest; MatchNest handles reconnection above it
    manifestLoadPolicy: { default: { maxTimeToFirstByteMs: 10_000, maxLoadTimeMs: 15_000, timeoutRetry: { maxNumRetry: 1, retryDelayMs: 0, maxRetryDelayMs: 0 }, errorRetry: { maxNumRetry: 1, retryDelayMs: 1000, maxRetryDelayMs: 4000 } } },
  });
  let mediaRecoveries = 0;
  hls.on(Hls.Events.ERROR, (_evt, data) => {
    if (!data.fatal) return;
    const status = (data.response as { code?: number } | undefined)?.code;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      if (status === 401 || status === 403) return cb.onFatal("unauthorized");
      if (status === 404 || status === 410) return cb.onFatal("unavailable");
      return cb.onFatal("network");
    }
    if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
      mediaRecoveries++;
      if (mediaRecoveries === 2) hls.swapAudioCodec();
      hls.recoverMediaError();
      return;
    }
    if (data.type === Hls.ErrorTypes.KEY_SYSTEM_ERROR) return cb.onFatal("unsupported");
    cb.onFatal("decode");
  });
  hls.loadSource(sel.source.url);
  hls.attachMedia(video);
  return {
    destroy() {
      hls.destroy();
    },
    reload() {
      // after a fatal manifest failure there are no levels; reload from scratch
      if (!hls.levels?.length) hls.loadSource(sel.source.url);
      else {
        hls.stopLoad();
        hls.startLoad();
      }
    },
    stopLoad: () => hls.stopLoad(),
    startLoad: () => hls.startLoad(),
  };
}
