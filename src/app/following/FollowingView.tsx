"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Attribution } from "@/components/Attribution";
import { Crest } from "@/components/Crest";
import { FollowButton } from "@/components/FollowButton";
import { Icon } from "@/components/Icon";
import { PlayerCard } from "@/components/PlayerCard";
import { MatchRow } from "@/components/MatchRow";
import { EmptyState, ErrorState, Skeleton } from "@/components/States";
import { isLive } from "@/lib/domain";
import { apiGet, errorMessage, schemas } from "@/lib/client/api";
import { feedCompetitionIds, feedTeamIds, type FollowItem } from "@/lib/client/follows";
import { useApi } from "@/lib/client/use-api";
import { useFollows } from "@/lib/client/use-follows";
import { useMeta } from "@/lib/client/use-meta";

type Kind = "teams" | "players" | "competitions";
const KIND_LABEL: Record<Kind, string> = { teams: "Teams", players: "Players", competitions: "Leagues" };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SearchPanel() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("players");
  const dq = useDebounced(q.trim(), 300);
  const key = dq.length >= 3 ? `${kind}:${dq}` : null;
  const res = useApi(key, async (signal) => {
    const url = `/api/search?kind=${kind}&q=${encodeURIComponent(dq)}`;
    if (kind === "players") return { kind, query: dq, items: (await apiGet(url, schemas.players, signal)).players };
    if (kind === "competitions") return { kind, query: dq, items: (await apiGet(url, schemas.competitions, signal)).competitions };
    return { kind, query: dq, items: (await apiGet(url, schemas.teams, signal)).teams };
  });

  return (
    <section className="discovery-search" aria-label="Search">
      <div className="search__box">
        <Icon name="search" size={18} />
        <input
          type="search"
          inputMode="search"
          placeholder={kind === "players" ? "Search any player…" : `Search ${KIND_LABEL[kind].toLowerCase()}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={40}
          aria-label={`Search ${KIND_LABEL[kind]}`}
          data-testid="search-input"
          autoComplete="off"
          enterKeyHint="search"
        />
        {q && (
          <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQ("")}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      <div className="segmented" role="tablist" aria-label="Search type">
        {(["players", "teams", "competitions"] as Kind[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? "is-active" : ""} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {!q.trim() && kind === "players" && <div className="search-suggestions"><span>Try</span>{["Vini Jr", "Neymar", "Estêvão", "Messi"].map(name => <button key={name} type="button" onClick={() => setQ(name)}>{name}</button>)}</div>}
      {q.trim().length > 0 && q.trim().length < 3 && <p className="small muted pad">Type at least 3 characters.</p>}
      {key && res.loading && !res.data && <Skeleton rows={2} />}
      {key && res.error != null && <ErrorState message={errorMessage(res.error)} onRetry={res.refresh} />}
      {key && res.data && res.data.query === dq && res.data.items.length === 0 && <p className="small muted pad">No {KIND_LABEL[kind].toLowerCase()} found for “{dq}”.</p>}
      {key && res.data && res.data.query === dq && dq === q.trim() && res.data.items.length > 0 && (
        <ul className={res.data.kind === "players" ? "player-grid" : "card list"} data-testid="search-results">
          {res.data.kind === "teams" &&
            res.data.items.map((t) => (
              <li key={t.id} className="list__row">
                <Link href={`/team/${t.id}`} className="list__main">
                  <Crest name={t.name} src={t.crestUrl} />
                  <span>
                    <span className="list__title">{t.name}</span>
                    {t.country && <span className="list__sub">{t.country}</span>}
                  </span>
                </Link>
                <FollowButton compact item={{ kind: "team", id: t.id, name: t.name, imageUrl: t.crestUrl ?? null }} />
              </li>
            ))}
          {res.data.kind === "players" && res.data.items.map(p => <li key={p.id}><PlayerCard player={p} /></li>)}
          {res.data.kind === "competitions" &&
            res.data.items.map((c) => (
              <li key={c.id} className="list__row">
                <Link href={`/competition/${c.id}`} className="list__main">
                  <Crest name={c.name} src={c.logoUrl} round={false} />
                  <span>
                    <span className="list__title">{c.name}</span>
                    {c.country && <span className="list__sub">{c.country}</span>}
                  </span>
                </Link>
                <FollowButton compact item={{ kind: "competition", id: c.id, name: c.name, imageUrl: c.logoUrl ?? null }} />
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

function FollowChips({ items, onRemove }: { items: FollowItem[]; onRemove: (i: FollowItem) => void }) {
  if (!items.length) return null;
  const href = (i: FollowItem) => (i.kind === "team" ? `/team/${i.id}` : i.kind === "player" ? `/player/${i.id}` : `/competition/${i.id}`);
  return (
    <ul className="chips" aria-label="You follow" data-testid="follow-chips">
      {items.map((i) => (
        <li key={`${i.kind}:${i.id}`} className="chip">
          <Link href={href(i)} className="chip__main">
            <Crest name={i.name} src={i.imageUrl} size={20} round={i.kind !== "competition"} />
            <span className="truncate">{i.name}</span>
          </Link>
          <button type="button" className="chip__x" aria-label={`Unfollow ${i.name}`} onClick={() => onRemove(i)}>
            <Icon name="close" size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function PopularLeagues() {
  const comps = useApi("competitions", (s) => apiGet("/api/competitions", schemas.competitions, s));
  if (!comps.data) return null;
  return (
    <section className="section" aria-label="Popular leagues">
      <h2 className="section__title">Popular leagues</h2>
      <ul className="card list" data-testid="popular-leagues">
        {comps.data.competitions.slice(0, 8).map((c) => (
          <li key={c.id} className="list__row">
            <Link href={`/competition/${c.id}`} className="list__main">
              <Crest name={c.name} src={c.logoUrl} round={false} />
              <span>
                <span className="list__title">{c.name}</span>
                {c.country && <span className="list__sub">{c.country}</span>}
              </span>
            </Link>
            <FollowButton compact item={{ kind: "competition", id: c.id, name: c.name, imageUrl: c.logoUrl ?? null }} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FollowingView() {
  const { state, store } = useFollows();
  const { videoEnabled } = useMeta();
  const teams = useMemo(() => feedTeamIds(state), [state]);
  const comps = useMemo(() => feedCompetitionIds(state), [state]);
  const hasFollows = teams.length + comps.length > 0;
  const feedKey = hasFollows ? `feed:${teams.join(",")}|${comps.join(",")}` : null;
  const feed = useApi(feedKey, (signal) => apiGet(`/api/feed?teams=${teams.join(",")}&competitions=${comps.join(",")}`, schemas.feed, signal), { pollMs: 30_000 });

  const live = feed.data?.matches.filter((m) => isLive(m.status)) ?? [];
  const upcoming = feed.data?.matches.filter((m) => m.status === "scheduled") ?? [];
  const results = (feed.data?.matches.filter((m) => m.status === "finished") ?? []).sort((a, b) => b.kickoff.localeCompare(a.kickoff));

  return (
    <div className="page">
      <header className="page__header">
        <div><p className="eyebrow">NOCTIS</p><h1>Discover</h1><p className="page-subtitle">Find a player. Keep up with their club.</p></div>
      </header>
      <SearchPanel />
      <FollowChips items={state.items} onRemove={(i) => store.unfollow(i.kind, i.id)} />

      {!hasFollows && (
        <>
          <p className="small muted discovery-note">Follow a player to add their club’s matches to your feed.</p>
          <PopularLeagues />
        </>
      )}

      {hasFollows && feed.loading && !feed.data && <Skeleton rows={4} />}
      {hasFollows && feed.error != null && !feed.data && <ErrorState message={errorMessage(feed.error)} onRetry={feed.refresh} />}
      {feed.data?.partial && <p className="small muted pad">Some matches couldn't be loaded. Showing what we have.</p>}

      {hasFollows && feed.data && (
        <div data-testid="following-feed">
          {live.length > 0 && (
            <section className="section">
              <h2 className="section__title">Live now</h2>
              <div className="card">
                {live.map((m) => (
                  <MatchRow key={m.id} match={m} streamAvailable={videoEnabled ? feed.data!.streams[m.id] : undefined} showCompetition />
                ))}
              </div>
            </section>
          )}
          <section className="section">
            <h2 className="section__title">Upcoming</h2>
            {upcoming.length ? (
              <div className="card">
                {upcoming.map((m) => (
                  <MatchRow key={m.id} match={m} streamAvailable={videoEnabled ? feed.data!.streams[m.id] : undefined} showCompetition />
                ))}
              </div>
            ) : (
              <p className="small muted pad">No upcoming matches scheduled.</p>
            )}
          </section>
          <section className="section">
            <h2 className="section__title">Results</h2>
            {results.length ? (
              <div className="card">
                {results.map((m) => (
                  <MatchRow key={m.id} match={m} showCompetition />
                ))}
              </div>
            ) : (
              <p className="small muted pad">No recent results.</p>
            )}
          </section>
        </div>
      )}
      <Attribution />
    </div>
  );
}
