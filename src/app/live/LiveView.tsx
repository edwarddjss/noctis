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
import { useMeta } from "@/lib/client/use-meta";

/** "live" or a local calendar day YYYY-MM-DD. */
type View = "live" | string;

function localDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(offset: number): string {
  if (offset === -1) return "Yesterday";
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

const OFFSETS = [-2, -1, 0, 1, 2, 3, 4, 5, 6];

export function LiveView() {
  const [view, setView] = useState<View>("live");
  const [videoOnly, setVideoOnly] = useState(false);
  const today = localDay(0);
  const isLive = view === "live";
  const { videoEnabled } = useMeta();

  const live = useApi(isLive ? "live" : null, (s) => apiGet("/api/live", schemas.live, s), { pollMs: 20_000 });
  const day = useApi(isLive ? null : `day:${view}`, (s) => apiGet(`/api/matches?date=${view}`, schemas.day, s), { pollMs: view === today ? 30_000 : undefined });
  const res = isLive ? live : day;

  const streams = res.data?.streams ?? {};
  const all = res.data?.matches ?? [];
  const matches = all.filter((m) => !videoOnly || streams[m.id]);
  const groups = groupByCompetition(matches, res.data?.order);
  const withVideo = all.filter((m) => streams[m.id]).length;

  return (
    <div className="page">
      <header className="page__header">
        <h1>{isLive ? "Live" : "Matches"}</h1>
        <Link href="/multiview" className="btn btn--ghost btn--small" data-testid="open-multiview">
          <Icon name="grid" size={16} /> Multi-view
        </Link>
      </header>

      <div className="daystrip" role="tablist" aria-label="Choose day" data-testid="day-strip">
        <button type="button" role="tab" aria-selected={isLive} className={`daystrip__item daystrip__item--live${isLive ? " is-active" : ""}`} onClick={() => setView("live")}>
          <span className="dot" aria-hidden /> Live
        </button>
        {OFFSETS.map((o) => {
          const d = localDay(o);
          return (
            <button key={d} type="button" role="tab" aria-selected={view === d} className={`daystrip__item${view === d ? " is-active" : ""}`} onClick={() => setView(d)}>
              {dayLabel(o)}
            </button>
          );
        })}
      </div>

      {videoEnabled && (
        <>
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
        </>
      )}

      {res.loading && !res.data && <Skeleton rows={5} />}
      {res.error != null && !res.data && <ErrorState message={errorMessage(res.error)} onRetry={res.refresh} />}
      {res.error != null && res.data && <p className="small muted pad">Couldn&apos;t refresh — showing the last update.</p>}
      {res.data && matches.length === 0 && (
        <EmptyState icon="live" title={isLive ? (videoOnly ? "No live matches with authorized video" : "No live matches right now") : "No matches on this day"}>
          {isLive ? (
            <>
              Check{" "}
              <button type="button" className="linklike" onClick={() => setView(today)}>
                today&apos;s schedule
              </button>
              , or follow teams to see when they play next.
            </>
          ) : (
            "Try another day."
          )}
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
                <MatchRow key={m.id} match={m} streamAvailable={videoEnabled ? streams[m.id] : undefined} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {res.data && <p className="small muted pad center">Updated {new Date(res.data.fetchedAt).toLocaleTimeString()} · refreshes automatically</p>}
      <Attribution />
    </div>
  );
}
