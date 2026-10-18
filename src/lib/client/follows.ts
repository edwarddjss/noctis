/**
 * Followed teams / players / competitions. Local-first: state lives in
 * localStorage (validated on load), changes broadcast to other tabs, and an
 * optional SyncAdapter can mirror it to an account backend.
 */
import { z } from "zod";

export const FollowKindSchema = z.enum(["team", "player", "competition"]);
export type FollowKind = z.infer<typeof FollowKindSchema>;

export const FollowItemSchema = z.object({
  kind: FollowKindSchema,
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(120),
  imageUrl: z.string().max(2048).nullable().optional(),
  /** For players: their club, so the feed can show the club's matches. */
  teamId: z.string().max(60).optional(),
  teamName: z.string().max(120).optional(),
  addedAt: z.number(),
});
export type FollowItem = z.infer<typeof FollowItemSchema>;

export const FollowStateSchema = z.object({
  version: z.literal(1),
  updatedAt: z.number(),
  items: z.array(FollowItemSchema).max(500),
});
export type FollowState = z.infer<typeof FollowStateSchema>;

export const STORAGE_KEY = "matchnest:follows:v1";
export const MAX_FOLLOWS = 60;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SyncAdapter {
  pull(): Promise<FollowState | null>;
  push(state: FollowState): Promise<void>;
}

const keyOf = (kind: FollowKind, id: string) => `${kind}:${id}`;
const empty = (): FollowState => ({ version: 1, updatedAt: 0, items: [] });

export function loadState(storage: KeyValueStorage | null): FollowState {
  if (!storage) return empty();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = FollowStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : empty();
  } catch {
    return empty();
  }
}

/** Pure helpers (unit tested). */
export function addFollow(state: FollowState, item: Omit<FollowItem, "addedAt">, now = Date.now()): FollowState {
  if (state.items.some((i) => keyOf(i.kind, i.id) === keyOf(item.kind, item.id))) return state;
  if (state.items.length >= MAX_FOLLOWS) throw new Error(`You can follow up to ${MAX_FOLLOWS} items`);
  const valid = FollowItemSchema.parse({ ...item, addedAt: now });
  return { ...state, updatedAt: now, items: [...state.items, valid] };
}

export function removeFollow(state: FollowState, kind: FollowKind, id: string, now = Date.now()): FollowState {
  const items = state.items.filter((i) => keyOf(i.kind, i.id) !== keyOf(kind, id));
  return items.length === state.items.length ? state : { ...state, updatedAt: now, items };
}

export function isFollowing(state: FollowState, kind: FollowKind, id: string): boolean {
  return state.items.some((i) => i.kind === kind && i.id === id);
}

/** Team ids whose fixtures belong in the feed: followed teams + followed players' clubs. */
export function feedTeamIds(state: FollowState): string[] {
  const ids = new Set<string>();
  for (const i of state.items) {
    if (i.kind === "team") ids.add(i.id);
    if (i.kind === "player" && i.teamId) ids.add(i.teamId);
  }
  return [...ids].sort();
}

export function feedCompetitionIds(state: FollowState): string[] {
  return state.items.filter((i) => i.kind === "competition").map((i) => i.id).sort();
}

/** Last-writer-wins merge at document level; good enough for one person's devices. */
export function mergeStates(local: FollowState, remote: FollowState | null): FollowState {
  if (!remote) return local;
  return remote.updatedAt > local.updatedAt ? remote : local;
}

export class FollowStore {
  private state: FollowState;
  private listeners = new Set<() => void>();

  constructor(
    private readonly storage: KeyValueStorage | null,
    private readonly sync: SyncAdapter | null = null,
  ) {
    this.state = loadState(storage);
  }

  getSnapshot = (): FollowState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private commit(next: FollowState) {
    if (next === this.state) return;
    this.state = next;
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage full or disabled (private mode) — keep in memory
    }
    this.listeners.forEach((l) => l());
    void this.sync?.push(next).catch(() => {});
  }

  follow(item: Omit<FollowItem, "addedAt">) {
    this.commit(addFollow(this.state, item));
  }

  unfollow(kind: FollowKind, id: string) {
    this.commit(removeFollow(this.state, kind, id));
  }

  toggle(item: Omit<FollowItem, "addedAt">) {
    if (isFollowing(this.state, item.kind, item.id)) this.unfollow(item.kind, item.id);
    else this.follow(item);
  }

  /** Re-read storage (another tab changed it). */
  reload() {
    const next = loadState(this.storage);
    if (JSON.stringify(next) !== JSON.stringify(this.state)) {
      this.state = next;
      this.listeners.forEach((l) => l());
    }
  }

  async pullFromSync() {
    if (!this.sync) return;
    const remote = await this.sync.pull();
    const merged = mergeStates(this.state, remote);
    if (merged !== this.state) this.commit(merged);
  }
}

/** Account sync over MatchNest's /api/sync (disabled unless the server enables it). */
export class HttpSyncAdapter implements SyncAdapter {
  constructor(private readonly endpoint = "/api/sync") {}
  async pull(): Promise<FollowState | null> {
    const res = await fetch(this.endpoint, { credentials: "same-origin" });
    if (!res.ok) return null;
    const parsed = FollowStateSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  }
  async push(state: FollowState): Promise<void> {
    await fetch(this.endpoint, { method: "PUT", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(state) });
  }
}
