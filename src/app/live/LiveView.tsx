"use client";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { apiGet, errorMessage } from "@/lib/client/api";
import { directoryCatalog } from "@/lib/client/directory";
import { useApi } from "@/lib/client/use-api";

export function LiveView() {
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState("");
  const res = useApi("directory-catalog", signal => apiGet("/api/v1/catalog", directoryCatalog, signal), { pollMs: 60_000 });
  const groups = (res.data?.leagues ?? [])
    .filter(group => !league || group.slug === league)
    .map(group => ({ ...group, matches: group.matches.filter(match =>
      `${match.teams} ${match.league} ${match.country ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ) })).filter(group => group.matches.length > 0);

  return <div className="page">
    <header className="page__header"><div><p className="eyebrow">NOCTIS</p><h1>Matchday</h1></div><Link href="/scores" className="btn btn--ghost btn--small">Scores</Link></header>
    <Link className="btn btn--ghost" href="/channels">Watch live channels →</Link>
    <p className="directory-source">Fútbol Libre · times in your timezone</p>
    <section className="directory-filter" aria-label="Filter matches">
      <div className="search__box"><input type="search" aria-label="Search matches" placeholder="Search teams or leagues" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div><label><span className="sr-only">League</span><select aria-label="League" value={league} onChange={e => setLeague(e.target.value)}>
        <option value="">All leagues</option>{res.data?.leagues.map(group => <option key={group.slug} value={group.slug}>{group.name}{group.country ? ` · ${group.country}` : ""}</option>)}
      </select></label></div>
    </section>
    {res.loading && !res.data && <Skeleton rows={5} />}
    {res.error != null && !res.data && <ErrorState message={errorMessage(res.error)} onRetry={res.refresh} />}
    {(res.data?.meta.stale || (res.error != null && res.data)) && <p className="small muted pad">Couldn&apos;t refresh. Showing the last available directory.</p>}
    {res.data && !groups.length && <EmptyState icon="live" title="No matches found">Try another search or league.</EmptyState>}
    <div data-testid="directory-list">{groups.map(group => <section className="section" key={group.slug}>
      <h2 className="section__title">{group.name}{group.country ? ` · ${group.country}` : ""}</h2>
      <ul className="card list">{group.matches.map(match => <li className="list__row directory-match" key={match.id}>
        <Link className="list__main" href={`/directory/${encodeURIComponent(match.id)}`}>
          <span><span className="list__title">{match.teams}</span><span className="list__sub">
            {match.kickoff ? new Date(match.kickoff).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "Time unavailable"}
            {` · ${match.options.length} channel option${match.options.length === 1 ? "" : "s"}`}
          </span></span><span className="directory-match__arrow" aria-hidden>↗</span>
        </Link>
      </li>)}</ul>
    </section>)}</div>
    {res.data?.meta.fetchedAt && <p className="tiny muted center pad">Updated {new Date(res.data.meta.fetchedAt).toLocaleTimeString()} · refreshes every minute</p>}
  </div>;
}
