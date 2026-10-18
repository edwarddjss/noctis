"use client";
import { BackButton } from "@/components/BackButton";
import { Crest } from "@/components/Crest";
import { FollowButton } from "@/components/FollowButton";
import { MatchRow } from "@/components/MatchRow";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { apiGet, errorMessage, schemas } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";

export function CompetitionView({ id }: { id: string }) {
  const res = useApi(`comp:${id}`, (s) => apiGet(`/api/competitions/${encodeURIComponent(id)}`, schemas.competition, s), { pollMs: 30_000 });
  const c = res.data?.competition;
  return (
    <div className="page">
      <header className="page__header">
        <BackButton fallback="/live" />
        <h1 className="truncate">{c?.name ?? "League"}</h1>
      </header>
      {res.loading && !res.data && <Skeleton rows={4} />}
      {res.error != null && !res.data && <ErrorState message={errorMessage(res.error)} onRetry={res.refresh} />}
      {res.data && !c && <EmptyState title="No fixtures found for this competition" />}
      {c && res.data && (
        <>
          <div className="card hero">
            <Crest name={c.name} src={c.logoUrl} size={56} round={false} />
            <div className="hero__text">
              <p className="hero__title">{c.name}</p>
              <p className="small muted">{[c.country, c.season].filter(Boolean).join(" · ")}</p>
            </div>
            <FollowButton item={{ kind: "competition", id: c.id, name: c.name, imageUrl: c.logoUrl ?? null }} />
          </div>
          <section className="section">
            <h2 className="section__title">Live & upcoming</h2>
            <div className="card">
              {res.data.next.map((m) => (
                <MatchRow key={m.id} match={m} streamAvailable={res.data!.streams[m.id]} />
              ))}
            </div>
          </section>
          <section className="section">
            <h2 className="section__title">Results</h2>
            <div className="card">
              {res.data.last.map((m) => (
                <MatchRow key={m.id} match={m} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
