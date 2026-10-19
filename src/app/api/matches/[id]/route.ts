import type { NextRequest } from "next/server";
import { isValidId } from "@/lib/providers/sports/types";
import { getSportsProvider, getStreamProvider } from "@/lib/server/registry";
import { badRequest, errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return badRequest("Invalid match id");
  try {
    const [match, meta] = await Promise.all([
      getSportsProvider().getMatchDetails(id, { signal: req.signal }),
      getStreamProvider().getPlaybackMetadata(id),
    ]);
    if (!match) return json({ error: { code: "not_found", message: "Match not found" } }, { status: 404 });
    return json({ match, playback: meta }, { maxAge: 15 });
  } catch (e) {
    return errorResponse(e, "match");
  }
}
