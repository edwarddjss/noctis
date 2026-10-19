import type { NextRequest } from "next/server";
import { isValidId } from "@/lib/providers/sports/types";
import { getSportsProvider } from "@/lib/server/registry";
import { badRequest, errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) return badRequest("Invalid competition id");
  try {
    return json({ groups: await getSportsProvider().getStandings(id, { signal: req.signal }) }, { maxAge: 300 });
  } catch (e) {
    return errorResponse(e, "standings");
  }
}
