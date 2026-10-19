"use client";
import Link from "next/link";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { apiGet, errorMessage } from "@/lib/client/api";
import { directoryMatch, playerLink } from "@/lib/client/directory";
import { useApi } from "@/lib/client/use-api";

export function DirectoryMatchView({ id }: { id: string }) {
  const res = useApi(`directory:${id}`, signal => apiGet(`/api/v1/matches/${encodeURIComponent(id)}`, directoryMatch, signal), { pollMs: 60_000 });
  const match = res.data?.match;
  return <div className="page">
    <header className="page__header"><Link href="/live">← Matches</Link></header>
    {res.loading && !match && <Skeleton rows={3} />}
    {res.error != null && !match && <ErrorState message={errorMessage(res.error)} onRetry={res.refresh} />}
    {match && <>
      <h1>{match.teams}</h1><p className="muted pad">{match.league}{match.country ? ` · ${match.country}` : ""}</p>
      <p className="pad">{match.kickoff ? new Date(match.kickoff).toLocaleString() : "Time unavailable"}</p>
      <h2 className="section__title">Channel options</h2>
      <p className="small muted pad">Player pages open in a new tab. Availability is controlled by each provider.</p>
      {res.data?.meta.stale && <p className="small muted pad">Showing the last available directory.</p>}
      {!match.options.length && <EmptyState icon="live" title="No channel options available" />}
      <ul className="card list">{match.options.map(option => {
        const href = playerLink(option.playerPageUrl) ?? playerLink(option.embedPageUrl);
        return <li className="list__row" key={option.embedId}><span className="list__main"><span>
          <span className="list__title">{option.name}</span><span className="list__sub">{option.provider}{option.channelId ? ` · ${option.channelId}` : ""}</span>
        </span></span>{href ? <a className="btn btn--small" href={href} target="_blank" rel="noopener noreferrer">Open player</a> : <span className="muted">Unavailable</span>}</li>;
      })}</ul>
    </>}
  </div>;
}
