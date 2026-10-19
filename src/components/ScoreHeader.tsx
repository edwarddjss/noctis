import Link from "next/link";
import type { Match } from "@/lib/domain";
import { isLive } from "@/lib/domain";
import { statusText } from "@/lib/client/format";
import { Crest } from "./Crest";

export function ScoreHeader({ match: m, compact = false }: { match: Match; compact?: boolean }) {
  const started = m.score.home !== null;
  const live = isLive(m.status);
  return (
    <div className={`score-header card${compact ? " score-header--compact" : ""}`} data-testid="score-header">
      {!compact && (
        <Link href={`/competition/${m.competition.id}`} className="score-header__comp small muted">
          {m.competition.name}
        </Link>
      )}
      <div className="score-header__row">
        <div className="score-header__team">
          <Crest name={m.home.name} src={m.home.crestUrl} size={compact ? 24 : 44} />
          <span className="truncate">{m.home.name}</span>
        </div>
        <div className="score-header__score">
          <span className="score-header__nums" aria-label={started ? `${m.score.home} to ${m.score.away}` : "Not started"}>
            {started ? `${m.score.home} – ${m.score.away}` : "vs"}
          </span>
          <span className={`pill${live ? " pill--live" : ""}`}>{live ? `LIVE ${statusText(m)}` : statusText(m)}</span>
        </div>
        <div className="score-header__team">
          <Crest name={m.away.name} src={m.away.crestUrl} size={compact ? 24 : 44} />
          <span className="truncate">{m.away.name}</span>
        </div>
      </div>
    </div>
  );
}
