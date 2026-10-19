"use client";
import { useEffect, useSyncExternalStore } from "react";
import { FollowStore, STORAGE_KEY, type FollowState } from "./follows";

let store: FollowStore | null = null;
const SERVER_STATE: FollowState = { version: 1, updatedAt: 0, items: [] };

export function getFollowStore(): FollowStore {
  if (!store) {
    let storage: Storage | null = null;
    try {
      storage = typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      storage = null;
    }
    store = new FollowStore(storage);
  }
  return store;
}

export function useFollows() {
  const s = getFollowStore();
  const state = useSyncExternalStore(s.subscribe, s.getSnapshot, () => SERVER_STATE);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && s.reload();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [s]);
  return { state, store: s };
}
