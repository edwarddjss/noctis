"use client";
/**
 * AirPlay / "Send to TV" via browser-supported APIs only:
 *  - Safari: WebKit playback-target events + webkitShowPlaybackTargetPicker()
 *  - Others: the W3C Remote Playback API (video.remote), where implemented
 * Availability depends on the browser, the media format (MSE/hls.js sources
 * generally can't be sent), the receiver, the network and provider rules.
 */
import { useCallback, useEffect, useState } from "react";

export type RouteAvailability = "unknown" | "available" | "unavailable";

interface WebKitVideo extends HTMLVideoElement {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
}

interface AvailabilityEvent extends Event {
  availability?: "available" | "not-available";
}

export function useRemotePlayback(video: HTMLVideoElement | null, enabled: boolean) {
  const [availability, setAvailability] = useState<RouteAvailability>("unknown");
  const [wireless, setWireless] = useState(false);
  const [api, setApi] = useState<"webkit" | "remote" | "none">("none");

  useEffect(() => {
    if (!video || !enabled) return;
    const v = video as WebKitVideo;
    const cleanups: (() => void)[] = [];

    if (typeof v.webkitShowPlaybackTargetPicker === "function" && "WebKitPlaybackTargetAvailabilityEvent" in window) {
      setApi("webkit");
      const onAvail = (e: Event) => setAvailability((e as AvailabilityEvent).availability === "available" ? "available" : "unavailable");
      const onWireless = () => setWireless(Boolean(v.webkitCurrentPlaybackTargetIsWireless));
      v.addEventListener("webkitplaybacktargetavailabilitychanged", onAvail);
      v.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", onWireless);
      cleanups.push(() => {
        v.removeEventListener("webkitplaybacktargetavailabilitychanged", onAvail);
        v.removeEventListener("webkitcurrentplaybacktargetiswirelesschanged", onWireless);
      });
    } else if ("remote" in v && v.remote && typeof v.remote.watchAvailability === "function") {
      setApi("remote");
      const remote = v.remote;
      let id: number | undefined;
      remote
        .watchAvailability((a) => setAvailability(a ? "available" : "unavailable"))
        .then((n) => (id = n))
        .catch(() => setAvailability("unavailable")); // e.g. MSE sources, or disabled
      const onConnect = () => setWireless(true);
      const onDisconnect = () => setWireless(false);
      remote.addEventListener("connect", onConnect);
      remote.addEventListener("disconnect", onDisconnect);
      cleanups.push(() => {
        if (id !== undefined) remote.cancelWatchAvailability(id).catch(() => {});
        remote.removeEventListener("connect", onConnect);
        remote.removeEventListener("disconnect", onDisconnect);
      });
    } else {
      setApi("none");
      setAvailability("unavailable");
    }
    return () => cleanups.forEach((c) => c());
  }, [video, enabled]);

  const prompt = useCallback(() => {
    if (!video) return;
    const v = video as WebKitVideo;
    if (api === "webkit") v.webkitShowPlaybackTargetPicker?.();
    else if (api === "remote") v.remote.prompt().catch(() => {});
  }, [video, api]);

  return { api, availability, wireless, prompt };
}
