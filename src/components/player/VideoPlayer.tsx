"use client";
/**
 * Reusable player for AUTHORIZED sources only. It plays exactly the URLs the
 * server returned for a match; it never accepts arbitrary user-entered URLs.
 *
 * - Native <video> first (Safari HLS → AirPlay-capable), hls.js only as fallback
 * - States: idle → loading → playing/paused/buffering → reconnecting/ended/error
 * - Never autoplays with sound; playback starts on a user gesture
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CaptionTrack, StreamSource } from "@/lib/providers/streams/types";
import { attachSource, type EngineHandle, type FatalKind } from "@/lib/playback/engine";
import { useRemotePlayback } from "@/lib/playback/remote";
import { browserCapabilities, selectSource } from "@/lib/playback/select-source";
import { Icon } from "../Icon";

export type PlayerState = "idle" | "loading" | "playing" | "paused" | "buffering" | "reconnecting" | "ended" | "error";
export type PlayerErrorKind = FatalKind | "no_source";

export interface VideoPlayerProps {
  sources: StreamSource[];
  captions?: CaptionTrack[];
  title: string;
  subtitle?: string;
  airplayAllowed?: boolean;
  /** Controlled mute (multi-view). Uncontrolled when omitted. */
  muted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  volume?: number;
  onVolumeChange?: (v: number) => void;
  /** When true the player pauses and stops downloading (inactive panel). */
  suspended?: boolean;
  /** Start playback as soon as mounted — only ever muted. */
  autoPlayMuted?: boolean;
  compact?: boolean;
  onExpand?: () => void;
  expanded?: boolean;
  onStateChange?: (s: PlayerState) => void;
  testId?: string;
}

const MAX_RECONNECTS = 5;
const STALL_RELOAD_MS = 15_000;

const ERROR_COPY: Record<PlayerErrorKind, { title: string; body: string }> = {
  network: { title: "Connection lost", body: "We couldn't reach the stream after several attempts. Check your connection and try again." },
  unauthorized: { title: "Not authorized", body: "The stream provider declined playback. You may need to sign in with the provider or it may not be available in your region." },
  unavailable: { title: "Stream unavailable", body: "The authorized stream isn't responding right now. It may not have started yet or may have ended." },
  decode: { title: "Playback problem", body: "This device couldn't decode the stream." },
  unsupported: { title: "Unsupported stream", body: "This browser can't play this stream format. Try Safari or another device." },
  no_source: { title: "Unsupported stream", body: "None of the authorized formats can play in this browser. Try Safari on iPhone, iPad or Mac." },
};

let volumeSupportCache: boolean | undefined;
function volumeSupported(): boolean {
  if (volumeSupportCache !== undefined) return volumeSupportCache;
  try {
    const v = document.createElement("video");
    v.volume = 0.5;
    volumeSupportCache = v.volume === 0.5; // iOS: volume is hardware-only, reads back 1
  } catch {
    volumeSupportCache = false;
  }
  return volumeSupportCache;
}

