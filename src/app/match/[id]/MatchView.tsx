"use client";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { Crest } from "@/components/Crest";
import { FollowButton } from "@/components/FollowButton";
import { Icon } from "@/components/Icon";
import { Lineups } from "@/components/Lineups";
import { ScoreHeader } from "@/components/ScoreHeader";
import { ErrorState, NoStream, Skeleton } from "@/components/States";
import { isLive } from "@/lib/domain";
import { apiGet, errorMessage, schemas } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";

const EVENT_ICON: Record<string, string> = { goal: "⚽", card: "▮", substitution: "⇄", var: "VAR", other: "•" };

export function MatchView({ id }: { id: string }) {
  const res = useApi(`match:${id}`, (s) => apiGet(`/api/matches/${encodeURIComponent(id)}`, schemas.match, s), { pollMs: 20_000 });
  const m = res.data?.match;
  const playback = res.data?.playback;

  return (
    <div className="page">
      <header className="page__header">
        <BackButton />
        <h1 className="truncate">{m ? `${m.home.name} vs ${m.away.name}` : "Match"}</h1>
      </header>
      {res.loading && !m && <Skeleton rows={3} />}
      {res.error != null && !m && <ErrorState message={errorMessage(res.error)} onRetry={res.refresh} />}
      {m && (
        <>
          <ScoreHeader match={m} />
          <section className="section" aria-label="Video">
            {playback ? (
              <div className="card watch-cta" data-testid="stream-available">
                <div>
                  <p className="watch-cta__title">
                    <Icon name="video" size={16} /> Authorized stream available
                  </p>
                  <p className="small muted">
                    {playback.providerName}
                    {playback.isDemo && " · demo test pattern"}
                  </p>
                </div>
                <div className="row gap">
                  <Link href={`/watch/${m.id}`} className="btn" data-testid="watch-button">
                    <Icon name="play" size={16} /> Watch
                  </Link>
                  {isLive(m.status) && (
                    <Link href={`/multiview?add=${m.id}`} className="btn btn--ghost" aria-label="Add to multi-view">
                      <Icon name="grid" size={16} />
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <NoStream />
            )}
          </section>

          <section className="section">
            <h2 className="section__title">Teams</h2>
            <div className="card">
              {[m.home, m.away].map((t) => (
                <div key={t.id} className="list__row">
                  <Link href={`/team/${t.id}`} className="list__main">
                    <Crest name={t.name} src={t.crestUrl} />
                    <span className="list__title">{t.name}</span>
                  </Link>
                  <FollowButton compact item={{ kind: "team", id: t.id, name: t.name, imageUrl: t.crestUrl ?? null }} />
                </div>
              ))}
            </div>
          </section>

          {m.lineups && (
            <section className="section">
              <h2 className="section__title">Line-ups</h2>
              <Lineups match={m} lineups={m.lineups} />
            </section>
          )}

          <section className="section">
            <h2 className="section__title">Events</h2>
            {m.events.length === 0 ? (
              <p className="small muted pad">No events yet.</p>
            ) : (
              <ol className="card events">
                {m.events.map((e, i) => (
                  <li key={i} className={`event event--${e.side}`}>
                    <span className="event__min">
                      {e.minute}
                      {e.extra ? `+${e.extra}` : ""}&apos;
                    </span>
                    <span aria-hidden>{EVENT_ICON[e.type]}</span>
                    <span>
                      {e.player ?? ""} <span className="muted small">{e.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <p className="small muted pad">
            {m.competition.name}
            {m.round ? ` · ${m.round}` : ""}
            {m.venue ? ` · ${m.venue}` : ""}
          </p>
        </>
      )}
    </div>
  );
}
