import Link from "next/link";
import type { StandingsGroup } from "@/lib/domain";
import { Crest } from "./Crest";

export function StandingsTable({ groups, highlightTeamIds = [] }: { groups: StandingsGroup[]; highlightTeamIds?: string[] }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.name} className="card table-wrap" data-testid="standings">
          {groups.length > 1 && <p className="table-title">{g.name}</p>}
          <table className="standings">
            <thead>
              <tr>
                <th scope="col" aria-label="Position">#</th>
                <th scope="col" className="left">Team</th>
                <th scope="col" title="Played">P</th>
                <th scope="col" title="Won" className="wide">W</th>
                <th scope="col" title="Drawn" className="wide">D</th>
                <th scope="col" title="Lost" className="wide">L</th>
                <th scope="col" title="Goal difference">GD</th>
                <th scope="col" title="Points">Pts</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.team.id} className={highlightTeamIds.includes(r.team.id) ? "is-highlight" : undefined}>
                  <td>{r.rank}</td>
                  <td className="left">
                    <Link href={`/team/${r.team.id}`} className="standings__team">
                      <Crest name={r.team.name} src={r.team.crestUrl} size={18} />
                      <span className="truncate">{r.team.shortName && r.team.name.length > 16 ? r.team.shortName : r.team.name}</span>
                    </Link>
                  </td>
                  <td>{r.played}</td>
                  <td className="wide">{r.won}</td>
                  <td className="wide">{r.drawn}</td>
                  <td className="wide">{r.lost}</td>
                  <td>{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
                  <td className="strong">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
