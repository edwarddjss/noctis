import { describe, expect, it, vi } from "vitest";
import {
  FollowStore,
  MAX_FOLLOWS,
  STORAGE_KEY,
  addFollow,
  feedCompetitionIds,
  feedTeamIds,
  isFollowing,
  loadState,
  mergeStates,
  removeFollow,
  type FollowState,
  type KeyValueStorage,
} from "@/lib/client/follows";

const memory = (init: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};
const empty: FollowState = { version: 1, updatedAt: 0, items: [] };

describe("follow logic", () => {
  it("follows and unfollows a team", () => {
    const s1 = addFollow(empty, { kind: "team", id: "t1", name: "Team One" }, 10);
    expect(isFollowing(s1, "team", "t1")).toBe(true);
    expect(s1.updatedAt).toBe(10);
    const s2 = removeFollow(s1, "team", "t1", 20);
    expect(isFollowing(s2, "team", "t1")).toBe(false);
    expect(s2.updatedAt).toBe(20);
  });

  it("is idempotent", () => {
    const s1 = addFollow(empty, { kind: "team", id: "t1", name: "A" });
    expect(addFollow(s1, { kind: "team", id: "t1", name: "A" })).toBe(s1);
    expect(removeFollow(empty, "team", "nope")).toBe(empty);
  });

  it("treats the same id of different kinds separately", () => {
    const s = addFollow(addFollow(empty, { kind: "team", id: "9", name: "T" }), { kind: "player", id: "9", name: "P" });
    expect(s.items).toHaveLength(2);
  });

  it("enforces a maximum", () => {
    let s = empty;
    for (let i = 0; i < MAX_FOLLOWS; i++) s = addFollow(s, { kind: "team", id: `t${i}`, name: `T${i}` });
    expect(() => addFollow(s, { kind: "team", id: "extra", name: "X" })).toThrow();
  });

  it("rejects invalid items", () => {
    expect(() => addFollow(empty, { kind: "team", id: "", name: "x" })).toThrow();
  });

  it("builds feed ids from teams and followed players' clubs", () => {
    let s = addFollow(empty, { kind: "team", id: "b", name: "B" });
    s = addFollow(s, { kind: "player", id: "p1", name: "P", teamId: "a" });
    s = addFollow(s, { kind: "player", id: "p2", name: "Q", teamId: "b" });
    s = addFollow(s, { kind: "player", id: "p3", name: "No club" });
    s = addFollow(s, { kind: "competition", id: "c1", name: "League" });
    expect(feedTeamIds(s)).toEqual(["a", "b"]);
    expect(feedCompetitionIds(s)).toEqual(["c1"]);
  });

  it("merges by last writer", () => {
    const a = { ...empty, updatedAt: 5 };
    const b = { ...empty, updatedAt: 9 };
    expect(mergeStates(a, b)).toBe(b);
    expect(mergeStates(b, a)).toBe(b);
    expect(mergeStates(a, null)).toBe(a);
  });
});

describe("FollowStore persistence", () => {
  it("persists to storage and notifies subscribers", () => {
    const storage = memory();
    const store = new FollowStore(storage);
    const fn = vi.fn();
    store.subscribe(fn);
    store.follow({ kind: "team", id: "t1", name: "One" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.data[STORAGE_KEY]!).items[0].id).toBe("t1");
    const reloaded = new FollowStore(storage);
    expect(isFollowing(reloaded.getSnapshot(), "team", "t1")).toBe(true);
    store.toggle({ kind: "team", id: "t1", name: "One" });
    expect(isFollowing(store.getSnapshot(), "team", "t1")).toBe(false);
  });

  it("recovers from corrupt or tampered storage", () => {
    expect(loadState(memory({ [STORAGE_KEY]: "{not json" })).items).toEqual([]);
    expect(loadState(memory({ [STORAGE_KEY]: JSON.stringify({ version: 1, updatedAt: 1, items: [{ kind: "evil", id: "x" }] }) })).items).toEqual([]);
    expect(loadState(null).items).toEqual([]);
  });

  it("keeps working when storage throws", () => {
    const storage: KeyValueStorage = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    const store = new FollowStore(storage);
    store.follow({ kind: "team", id: "t", name: "T" });
    expect(store.getSnapshot().items).toHaveLength(1);
  });

  it("pushes to and pulls from a sync adapter", async () => {
    const remote: FollowState = { version: 1, updatedAt: Date.now() + 1000, items: [{ kind: "team", id: "r", name: "Remote", addedAt: 1 }] };
    const sync = { pull: vi.fn(async () => remote), push: vi.fn(async () => {}) };
    const store = new FollowStore(memory(), sync);
    await store.pullFromSync();
    expect(isFollowing(store.getSnapshot(), "team", "r")).toBe(true);
    store.follow({ kind: "team", id: "l", name: "Local" });
    expect(sync.push).toHaveBeenCalled();
  });
});
