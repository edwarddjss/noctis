import type { NextRequest } from "next/server";
import { isValidDate } from "@/lib/providers/sports/types";
import { getSportsProvider, getStreamProvider } from "@/lib/server/registry";
import { badRequest, errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

/** All covered matches on a day: /api/matches?date=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!isValidDate(date)) return badRequest("date must be YYYY-MM-DD");
  try {
    const p = getSportsProvider();
    const [matches, comps] = await Promise.all([p.getMatchesByDate(date, { signal: req.signal }), p.getCompetitions({ signal: req.signal })]);
    const streams = await getStreamProvider().getAvailability(matches.map((m) => m.id));
    return json({ matches, streams, order: comps.map((c) => c.id), fetchedAt: new Date().toISOString() }, { maxAge: 30 });
  } catch (e) {
    return errorResponse(e, "matches_by_date");
  }
}
