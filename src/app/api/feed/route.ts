import type { NextRequest } from "next/server";
import type { Match } from "@/lib/domain";
import { sortMatches } from "@/lib/domain";
import { isValidId } from "@/lib/providers/sports/types";
import { getSportsProvider, getStreamProvider } from "@/lib/server/registry";
import { badRequest, errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";
const MAX_IDS = 30;

function ids(raw: string | null): string[] | null {
  const list = (raw ?? "").split(",").filter(Boolean);
  if (list.length > MAX_IDS || !list.every(isValidId)) return null;
  return [...new Set(list)];
}

/** Matches for everything the user follows: upcoming/live + recent results. */
export async function GET(req: NextRequest) {
  const teams = ids(req.nextUrl.searchParams.get("teams"));
  const comps = ids(req.nextUrl.searchParams.get("competitions"));
  if (!teams || !comps) return badRequest(`Provide up to ${MAX_IDS} valid ids per list`);
  try {
    const p = getSportsProvider();
    const opts = { signal: req.signal };
    const jobs: Promise<Match[]>[] = [];
    for (const teamId of teams) {
      jobs.push(p.getFixtures({ teamId, direction: "next", limit: 3 }, opts), p.getFixtures({ teamId, direction: "last", limit: 3 }, opts));
    }
    for (const competitionId of comps) {
      jobs.push(p.getFixtures({ competitionId, direction: "next", limit: 5 }, opts), p.getFixtures({ competitionId, direction: "last", limit: 3 }, opts));
    }
    // One failing team shouldn't blank the whole feed.
    const settled = await Promise.allSettled(jobs);
    const byId = new Map<string, Match>();
    let failures = 0;
    for (const r of settled) {
      if (r.status === "fulfilled") r.value.forEach((m) => byId.set(m.id, m));
      else failures++;
    }
    if (failures && failures === settled.length) throw (settled[0] as PromiseRejectedResult).reason;
    const matches = sortMatches([...byId.values()]);
    const streams = await getStreamProvider().getAvailability(matches.map((m) => m.id));
    return json({ matches, streams, partial: failures > 0 }, { maxAge: 20 });
  } catch (e) {
    return errorResponse(e, "feed");
  }
}
