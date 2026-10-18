"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ApiState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  refresh: () => void;
}

/**
 * Fetch with abort-on-unmount/key-change, optional polling that pauses while
 * the page is hidden, and retry with exponential backoff on failure.
 */
export function useApi<T>(key: string | null, fetcher: (signal: AbortSignal) => Promise<T>, opts: { pollMs?: number } = {}): ApiState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(Boolean(key));
  const [tick, setTick] = useState(0);
  const failures = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!key) {
      setData(undefined);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    let timer: number | undefined;
    setLoading(true);
    fetcherRef
      .current(ctrl.signal)
      .then((d) => {
        failures.current = 0;
        setData(d);
        setError(undefined);
        if (opts.pollMs) timer = window.setTimeout(() => setTick((t) => t + 1), opts.pollMs);
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setError(e);
        const backoff = Math.min(60_000, 2000 * 2 ** failures.current++);
        if (opts.pollMs || failures.current <= 3) timer = window.setTimeout(() => setTick((t) => t + 1), backoff);
      })
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => {
      ctrl.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [key, tick, opts.pollMs]);

  // refresh promptly when returning to the app; pause polling while hidden
  useEffect(() => {
    if (!opts.pollMs) return;
    const onVis = () => document.visibilityState === "visible" && setTick((t) => t + 1);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [opts.pollMs]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refresh };
}
