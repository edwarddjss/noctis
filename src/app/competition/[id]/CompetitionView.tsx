"use client";
import { useState } from "react";
import { Attribution } from "@/components/Attribution";
import { BackButton } from "@/components/BackButton";
import { Crest } from "@/components/Crest";
import { FollowButton } from "@/components/FollowButton";
import { MatchRow } from "@/components/MatchRow";
import { StandingsTable } from "@/components/StandingsTable";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { apiGet, errorMessage, schemas } from "@/lib/client/api";
import { feedTeamIds } from "@/lib/client/follows";
import { useApi } from "@/lib/client/use-api";
import { useFollows } from "@/lib/client/use-follows";
import { useMeta } from "@/lib/client/use-meta";

type Tab = "matches" | "table";

export function CompetitionView({ id }: { id: string }) {
  const [tab, setTab] = useState<Tab>("matches");
  const { state } = useFollows();
  const { videoEnabled } = useMeta();
  const enc = encodeURIComponent(id);
  const res = useApi(`comp:${id}`, (s) => apiGet(`/api/competitions/${enc}`, schemas.competition, s), { pollMs: 30_000 });
  const table = useApi(tab === "table" ? `table:${id}` : null, (s) => apiGet(`/api/competitions/${enc}/standings`, schemas.standings, s));
  const comps = useApi("competitions", (s) => apiGet("/api/competitions", schemas.competitions, s));
  const c = res.data?.competition ?? comps.data?.competitions.find((x) => x.id === id) ?? null;

  return (
    <div className="page">
      <header className="page__header">
        <BackButton fallback="/live" />
        <h1 className="truncate">{c?.name ?? "League"}</h1>
      </header>
      {c && (
        <div className="card hero">
          <Crest name={c.name} src={c.logoUrl} size={56} round={false} />
          <div className="hero__text">
            <p className="hero__title">{c.name}</p>
            <p className="small muted">{[c.country, c.season].filter(Boolean).join(" · ")}</p>
          </div>
          <FollowButton item={{ kind: "competition", id: c.id, name: c.name, imageUrl: c.logoUrl ?? null }} />
        </div>
      )}

      <div className="segmented" role="tablist" aria-label="League sections">
        <button type="button" role="tab" aria-selected={tab === "matches"} className={tab === "matches" ? "is-active" : ""} onClick={() => setTab("matches")}>
          Matches
        </button>
        <button type="button" role="tab" aria-selected={tab === "table"} className={tab === "table" ? "is-active" : ""} onClick={() => setTab("table")}>
          Table
        </button>
      </div>

      {tab === "matches" && (
        <>
          {res.loading && !res.data && <Skeleton rows={4} />}
          {res.error != null && !res.data && <ErrorState message={errorMessage(res.error)} onRetry={res.refresh} />}
          {res.data && res.data.next.length + res.data.last.length === 0 && <EmptyState title="No matches in the last or next two weeks" />}
          {res.data && res.data.next.length > 0 && (
            <section className="section">
              <h2 className="section__title">Live & upcoming</h2>
              <div className="card">
                {res.data.next.map((m) => (
                  <MatchRow key={m.id} match={m} streamAvailable={videoEnabled ? res.data!.streams[m.id] : undefined} />
                ))}
              </div>
            </section>
          )}
          {res.data && res.data.last.length > 0 && (
            <section className="section">
              <h2 className="section__title">Results</h2>
              <div className="card">
                {res.data.last.map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {tab === "table" && (
        <section className="section">
          {table.loading && !table.data && <Skeleton rows={6} />}
          {table.error != null && !table.data && <ErrorState message={errorMessage(table.error)} onRetry={table.refresh} />}
          {table.data && table.data.groups.length === 0 && <EmptyState title="No table for this competition" />}
          {table.data && <StandingsTable groups={table.data.groups} highlightTeamIds={feedTeamIds(state)} />}
        </section>
      )}
      <Attribution />
    </div>
  );
}
