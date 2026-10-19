import type { z } from "zod";
import { ProviderError } from "../errors";
import { log, redactUrl } from "../log";
import { TtlCache } from "./cache";

export interface FetchJsonOptions<S extends z.ZodType> {
  schema: S;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Retries after the first attempt. */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** When set, responses are cached under this key. */
  cacheKey?: string;
  ttlMs?: number;
  cache?: TtlCache<unknown>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Hook to inspect headers (e.g. provider rate-limit counters). */
  onResponse?: (res: Response) => void;
  /** If set, the request is not sent; stale cache is served or this error thrown. */
  preflight?: ProviderError;
  /** Semantic check of a schema-valid body (e.g. provider "errors" field). Not retried. */
  validate?: (body: z.infer<S>) => ProviderError | null;
}

export const sharedCache = new TtlCache<unknown>(1000);
const inflight = new Map<string, Promise<unknown>>();

export function backoffDelay(attempt: number, base: number, max: number, random = Math.random): number {
  const exp = Math.min(max, base * 2 ** attempt);
  // "full jitter": spread retries so clients don't stampede together
  return Math.round(exp / 2 + random() * (exp / 2));
}

export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

export const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError("aborted", "Request aborted"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new ProviderError("aborted", "Request aborted"));
      },
      { once: true },
    );
  });

function isRetryable(err: unknown): boolean {
  if (err instanceof ProviderError) return err.code === "upstream" || err.code === "rate_limited" || err.code === "timeout";
  return true; // network-level TypeError etc.
}

/**
 * GET JSON with timeout, abort, retry + exponential backoff, Retry-After,
 * response validation, caching with stale fallback and in-flight dedupe.
 */
export async function fetchJson<S extends z.ZodType>(url: string, opts: FetchJsonOptions<S>): Promise<z.infer<S>> {
  const {
    schema,
    headers,
    signal,
    timeoutMs = 8000,
    retries = 2,
    baseDelayMs = 300,
    maxDelayMs = 5000,
    cacheKey,
    ttlMs = 30_000,
    cache = sharedCache,
    fetchImpl = fetch,
    sleep = defaultSleep,
    onResponse,
    preflight,
    validate,
  } = opts;

  if (cacheKey) {
    const hit = cache.get(cacheKey);
    if (hit !== undefined) return hit as z.infer<S>;
    const pending = inflight.get(cacheKey);
    if (pending) return abandonable(pending as Promise<z.infer<S>>, signal);
  }

  const staleOr = (err: ProviderError): z.infer<S> => {
    if (cacheKey) {
      const stale = cache.getStale(cacheKey);
      if (stale !== undefined) {
        log.warn("provider.serving_stale", { url: redactUrl(url), code: err.code });
        return stale as z.infer<S>;
      }
    }
    throw err;
  };

  // `sig` is the caller's signal for unshared requests, and undefined for shared
  // (cached) ones: one caller leaving must not cancel the fetch for the others.
  const run = async (sig: AbortSignal | undefined): Promise<z.infer<S>> => {
    if (preflight) return staleOr(preflight);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (sig?.aborted) throw new ProviderError("aborted", "Request aborted");
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = sig ? AbortSignal.any([sig, timeout]) : timeout;
      let retryAfterMs: number | undefined;
      try {
        const res = await fetchImpl(url, { headers, signal: combined, cache: "no-store" });
        onResponse?.(res);
        if (res.status === 429) {
          retryAfterMs = parseRetryAfter(res.headers.get("retry-after"));
          throw new ProviderError("rate_limited", "Upstream rate limit reached", retryAfterMs);
        }
        if (res.status === 401 || res.status === 403) throw new ProviderError("unauthorized", `Upstream rejected credentials (${res.status})`);
        if (res.status === 404) throw new ProviderError("not_found", "Upstream resource not found");
        if (res.status >= 500) throw new ProviderError("upstream", `Upstream error ${res.status}`);
        if (!res.ok) throw new ProviderError("invalid_response", `Unexpected status ${res.status}`);
        const body: unknown = await res.json().catch(() => {
          throw new ProviderError("invalid_response", "Response was not JSON");
        });
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          log.warn("provider.invalid_response", { url: redactUrl(url), issues: parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")) });
          throw new ProviderError("invalid_response", "Upstream response failed validation");
        }
        const semantic = validate?.(parsed.data);
        if (semantic) {
          lastErr = semantic;
          break;
        }
        if (cacheKey) cache.set(cacheKey, parsed.data, ttlMs);
        return parsed.data;
      } catch (err) {
        let e = err;
        if (sig?.aborted) throw new ProviderError("aborted", "Request aborted");
        if (timeout.aborted && !(err instanceof ProviderError)) e = new ProviderError("timeout", "Upstream request timed out");
        lastErr = e;
        if (attempt === retries || !isRetryable(e)) break;
        const delay = Math.min(maxDelayMs, retryAfterMs ?? backoffDelay(attempt, baseDelayMs, maxDelayMs));
        log.info("provider.retry", { url: redactUrl(url), attempt: attempt + 1, delay });
        await sleep(delay, sig);
      }
    }
    return staleOr(lastErr instanceof ProviderError ? lastErr : new ProviderError("upstream", "Upstream request failed"));
  };

  if (!cacheKey) return run(signal);
  if (signal?.aborted) throw new ProviderError("aborted", "Request aborted");
  const p = run(undefined).finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, p);
  return abandonable(p, signal);
}

/** Let one caller stop waiting on a shared promise without cancelling it. */
function abandonable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(new ProviderError("aborted", "Request aborted"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ProviderError("aborted", "Request aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}
