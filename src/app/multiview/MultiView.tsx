"use client";
/**
 * Up to four AUTHORIZED live streams side by side.
 * - every panel starts muted; sound is opt-in per panel
 * - independent mute + volume per panel
 * - expanding one panel pauses (and stops downloading) the others
 * - all panels pause while the app is in the background
 */
import { useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/BackButton";
import { Icon } from "@/components/Icon";
import { ScoreHeader } from "@/components/ScoreHeader";
import { EmptyState, ErrorState, NoStream } from "@/components/States";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import type { Match } from "@/lib/domain";
import { ApiError, apiGet, errorMessage, schemas } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";

type Layout = 1 | 2 | 4;
interface Panel {
  matchId: string | null;
  muted: boolean;
  volume: number;
}
const STORE_KEY = "matchnest:multiview:v1";
const emptyPanels = (): Panel[] => Array.from({ length: 4 }, () => ({ matchId: null, muted: true, volume: 1 }));

function loadSaved(): { layout: Layout; ids: (string | null)[] } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (raw && [1, 2, 4].includes(raw.layout) && Array.isArray(raw.ids)) return { layout: raw.layout, ids: raw.ids.slice(0, 4) };
  } catch {
    /* ignore */
  }
  return null;
}

function usePageHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return hidden;
}

function PanelView(props: {
  index: number;
  panel: Panel;
  match: Match | undefined;
  options: Match[];
  started: boolean;
  suspended: boolean;
  expanded: boolean;
  onChange: (p: Partial<Panel>) => void;
  onExpand: () => void;
}) {
  const { index, panel, match, options, started, suspended, expanded, onChange, onExpand } = props;
  const stream = useApi(panel.matchId ? `stream:${panel.matchId}` : null, (s) => apiGet(`/api/streams/${panel.matchId}`, schemas.stream, s));
  const title = match ? `${match.home.name} vs ${match.away.name}` : `Panel ${index + 1}`;

  return (
    <section className={`mv-panel${expanded ? " mv-panel--expanded" : ""}`} aria-label={`Panel ${index + 1}`} data-testid={`mv-panel-${index}`}>
      <div className="mv-panel__bar">
        <select
          value={panel.matchId ?? ""}
          onChange={(e) => onChange({ matchId: e.target.value || null, muted: true })}
          aria-label={`Match for panel ${index + 1}`}
          data-testid={`mv-select-${index}`}
        >
          <option value="">Choose a live match…</option>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.home.shortName ?? m.home.name} {m.score.home ?? ""}–{m.score.away ?? ""} {m.away.shortName ?? m.away.name}
            </option>
          ))}
          {panel.matchId && !options.some((m) => m.id === panel.matchId) && <option value={panel.matchId}>{match ? title : "Selected match"}</option>}
        </select>
        {panel.matchId && (
          <button type="button" className="icon-btn" aria-label={`Clear panel ${index + 1}`} onClick={() => onChange({ matchId: null })}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      <div className="mv-panel__body">
        {!panel.matchId && <p className="small muted center">Pick a live match with authorized video.</p>}
        {panel.matchId && stream.error instanceof ApiError && stream.error.status === 404 && <NoStream />}
        {panel.matchId && stream.error != null && !(stream.error instanceof ApiError && stream.error.status === 404) && (
          <ErrorState message={errorMessage(stream.error)} onRetry={stream.refresh} />
        )}
        {panel.matchId && stream.data && (
          <VideoPlayer
            key={panel.matchId}
            compact={!expanded}
            sources={stream.data.stream.sources}
            captions={stream.data.stream.captions}
            title={title}
            airplayAllowed={stream.data.stream.airplayAllowed}
            muted={panel.muted}
            onMutedChange={(muted) => onChange({ muted })}
            volume={panel.volume}
            onVolumeChange={(volume) => onChange({ volume })}
            suspended={suspended}
            autoPlayMuted={started}
            onExpand={onExpand}
            expanded={expanded}
            testId={`mv-player-${index}`}
          />
        )}
      </div>
      {match && <ScoreHeader match={match} compact />}
    </section>
  );
}

