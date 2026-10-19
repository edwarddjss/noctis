import type { NextRequest } from "next/server";
import { normalizeQuery } from "@/lib/providers/sports/types";
import { getSportsProvider } from "@/lib/server/registry";
import { badRequest, errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = normalizeQuery(req.nextUrl.searchParams.get("q") ?? "");
  const kind = req.nextUrl.searchParams.get("kind") ?? "teams";
  if (!q) return badRequest("Search needs 3–40 letters or numbers");
  if (!["teams", "players", "competitions"].includes(kind)) return badRequest("Unknown search kind");
  try {
    const p = getSportsProvider();
    const opts = { signal: req.signal };
    if (kind === "players") return json({ players: await p.searchPlayers(q, opts) }, { maxAge: 3600 });
    if (kind === "competitions") return json({ competitions: await p.getCompetitions({ ...opts, search: q }) }, { maxAge: 3600 });
    return json({ teams: await p.searchTeams(q, opts) }, { maxAge: 3600 });
  } catch (e) {
    return errorResponse(e, "search");
  }
}
