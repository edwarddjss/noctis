import type { NextRequest } from "next/server";
import { isValidId } from "@/lib/providers/sports/types";
import { getSportsProvider } from "@/lib/server/registry";
import { badRequest, errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return badRequest("Invalid player id");
  try {
    const player = await getSportsProvider().getPlayer(id, { signal: req.signal });
    if (!player) return json({ error: { code: "not_found", message: "Player not found" } }, { status: 404 });
    return json({ player }, { maxAge: 3600 });
  } catch (e) {
    return errorResponse(e, "player");
  }
}
