/**
 * Provider-neutral domain model. Every adapter maps its own wire format into
 * these types, so UI code never sees a provider's raw response.
 */
import { z } from "zod";

export const MatchStatusSchema = z.enum([
  "scheduled",
  "live",
  "halftime",
  "finished",
  "postponed",
  "cancelled",
  "unknown",
]);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string().optional(),
  country: z.string().optional(),
  crestUrl: z.string().nullable().optional(),
  national: z.boolean().optional(),
});
export type Team = z.infer<typeof TeamSchema>;

export const CompetitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string().optional(),
  logoUrl: z.string().nullable().optional(),
  type: z.enum(["league", "cup", "other"]).optional(),
  season: z.number().optional(),
});
export type Competition = z.infer<typeof CompetitionSchema>;

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  nationality: z.string().optional(),
  position: z.string().optional(),
  photoUrl: z.string().nullable().optional(),
  age: z.number().optional(),
  number: z.number().nullable().optional(),
  teamId: z.string().optional(),
  teamName: z.string().optional(),
});
export type Player = z.infer<typeof PlayerSchema>;

export const MatchSchema = z.object({
  id: z.string(),
  competition: CompetitionSchema,
  kickoff: z.string(), // ISO 8601
  status: MatchStatusSchema,
  statusLabel: z.string(),
  minute: z.number().nullable(),
  home: TeamSchema,
  away: TeamSchema,
  score: z.object({ home: z.number().nullable(), away: z.number().nullable() }),
  venue: z.string().optional(),
  round: z.string().optional(),
});
export type Match = z.infer<typeof MatchSchema>;

export const MatchEventSchema = z.object({
  minute: z.number(),
  extra: z.number().nullable().optional(),
  type: z.enum(["goal", "card", "substitution", "var", "other"]),
  side: z.enum(["home", "away"]),
  player: z.string().optional(),
  detail: z.string().optional(),
});
export type MatchEvent = z.infer<typeof MatchEventSchema>;

export const LineupPlayerSchema = z.object({
  name: z.string(),
  number: z.number().nullable().optional(),
  position: z.string().optional(),
});
export const LineupSchema = z.object({
  formation: z.string().optional(),
  starters: z.array(LineupPlayerSchema),
  substitutes: z.array(LineupPlayerSchema),
});
export type Lineup = z.infer<typeof LineupSchema>;

export const MatchDetailsSchema = MatchSchema.extend({
  events: z.array(MatchEventSchema),
  lineups: z.object({ home: LineupSchema.nullable(), away: LineupSchema.nullable() }).optional(),
});
export type MatchDetails = z.infer<typeof MatchDetailsSchema>;

export const TeamDetailsSchema = TeamSchema.extend({
  founded: z.number().nullable().optional(),
  venue: z.string().optional(),
  /** Main domestic league, for linking to its table. */
  competitionId: z.string().optional(),
  squad: z.array(PlayerSchema),
});
export type TeamDetails = z.infer<typeof TeamDetailsSchema>;

export function isLive(status: MatchStatus): boolean {
  return status === "live" || status === "halftime";
}

/** Stable sort: live first, then by kickoff. */
export function sortMatches(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => {
    const la = isLive(a.status) ? 0 : 1;
    const lb = isLive(b.status) ? 0 : 1;
    if (la !== lb) return la - lb;
    return a.kickoff.localeCompare(b.kickoff);
  });
}

/** Groups by competition; `order` (competition ids, most important first) controls group order. */
export function groupByCompetition(matches: Match[], order: string[] = []): { competition: Competition; matches: Match[] }[] {
  const groups = new Map<string, { competition: Competition; matches: Match[] }>();
  for (const m of matches) {
    const g = groups.get(m.competition.id) ?? { competition: m.competition, matches: [] };
    g.matches.push(m);
    groups.set(m.competition.id, g);
  }
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...groups.values()].sort((a, b) => rank(a.competition.id) - rank(b.competition.id) || a.competition.name.localeCompare(b.competition.name));
}

export const StandingRowSchema = z.object({
  rank: z.number(),
  team: TeamSchema,
  played: z.number(),
  won: z.number(),
  drawn: z.number(),
  lost: z.number(),
  goalsFor: z.number(),
  goalsAgainst: z.number(),
  goalDifference: z.number(),
  points: z.number(),
  note: z.string().optional(),
});
export type StandingRow = z.infer<typeof StandingRowSchema>;

export const StandingsGroupSchema = z.object({ name: z.string(), rows: z.array(StandingRowSchema) });
export type StandingsGroup = z.infer<typeof StandingsGroupSchema>;
