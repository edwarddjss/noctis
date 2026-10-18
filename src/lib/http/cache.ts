/** Small TTL + LRU cache with stale reads, used for server-side request caching. */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  staleUntil: number;
}

export class TtlCache<T = unknown> {
  private map = new Map<string, CacheEntry<T>>();
  constructor(
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  /** Fresh value only. */
  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= this.now()) return undefined;
    // refresh LRU position
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  /** Value even if expired, as long as it is within the stale window. */
  getStale(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e || e.staleUntil <= this.now()) return undefined;
    return e.value;
  }

  set(key: string, value: T, ttlMs: number, staleMs = ttlMs * 10): void {
    const t = this.now();
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: t + ttlMs, staleUntil: t + ttlMs + staleMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
