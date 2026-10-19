"use client";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { Crest } from "@/components/Crest";
import { FollowButton } from "@/components/FollowButton";
import { ErrorState, Skeleton } from "@/components/States";
import { apiGet, errorMessage, schemas } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";

export function PlayerView({ id }: { id: string }) {
  const res = useApi(`player:${id}`, (s) => apiGet(`/api/players/${encodeURIComponent(id)}`, schemas.player, s));
  const p = res.data?.player;
  return (
    <div className="page">
      <header className="page__header">
        <BackButton fallback="/following" />
        <h1 className="truncate">{p?.name ?? "Player"}</h1>
      </header>
      {res.loading && !p && <Skeleton rows={2} />}
      {res.error != null && !p && <ErrorState message={errorMessage(res.error)} onRetry={res.refresh} />}
      {p && (
        <>
          <div className="card hero">
            <Crest name={p.name} src={p.photoUrl} size={56} />
            <div className="hero__text">
              <p className="hero__title">{p.name}</p>
              <p className="small muted">{[p.position, p.nationality, p.age ? `Age ${p.age}` : null].filter(Boolean).join(" · ")}</p>
            </div>
            <FollowButton item={{ kind: "player", id: p.id, name: p.name, imageUrl: p.photoUrl ?? null, teamId: p.teamId, teamName: p.teamName }} />
          </div>
          {p.teamId && (
            <p className="pad">
              Plays for <Link href={`/team/${p.teamId}`}>{p.teamName ?? "their club"}</Link>. Following this player adds the club&apos;s matches to your feed.
            </p>
          )}
        </>
      )}
    </div>
  );
}
