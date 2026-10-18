"use client";
import Link from "next/link";
import { AirPlayHelp } from "@/components/AirPlayHelp";
import { BackButton } from "@/components/BackButton";
import { ScoreHeader } from "@/components/ScoreHeader";
import { ErrorState, NoStream, Skeleton } from "@/components/States";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { ApiError, apiGet, errorMessage, schemas } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";

export function WatchView({ id }: { id: string }) {
  const stream = useApi(`stream:${id}`, (s) => apiGet(`/api/streams/${encodeURIComponent(id)}`, schemas.stream, s));
  // score keeps updating below the player, including while video is on the TV
  const match = useApi(`match:${id}`, (s) => apiGet(`/api/matches/${encodeURIComponent(id)}`, schemas.match, s), { pollMs: 20_000 });
  const m = match.data?.match;
  const s = stream.data?.stream;
  const noStream = stream.error instanceof ApiError && stream.error.status === 404;

  return (
    <div className="page page--watch">
      <header className="page__header">
        <BackButton fallback={`/match/${id}`} />
        <h1 className="truncate">{m ? `${m.home.name} vs ${m.away.name}` : "Watch"}</h1>
      </header>

      {stream.loading && !s && <Skeleton rows={1} />}
      {noStream && <NoStream />}
      {stream.error != null && !noStream && <ErrorState message={errorMessage(stream.error)} onRetry={stream.refresh} />}
      {s && (
        <>
          <VideoPlayer
            sources={s.sources}
            captions={s.captions}
            title={m ? `${m.home.name} vs ${m.away.name}` : s.label}
            subtitle={m?.competition.name}
            airplayAllowed={s.airplayAllowed}
          />
          <p className="small muted pad">
            {s.label} · {s.providerName}
            {s.isDemo && <strong> · Demo test pattern, not a real broadcast</strong>}
          </p>
          <p className="tiny muted pad">{s.rightsNote}</p>
        </>
      )}

      {m && <ScoreHeader match={m} />}
      {m && (
        <p className="pad">
          <Link href={`/match/${id}`} className="small">
            Match details
          </Link>
        </p>
      )}
      {s && <AirPlayHelp allowed={s.airplayAllowed} />}
    </div>
  );
}
