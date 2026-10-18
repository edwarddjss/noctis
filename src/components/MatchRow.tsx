import Link from "next/link";
import type { Match } from "@/lib/domain";
import { isLive } from "@/lib/domain";
import { statusText } from "@/lib/client/format";
import { Crest } from "./Crest";
import { Icon } from "./Icon";

export function StreamBadge({ available, live }: { available: boolean; live: boolean }) {
  if (available)
    return (
      <span className="badge badge--video" title="An authorized video stream is configured for this match">
        <Icon name="video" size={12} /> Video
      </span>
    );
  if (live) return <span className="badge badge--score" title="Live score only — no authorized video stream">Score only</span>;
  return null;
}

export function MatchRow({ match, streamAvailable = false, showCompetition = false }: { match: Match; streamAvailable?: boolean; showCompetition?: boolean }) {
  const live = isLive(match.status);
  const started = match.score.home !== null;
  return (
    <Link href={`/match/${match.id}`} className={`match-row${live ? " match-row--live" : ""}`} data-testid="match-row" data-match-id={match.id}>
      <div className={`match-row__status${live ? " is-live" : ""}`} aria-label={live ? `Live, ${statusText(match)}` : statusText(match)}>
        {statusText(match)}
      </div>
      <div className="match-row__teams">
        {showCompetition && <div className="match-row__comp">{match.competition.name}</div>}
        <div className="match-row__team">
          <Crest name={match.home.name} src={match.home.crestUrl} size={20} />
          <span className="truncate">{match.home.name}</span>
          <span className="match-row__score">{started ? match.score.home : ""}</span>
        </div>
        <div className="match-row__team">
          <Crest name={match.away.name} src={match.away.crestUrl} size={20} />
          <span className="truncate">{match.away.name}</span>
          <span className="match-row__score">{started ? match.score.away : ""}</span>
        </div>
      </div>
      <div className="match-row__badges">
        <StreamBadge available={streamAvailable} live={live} />
      </div>
    </Link>
  );
}
