"use client";
import Link from "next/link";
import { useState } from "react";
import type { Player } from "@/lib/domain";
import { apiGet, schemas } from "@/lib/client/api";
import { FollowButton } from "./FollowButton";

export function PlayerCard({ player: p }: { player: Player }) {
  const [failed, setFailed] = useState(false);
  return <article className="player-card" data-testid="player-card">
    <Link className="player-card__link" href={`/player/${encodeURIComponent(p.id)}`} aria-label={`View ${p.name}`}>
      <div className="player-card__portrait">
        {p.number != null && <span className="player-card__number" aria-label={`Number ${p.number}`}>{p.number}</span>}
        {p.photoUrl && !failed ? <img src={p.photoUrl} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span className="player-card__initials" aria-hidden>{p.name.split(/\s+/).slice(0, 2).map(n => n[0]).join("")}</span>}
      </div>
      <div className="player-card__identity"><p className="player-card__club">{p.teamName ?? "Club unavailable"}</p><h3>{p.name}</h3><p className="player-card__meta">{[p.position, p.nationality].filter(Boolean).join(" · ") || "Player"}</p></div>
    </Link>
    <div className="player-card__action"><span className="player-card__detail">Player profile ↗</span><FollowButton compact item={{ kind: "player", id: p.id, name: p.name, imageUrl: p.photoUrl ?? null, teamId: p.teamId, teamName: p.teamName }} resolve={async () => {
      if (p.teamId) return null;
      const { player } = await apiGet(`/api/players/${encodeURIComponent(p.id)}`, schemas.player);
      return { kind: "player", id: p.id, name: p.name, imageUrl: p.photoUrl ?? null, teamId: player.teamId, teamName: player.teamName };
    }} /></div>
  </article>;
}
