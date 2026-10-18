import type { NextRequest } from "next/server";
import { isValidId } from "@/lib/providers/sports/types";
import { getSportsProvider, getStreamProvider } from "@/lib/server/registry";
import { badRequest, errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return badRequest("Invalid competition id");
  try {
    const p = getSportsProvider();
    const opts = { signal: req.signal };
    const [next, last] = await Promise.all([
      p.getFixtures({ competitionId: id, direction: "next", limit: 10 }, opts),
      p.getFixtures({ competitionId: id, direction: "last", limit: 10 }, opts),
    ]);
    const competition = next[0]?.competition ?? last[0]?.competition ?? null;
    const streams = await getStreamProvider().getAvailability(next.map((m) => m.id));
    return json({ competition, next, last, streams }, { maxAge: 60 });
  } catch (e) {
    return errorResponse(e, "competition");
  }
}