export function VideoPlayer(props: VideoPlayerProps) {
  const {
    sources,
    captions = [],
    title,
    subtitle,
    airplayAllowed = true,
    suspended = false,
    autoPlayMuted = false,
    compact = false,
    onExpand,
    expanded,
    onStateChange,
    testId,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const engineRef = useRef<EngineHandle | null>(null);
  const sourceIndexRef = useRef(0);
  const reconnectsRef = useRef(0);
  const wantPlayRef = useRef(false);
  const timers = useRef<{ reconnect?: number; stall?: number; hide?: number }>({});

  const [state, setStateRaw] = useState<PlayerState>("idle");
  const [errorKind, setErrorKind] = useState<PlayerErrorKind | null>(null);
  const [internalMuted, setInternalMuted] = useState(true);
  const [internalVolume, setInternalVolume] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setFullscreen] = useState(false);
  const [canPip, setCanPip] = useState(false);
  const [hasVolume, setHasVolume] = useState(true);
  const [attached, setAttached] = useState(false);
  const captionsId = useId();

  const muted = props.muted ?? internalMuted;
  const volume = props.volume ?? internalVolume;

  const setState = useCallback(
    (s: PlayerState) => {
      setStateRaw(s);
      onStateChange?.(s);
    },
    [onStateChange],
  );

  const setMuted = (m: boolean) => {
    if (props.muted === undefined) setInternalMuted(m);
    props.onMutedChange?.(m);
  };
  const setVolume = (v: number) => {
    if (props.volume === undefined) setInternalVolume(v);
    props.onVolumeChange?.(v);
    if (v > 0 && muted) setMuted(false);
  };

  const remote = useRemotePlayback(video, airplayAllowed);

  // keep element in sync with mute/volume
  useEffect(() => {
    if (!video) return;
    video.muted = muted;
    if (hasVolume) video.volume = volume;
  }, [video, muted, volume, hasVolume]);

  useEffect(() => {
    setHasVolume(volumeSupported());
    if (!video) return;
    const v = video as HTMLVideoElement & { webkitSupportsPresentationMode?: (m: string) => boolean };
    setCanPip(
      (typeof document !== "undefined" && document.pictureInPictureEnabled && !v.disablePictureInPicture) ||
        Boolean(v.webkitSupportsPresentationMode?.("picture-in-picture")),
    );
  }, [video]);

  const clearTimer = (k: keyof typeof timers.current) => {
    const t = timers.current[k];
    if (t !== undefined) window.clearTimeout(t);
    timers.current[k] = undefined;
  };

  const teardown = useCallback(() => {
    engineRef.current?.destroy();
    engineRef.current = null;
    setAttached(false);
  }, []);

  const fail = useCallback(
    (kind: PlayerErrorKind) => {
      clearTimer("reconnect");
      clearTimer("stall");
      teardown();
      wantPlayRef.current = false;
      setErrorKind(kind);
      setState("error");
    },
    [setState, teardown],
  );

  // attach → play; falls through to the next authorized source on format/availability failures
  const attach = useCallback(
    async (startAt: number): Promise<void> => {
      if (!video) return;
      teardown();
      const sel = selectSource(sources, browserCapabilities(video), startAt);
      if (!sel) return fail(startAt === 0 ? "no_source" : "unavailable");
      sourceIndexRef.current = sel.index;
      setState("loading");
      setErrorKind(null);
      try {
        engineRef.current = await attachSource(video, sel, {
          onFatal: (kind) => {
            if (kind === "network") return scheduleReconnect();
            if (kind === "unauthorized") return fail("unauthorized");
            // unavailable / decode / unsupported → try the next authorized source
            if (sel.index + 1 < sources.length) return void attach(sel.index + 1);
            fail(kind);
          },
        });
        setAttached(true);
        if (wantPlayRef.current && !suspended) await play();
      } catch {
        fail("unsupported");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [video, sources, suspended],
  );

  const scheduleReconnect = useCallback(() => {
    if (reconnectsRef.current >= MAX_RECONNECTS) return fail("network");
    const n = reconnectsRef.current++;
    setState("reconnecting");
    clearTimer("reconnect");
    timers.current.reconnect = window.setTimeout(() => {
      if (engineRef.current) engineRef.current.reload();
      else void attach(sourceIndexRef.current);
      if (wantPlayRef.current) void play();
    }, Math.min(30_000, 1000 * 2 ** n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attach, fail, setState]);

  const play = useCallback(async () => {
    if (!video) return;
    wantPlayRef.current = true;
    try {
      await video.play();
    } catch (e) {
      // Autoplay policy: needs a user gesture (or muted). Fall back to the play button.
      if ((e as DOMException).name === "NotAllowedError") {
        wantPlayRef.current = false;
        setState("idle");
      }
      // other failures surface through the media "error" event
    }
  }, [video, setState]);

  const start = useCallback(() => {
    wantPlayRef.current = true;
    reconnectsRef.current = 0;
    if (!engineRef.current) void attach(0);
    else void play();
  }, [attach, play]);

  const togglePlay = () => {
    if (!video) return;
    if (state === "error" || state === "ended" || !engineRef.current) return start();
    if (video.paused) void play();
    else {
      wantPlayRef.current = false;
      video.pause();
    }
  };

  // media element events → state machine
  useEffect(() => {
    if (!video) return;
    const on = (ev: string, fn: () => void) => {
      video.addEventListener(ev, fn);
      return () => video.removeEventListener(ev, fn);
    };
    const offs = [
      on("playing", () => {
        reconnectsRef.current = 0;
        clearTimer("stall");
        setState("playing");
      }),
      on("pause", () => {
        if (!video.ended) setState(engineRef.current ? "paused" : "idle");
      }),
      on("waiting", () => {
        setState("buffering");
        clearTimer("stall");
        // a live stream stuck buffering for too long gets reloaded
        timers.current.stall = window.setTimeout(() => scheduleReconnect(), STALL_RELOAD_MS);
      }),
      on("ended", () => {
        wantPlayRef.current = false;
        setState("ended");
      }),
      on("volumechange", () => {
        if (props.muted === undefined) setInternalMuted(video.muted);
      }),
    ];
    return () => offs.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, setState, scheduleReconnect]);

  // retry immediately when the device comes back online
  useEffect(() => {
    const onOnline = () => {
      if (state === "reconnecting" || (state === "error" && errorKind === "network")) {
        reconnectsRef.current = 0;
        start();
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [state, errorKind, start]);

  // suspend (inactive multi-view panel / hidden page): pause + stop downloading
  useEffect(() => {
    if (!video || !attached) return;
    if (suspended) {
      video.pause();
      engineRef.current?.stopLoad?.();
    } else if (wantPlayRef.current) {
      engineRef.current?.startLoad?.();
      void video.play().catch(() => {});
    }
  }, [suspended, video, attached]);

  // optional muted autoplay (never with sound)
  useEffect(() => {
    if (autoPlayMuted && video && !engineRef.current && !suspended) {
      if (props.muted === undefined) setInternalMuted(true);
      video.muted = true;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlayMuted, video]);

  // reset when the authorized sources change
  useEffect(() => {
    return () => {
      clearTimer("reconnect");
      clearTimer("stall");
      clearTimer("hide");
      teardown();
    };
  }, [sources, teardown]);

  // captions
  useEffect(() => {
    if (!video) return;
    for (const t of Array.from(video.textTracks)) t.mode = captionsOn && t.kind === "subtitles" ? "showing" : "hidden";
  }, [captionsOn, video, attached]);

  // fullscreen tracking
  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // lock-screen / Control Center metadata
  useEffect(() => {
    if (state !== "playing" || !("mediaSession" in navigator) || compact) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: subtitle ?? "", album: "MatchNest" });
      navigator.mediaSession.setActionHandler("play", () => void video?.play());
      navigator.mediaSession.setActionHandler("pause", () => video?.pause());
    } catch {
      /* not supported */
    }
  }, [state, title, subtitle, video, compact]);

  // auto-hide controls while playing
  const poke = useCallback(() => {
    setControlsVisible(true);
    clearTimer("hide");
    timers.current.hide = window.setTimeout(() => setControlsVisible(false), 3000);
  }, []);
  useEffect(() => {
    if (state !== "playing") setControlsVisible(true);
    else poke();
  }, [state, poke]);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    const v = video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (el?.requestFullscreen) await el.requestFullscreen();
      else v?.webkitEnterFullscreen?.(); // iPhone Safari
    } catch {
      v?.webkitEnterFullscreen?.();
    }
  };

  const togglePip = async () => {
    const v = video as (HTMLVideoElement & { webkitSetPresentationMode?: (m: string) => void; webkitPresentationMode?: string }) | null;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled) await v.requestPictureInPicture();
      else if (v.webkitSetPresentationMode) v.webkitSetPresentationMode(v.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture");
    } catch {
      /* user cancelled or not allowed */
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    switch (e.key.toLowerCase()) {
      case " ":
      case "k":
        e.preventDefault();
        togglePlay();
        break;
      case "m":
        setMuted(!muted);
        break;
      case "f":
        void toggleFullscreen();
        break;
      case "c":
        if (captions.length) setCaptionsOn((c) => !c);
        break;
      case "arrowup":
        e.preventDefault();
        setVolume(Math.min(1, volume + 0.1));
        break;
      case "arrowdown":
        e.preventDefault();
        setVolume(Math.max(0, volume - 0.1));
        break;
    }
    poke();
  };

  const crossOriginCaptions = captions.some((c) => /^https?:\/\//.test(c.src));
  const showSpinner = state === "loading" || state === "buffering" || state === "reconnecting";
  const playing = state === "playing" || state === "buffering";
  const err = errorKind ? ERROR_COPY[errorKind] : null;

  return (
    <div
      ref={containerRef}
      className={`player${compact ? " player--compact" : ""}${controlsVisible ? "" : " player--idle"}`}
      data-state={state}
      data-testid={testId ?? "video-player"}
      tabIndex={0}
      role="region"
      aria-label={`Video player: ${title}`}
      onKeyDown={onKey}
      onPointerMove={poke}
      onPointerDown={poke}
    >
      <video
        ref={setVideo}
        className="player__video"
        playsInline
        preload="none"
        muted={muted}
        x-webkit-airplay={airplayAllowed ? "allow" : "deny"}
        disableRemotePlayback={!airplayAllowed}
        crossOrigin={crossOriginCaptions ? "anonymous" : undefined}
        aria-describedby={captionsId}
      >
        {captions.map((c) => (
          <track key={c.src} kind="subtitles" src={c.src} srcLang={c.srclang} label={c.label} default={c.default} />
        ))}
      </video>

      {remote.wireless && (
        <div className="player__tv" role="status">
          <Icon name="tv" />
          <p>Playing on your TV</p>
          <p className="muted small">Controls stay here on your phone.</p>
        </div>
      )}

      {(state === "idle" || state === "paused") && !remote.wireless && (
        <button type="button" className="player__big-play" onClick={start} aria-label={`Play ${title}`}>
          <Icon name="play" />
          {!compact && <span>{state === "idle" ? "Tap to play" : "Resume"}</span>}
        </button>
      )}

      {showSpinner && (
        <div className="player__status" role="status" aria-live="polite">
          <span className="spinner" aria-hidden />
          <span>{state === "reconnecting" ? "Reconnecting…" : state === "loading" ? "Loading…" : "Buffering…"}</span>
        </div>
      )}

      {state === "ended" && (
        <div className="player__message" role="status">
          <p className="player__message-title">Stream ended</p>
          <button type="button" className="btn btn--small" onClick={start}>
            Play again
          </button>
        </div>
      )}

      {state === "error" && err && (
        <div className="player__message player__message--error" role="alert" data-error={errorKind}>
          <p className="player__message-title">{err.title}</p>
          {!compact && <p className="small">{err.body}</p>}
          {errorKind !== "no_source" && errorKind !== "unsupported" && (
            <button type="button" className="btn btn--small" onClick={start}>
              Try again
            </button>
          )}
        </div>
      )}

      <div className="player__controls" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <button type="button" className="icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted}>
          <Icon name={muted ? "volume-off" : "volume"} />
        </button>
        {hasVolume && (
          <input
            className="player__volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volume"
          />
        )}
        <span className="player__live-dot" aria-hidden={!playing}>
          {playing ? "LIVE" : ""}
        </span>
        <span className="spacer" />
        {captions.length > 0 && (
          <button type="button" className="icon-btn" onClick={() => setCaptionsOn((c) => !c)} aria-label="Captions" aria-pressed={captionsOn}>
            <Icon name="cc" />
          </button>
        )}
        {airplayAllowed && remote.availability === "available" && (
          <button type="button" className="icon-btn" onClick={remote.prompt} aria-label={remote.api === "webkit" ? "AirPlay" : "Send to TV"} title={remote.api === "webkit" ? "AirPlay" : "Send to TV"}>
            <Icon name="airplay" />
          </button>
        )}
        {canPip && !compact && (
          <button type="button" className="icon-btn" onClick={togglePip} aria-label="Picture in picture">
            <Icon name="pip" />
          </button>
        )}
        {onExpand && (
          <button type="button" className="icon-btn" onClick={onExpand} aria-label={expanded ? "Collapse panel" : "Expand panel"} aria-pressed={expanded}>
            <Icon name={expanded ? "collapse" : "expand"} />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit full screen" : "Full screen"}>
          <Icon name="fullscreen" />
        </button>
      </div>
      <span id={captionsId} hidden>
        {captions.length ? "Captions available. Press C to toggle." : "No captions supplied for this stream."}
      </span>
    </div>
  );
}
