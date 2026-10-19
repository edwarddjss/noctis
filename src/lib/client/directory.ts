import { z } from "zod";

const option = z.object({
  embedId: z.string(), name: z.string(), provider: z.string(),
  channelId: z.string().nullable(), technology: z.string(),
  embedPageUrl: z.string().nullable(), playerPageUrl: z.string().nullable(),
});
const match = z.object({
  id: z.string(), description: z.string(), teams: z.string(), league: z.string(),
  leagueSlug: z.string(), country: z.string().nullable(), eventDate: z.string().nullable(),
  kickoff: z.string().nullable(), status: z.string(), options: z.array(option),
});
const meta = z.object({ fetchedAt: z.string().nullable(), stale: z.boolean() });
export const directoryCatalog = z.object({
  matchCount: z.number(), meta,
  leagues: z.array(z.object({ slug: z.string(), name: z.string(), country: z.string().nullable(), matches: z.array(match) })),
});
export const directoryMatch = z.object({ match, meta });

export function playerLink(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; }
  catch { return null; }
}
