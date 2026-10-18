"use client";
import Link from "next/link";
import { useState } from "react";
import { Attribution } from "@/components/Attribution";
import { Crest } from "@/components/Crest";
import { Icon } from "@/components/Icon";
import { MatchRow } from "@/components/MatchRow";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { groupByCompetition } from "@/lib/domain";
import { apiGet, errorMessage, schemas } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";

export function LiveView() {
  const [videoOnly, setVideoOnly] = useState(false);
  const live = useApi("live", (s) => apiGet("/api/live", schemas.live, s), { pollMs: 20_000 });
  const streams = live.data?.streams ?? {};
  const matches = (live.data?.matches ?? []).filter((m) => !videoOnly || streams[m.id]);
  const groups = groupByCompetition(matches, live.data?.order);
  const withVideo = (live.data?.matches ?? []).filter((m) => streams[m.id]).length;

  return (
    <div className="page">
      <header className="page__header">
        <h1>Live</h1>
        <Link href="/multiview" className="btn btn--ghost btn--small" data-testid="open-multiview">
          <Icon name="grid" size={16} /> Multi-view
        </Link>
      </header>

      <div className="legend small muted">
        <span>
          <span className="badge badge--score">Score only</span> live score, no authorized video
        </span>
        <span>
          <span className="badge badge--video">
            <Icon name="video" size={12} /> Video
          </span>{" "}
          authorized stream configured
        </span>
      </div>

      <label className="toggle">
        <input type="checkbox" checked={videoOnly} onChange={(e) => setVideoOnly(e.target.checked)} />
        <span>Only matches with authorized video ({withVideo})</span>
      </label>

      {live.loading && !live.data && <Skeleton rows={5} />}
      {live.error != null && !live.data && <ErrorState message={errorMessage(live.error)} onRetry={live.refresh} />}
      {live.error != null && live.data && <p className="small muted pad">Couldn't refresh — showing the last update.</p>}
      {live.data && matches.length === 0 && (
        <EmptyState icon="live" title={videoOnly ? "No live matches with authorized video" : "No live matches right now"}>
          Check back later, or follow teams to see when they play next.
        </EmptyState>
      )}

      <div data-testid="live-list">
        {groups.map((g) => (
          <section key={g.competition.id} className="section">
            <h2 className="section__title section__title--comp">
              <Crest name={g.competition.name} src={g.competition.logoUrl} size={18} round={false} />
              <Link href={`/competition/${g.competition.id}`}>{g.competition.name}</Link>
              {g.competition.country && <span className="muted"> · {g.competition.country}</span>}
            </h2>
            <div className="card">
              {g.matches.map((m) => (
                <MatchRow key={m.id} match={m} streamAvailable={streams[m.id]} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {live.data && <p className="small muted pad center">Updated {new Date(live.data.fetchedAt).toLocaleTimeString()} · refreshes automatically</p>}
      <Attribution />
    </div>
  );
}
