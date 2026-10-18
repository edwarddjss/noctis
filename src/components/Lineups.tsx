import type { Lineup, Match } from "@/lib/domain";

function Side({ name, lineup }: { name: string; lineup: Lineup | null }) {
  return (
    <div className="lineups__side">
      <p className="lineups__head">
        {name}
        {lineup?.formation && <span className="muted small"> · {lineup.formation}</span>}
      </p>
      {!lineup ? (
        <p className="small muted">Not announced</p>
      ) : (
        <>
          <ol aria-label={`${name} starting eleven`}>
            {lineup.starters.map((p, i) => (
              <li key={`${p.name}-${i}`}>
                <span className="num">{p.number ?? ""}</span>
                <span className="truncate">{p.name}</span>
                {p.position && <span className="pos">{p.position}</span>}
              </li>
            ))}
          </ol>
          {lineup.substitutes.length > 0 && (
            <ol className="lineups__subs" aria-label={`${name} substitutes`}>
              {lineup.substitutes.map((p, i) => (
                <li key={`${p.name}-s${i}`}>
                  <span className="num">{p.number ?? ""}</span>
                  <span className="truncate muted">{p.name}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

export function Lineups({ match, lineups }: { match: Match; lineups: { home: Lineup | null; away: Lineup | null } }) {
  return (
    <div className="card lineups" data-testid="lineups">
      <Side name={match.home.shortName ?? match.home.name} lineup={lineups.home} />
      <Side name={match.away.shortName ?? match.away.name} lineup={lineups.away} />
    </div>
  );
}
