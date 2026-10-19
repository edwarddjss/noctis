import type { NextRequest } from "next/server";
import { sortMatches } from "@/lib/domain";
import { getSportsProvider, getStreamProvider } from "@/lib/server/registry";
import { errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const p = getSportsProvider();
    const [live, comps] = await Promise.all([p.getLiveMatches({ signal: req.signal }), p.getCompetitions({ signal: req.signal })]);
    const matches = sortMatches(live);
    const streams = await getStreamProvider().getAvailability(matches.map((m) => m.id));
    return json({ matches, streams, order: comps.map((c) => c.id), fetchedAt: new Date().toISOString() }, { maxAge: 15 });
  } catch (e) {
    return errorResponse(e, "live");
  }
}
