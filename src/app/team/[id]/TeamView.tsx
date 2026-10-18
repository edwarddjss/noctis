"use client";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";
import { Crest } from "@/components/Crest";
import { FollowButton } from "@/components/FollowButton";
import { MatchRow } from "@/components/MatchRow";
import { ErrorState, Skeleton } from "@/components/States";
import { apiGet, errorMessage, schemas } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";

export function TeamView({ id }: { id: string }) {
  const res = useApi(`team:${id}`, (s) => apiGet(`/api/teams/${encodeURIComponent(id)}`, schemas.team, s), { pollMs: 60_000 });
  const t = res.data?.team;
  return (
    <div className="page">
      <header className="page__header">
        <BackButton fallback="/following" />
        <h1 className="truncate">{t?.name ?? "Team"}</h1>
      </header>
      {res.loading && !t && <Skeleton rows={4} />}
      {res.error != null && !t && <ErrorState message={errorMessage(res.error)} onRetry={res.refresh} />}
      {t && res.data && (
        <>
          <div className="card hero">
            <Crest name={t.name} src={t.crestUrl} size={56} />
            <div className="hero__text">
              <p className="hero__title">{t.name}</p>
              <p className="small muted">{[t.country, t.venue, t.founded ? `Founded ${t.founded}` : null].filter(Boolean).join(" · ")}</p>
            </div>
            <FollowButton item={{ kind: "team", id: t.id, name: t.name, imageUrl: t.crestUrl ?? null }} />
          </div>
          <section className="section">
            <h2 className="section__title">Next</h2>
            {res.data.next.length ? (
              <div className="card">
                {res.data.next.map((m) => (
                  <MatchRow key={m.id} match={m} showCompetition />
                ))}
              </div>
            ) : (
              <p className="small muted pad">No upcoming matches.</p>
            )}
          </section>
          <section className="section">
            <h2 className="section__title">Results</h2>
            {res.data.last.length ? (
              <div className="card">
                {res.data.last.map((m) => (
                  <MatchRow key={m.id} match={m} showCompetition />
                ))}
              </div>
            ) : (
              <p className="small muted pad">No recent results.</p>
            )}
          </section>
          {t.squad.length > 0 && (
            <section className="section">
              <h2 className="section__title">Squad</h2>
              <ul className="card list">
                {t.squad.map((p) => (
                  <li key={p.id} className="list__row">
                    <Link href={`/player/${p.id}`} className="list__main">
                      <Crest name={p.name} src={p.photoUrl} />
                      <span>
                        <span className="list__title">
                          {p.number != null && <span className="muted">{p.number} </span>}
                          {p.name}
                        </span>
                        <span className="list__sub">{p.position}</span>
                      </span>
                    </Link>
                    <FollowButton compact item={{ kind: "player", id: p.id, name: p.name, imageUrl: p.photoUrl ?? null, teamId: t.id, teamName: t.name }} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
