import type { NextRequest } from "next/server";
import { isValidId } from "@/lib/providers/sports/types";
import { getStreamProvider } from "@/lib/server/registry";
import { badRequest, errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

/** Returns the authorized stream for a match, or 404 when none is configured. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await ctx.params;
  if (!isValidId(matchId)) return badRequest("Invalid match id");
  try {
    const stream = await getStreamProvider().getAuthorizedStreamForMatch(matchId);
    if (!stream) return json({ error: { code: "no_authorized_stream", message: "No authorized stream available" } }, { status: 404, private: true });
    return json({ stream }, { private: true });
  } catch (e) {
    return errorResponse(e, "stream");
  }
}
