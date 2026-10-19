"use client";
import { useState } from "react";
import type { FollowItem } from "@/lib/client/follows";
import { isFollowing } from "@/lib/client/follows";
import { useFollows } from "@/lib/client/use-follows";

type Item = Omit<FollowItem, "addedAt">;

/**
 * Follow/unfollow toggle. `resolve` can enrich the item before following
 * (e.g. look up a player's current club so the feed can show their matches).
 */
export function FollowButton({ item, compact = false, resolve }: { item: Item; compact?: boolean; resolve?: () => Promise<Item | null> }) {
  const { state, store } = useFollows();
  const [busy, setBusy] = useState(false);
  const on = isFollowing(state, item.kind, item.id);
  return (
    <button
      type="button"
      className={`btn ${on ? "btn--on" : "btn--ghost"}${compact ? " btn--small" : ""}`}
      aria-pressed={on}
      aria-label={`${on ? "Unfollow" : "Follow"} ${item.name}`}
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (on) return store.unfollow(item.kind, item.id);
          let toAdd = item;
          if (resolve) {
            setBusy(true);
            toAdd = (await resolve().catch(() => null)) ?? item;
          }
          store.follow(toAdd);
        } catch (err) {
          alert((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {on ? "Following" : "Follow"}
    </button>
  );
}