export function MultiView({ initialMatchId }: { initialMatchId?: string }) {
  const [layout, setLayout] = useState<Layout>(initialMatchId ? 1 : 2);
  const [panels, setPanels] = useState<Panel[]>(emptyPanels);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const hidden = usePageHidden();
  const live = useApi("live", (s) => apiGet("/api/live", schemas.live, s), { pollMs: 20_000 });

  // restore last layout, then place ?add= match in the first free panel
  useEffect(() => {
    const saved = loadSaved();
    const next = emptyPanels();
    let l: Layout = saved?.layout ?? (initialMatchId ? 1 : 2);
    saved?.ids.forEach((id, i) => (next[i]!.matchId = typeof id === "string" ? id : null));
    if (initialMatchId && !next.some((p) => p.matchId === initialMatchId)) {
      const free = next.findIndex((p, i) => i < l && !p.matchId);
      if (free >= 0) next[free]!.matchId = initialMatchId;
      else if (l < 4) {
        l = l === 1 ? 2 : 4;
        next[next.findIndex((p) => !p.matchId)]!.matchId = initialMatchId;
      } else next[0]!.matchId = initialMatchId;
    }
    setLayout(l);
    setPanels(next);
    setReady(true);
  }, [initialMatchId]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ layout, ids: panels.map((p) => p.matchId) }));
    } catch {
      /* ignore */
    }
  }, [layout, panels, ready]);

  const options = useMemo(() => (live.data?.matches ?? []).filter((m) => live.data?.streams[m.id]), [live.data]);
  const byId = useMemo(() => new Map((live.data?.matches ?? []).map((m) => [m.id, m])), [live.data]);
  const visible = panels.slice(0, layout);
  const filled = visible.filter((p) => p.matchId).length;

  const update = (i: number, patch: Partial<Panel>) => setPanels((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className={`page page--multiview${expanded !== null ? " has-expanded" : ""}`}>
      <header className="page__header">
        <BackButton fallback="/live" />
        <h1>Multi-view</h1>
        <div className="segmented segmented--inline" role="radiogroup" aria-label="Layout">
          {([1, 2, 4] as Layout[]).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={layout === n}
              className={layout === n ? "is-active" : ""}
              onClick={() => {
                setLayout(n);
                setExpanded(null);
              }}
              data-testid={`layout-${n}`}
            >
              {n}
            </button>
          ))}
        </div>
      </header>

      {layout === 4 && (
        <p className="warning" role="note" data-testid="bandwidth-warning">
          <Icon name="info" size={16} /> Four streams at once can use a lot of data and battery, and some devices can&apos;t decode four videos smoothly. If playback
          stutters, switch to 2 panels.
        </p>
      )}

      {live.error != null && !live.data && <ErrorState message={errorMessage(live.error)} onRetry={live.refresh} />}
      {live.data && options.length === 0 && (
        <EmptyState icon="video" title="No live matches with authorized video">
          Multi-view only shows matches that have an authorized stream configured.
        </EmptyState>
      )}

      <div className="row gap pad">
        {!started ? (
          <button type="button" className="btn" disabled={filled === 0} onClick={() => setStarted(true)} data-testid="mv-start">
            <Icon name="play" size={16} /> Play all (muted)
          </button>
        ) : (
          <span className="small muted">Panels start muted. Tap the speaker on a panel to hear it.</span>
        )}
      </div>

      <div className={`mv-grid mv-grid--${layout}`} data-testid="mv-grid">
        {visible.map((p, i) => (
          <PanelView
            key={i}
            index={i}
            panel={p}
            match={p.matchId ? byId.get(p.matchId) : undefined}
            options={options}
            started={started}
            suspended={hidden || (expanded !== null && expanded !== i)}
            expanded={expanded === i}
            onChange={(patch) => update(i, patch)}
            onExpand={() => setExpanded((e) => (e === i ? null : i))}
          />
        ))}
      </div>
    </div>
  );
}
