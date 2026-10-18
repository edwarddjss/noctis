import type { NextRequest } from "next/server";
import { sortMatches } from "@/lib/domain";
import { getSportsProvider, getStreamProvider } from "@/lib/server/registry";
import { errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const matches = sortMatches(await getSportsProvider().getLiveMatches({ signal: req.signal }));
    const streams = await getStreamProvider().getAvailability(matches.map((m) => m.id));
    return json({ matches, streams, fetchedAt: new Date().toISOString() }, { maxAge: 15 });
  } catch (e) {
    return errorResponse(e, "live");
  }
}
