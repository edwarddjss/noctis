import type { NextRequest } from "next/server";
import { isValidId } from "@/lib/providers/sports/types";
import { getSportsProvider } from "@/lib/server/registry";
import { badRequest, errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return badRequest("Invalid team id");
  try {
    const p = getSportsProvider();
    const [team, next, last] = await Promise.all([
      p.getTeam(id, { signal: req.signal }),
      p.getFixtures({ teamId: id, direction: "next", limit: 5 }, { signal: req.signal }),
      p.getFixtures({ teamId: id, direction: "last", limit: 5 }, { signal: req.signal }),
    ]);
    if (!team) return json({ error: { code: "not_found", message: "Team not found" } }, { status: 404 });
    return json({ team, next, last }, { maxAge: 60 });
  } catch (e) {
    return errorResponse(e, "team");
  }
}
