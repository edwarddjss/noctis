"use client";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { apiGet, errorMessage } from "@/lib/client/api";
import { directoryMatch } from "@/lib/client/directory";
import { embeddedPlayerUrl } from "@/lib/directory/player-policy";
import { useApi } from "@/lib/client/use-api";

export function DirectoryMatchView({ id }: { id: string }) {
  const res = useApi(`directory:${id}`, signal => apiGet(`/api/v1/matches/${encodeURIComponent(id)}`, directoryMatch, signal), { pollMs: 60_000 });
  const match = res.data?.match;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = match?.options.find(option => option.embedId === selectedId);
  const selectedUrl = selected ? embeddedPlayerUrl(selected.playerPageUrl) ?? embeddedPlayerUrl(selected.embedPageUrl) : null;
  return <div className="page">
    <header className="page__header"><Link href="/live">← Matches</Link></header>
    {res.loading && !match && <Skeleton rows={3} />}
    {res.error != null && !match && <ErrorState message={errorMessage(res.error)} onRetry={res.refresh} />}
    {match && <>
      <h1>{match.teams}</h1><p className="muted pad">{match.league}{match.country ? ` · ${match.country}` : ""}</p>
      <p className="pad">{match.kickoff ? new Date(match.kickoff).toLocaleString() : "Time unavailable"}</p>
      <h2 className="section__title">Channel options</h2>
      <p className="small muted pad">Watch here. New tabs, popups, and page redirects are blocked.</p>
      {selected && selectedUrl && <section className="embedded-player" aria-label="Selected channel">
        <div className="embedded-player__header"><span>{selected.name}</span><button type="button" className="btn btn--ghost btn--small" onClick={() => setSelectedId(null)}>Close player</button></div>
        <iframe key={`${id}:${selected.embedId}`} title={`${match.teams} — ${selected.name}`} src={selectedUrl}
          sandbox="allow-scripts allow-same-origin"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerPolicy="no-referrer" allowFullScreen data-testid="directory-player" />
        <p className="tiny muted pad">If this channel won&apos;t play in the protected player, try another option. Ads inside the provider&apos;s video may still appear.</p>
      </section>}
      {res.data?.meta.stale && <p className="small muted pad">Showing the last available directory.</p>}
      {!match.options.length && <EmptyState icon="live" title="No channel options available" />}
      <ul className="card list">{match.options.map(option => {
        const href = embeddedPlayerUrl(option.playerPageUrl) ?? embeddedPlayerUrl(option.embedPageUrl);
        return <li className="list__row" key={option.embedId}><span className="list__main"><span>
          <span className="list__title">{option.name}</span><span className="list__sub">{option.provider}{option.channelId ? ` · ${option.channelId}` : ""}</span>
        </span></span>{href ? <button type="button" className="btn btn--small" onClick={() => setSelectedId(option.embedId)} aria-pressed={selectedId === option.embedId}>{selectedId === option.embedId ? "Selected" : "Watch"}</button> : <span className="muted">Unavailable</span>}</li>;
      })}</ul>
    </>}
  </div>;
}
