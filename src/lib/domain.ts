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

export const MatchDetailsSchema = MatchSchema.extend({
  events: z.array(MatchEventSchema),
});
export type MatchDetails = z.infer<typeof MatchDetailsSchema>;

export const TeamDetailsSchema = TeamSchema.extend({
  founded: z.number().nullable().optional(),
  venue: z.string().optional(),
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

export function groupByCompetition(matches: Match[]): { competition: Competition; matches: Match[] }[] {
  const groups = new Map<string, { competition: Competition; matches: Match[] }>();
  for (const m of matches) {
    const g = groups.get(m.competition.id) ?? { competition: m.competition, matches: [] };
    g.matches.push(m);
    groups.set(m.competition.id, g);
  }
  return [...groups.values()].sort((a, b) => a.competition.name.localeCompare(b.competition.name));
}
