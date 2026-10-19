import { parseDirectory, materializeMatch } from "./parse.ts";
import type { DirectoryMeta, Match, StoredMatch } from "./types.ts";

export const DEFAULT_UPSTREAM = "https://api.wqxag.com/diaries.json";

export class UpstreamUnavailable extends Error {
  constructor() { super("No match directory is available yet"); }
}

export interface StoreConfig {
  upstream?: string;
  ttlMs?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  now?: () => number;
}

export class DirectoryStore {
  readonly upstream: string;
  readonly ttlMs: number;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private snapshot: StoredMatch[] | null = null;
  private lastAttempt: number | null = null;
  private lastSuccess: number | null = null;
  private lastError: string | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(config: StoreConfig = {}) {
    this.upstream = config.upstream ?? DEFAULT_UPSTREAM;
    this.ttlMs = config.ttlMs ?? 60_000;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.fetcher = config.fetcher ?? fetch;
    this.now = config.now ?? Date.now;
  }

  private async refresh(): Promise<void> {
    try {
      const res = await this.fetcher(this.upstream, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
      const contentLength = Number(res.headers.get("content-length") ?? 0);
      if (contentLength > 5_000_000) throw new Error("Upstream payload too large");
      const raw = await res.text();
      if (raw.length > 5_000_000) throw new Error("Upstream payload too large");
      const parsed = parseDirectory(JSON.parse(raw) as unknown);
      this.snapshot = parsed;
      this.lastSuccess = this.now();
      this.lastError = null;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : "Unknown upstream error";
      // Do not overwrite last-known-good directory on errors.
    }
  }

  async getMatches(): Promise<{ matches: Match[]; meta: DirectoryMeta }> {
    const now = this.now();
    if (this.lastAttempt === null || now - this.lastAttempt >= this.ttlMs) {
      if (!this.inFlight) {
        this.lastAttempt = now;
        this.inFlight = this.refresh().finally(() => { this.inFlight = null; });
      }
    }
    if (this.inFlight) await this.inFlight;
    if (this.snapshot === null) throw new UpstreamUnavailable();
    return {
      matches: this.snapshot.map((m) => materializeMatch(m, this.now())),
      meta: {
        upstream: this.upstream,
        fetchedAt: this.lastSuccess === null ? null : new Date(this.lastSuccess).toISOString(),
        stale: this.lastError !== null,
        lastError: this.lastError,
        refreshIntervalSeconds: this.ttlMs / 1000,
        statusIsInferred: true
      }
    };
  }
}
