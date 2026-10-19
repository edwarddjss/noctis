import type { NextRequest } from "next/server";
import { getSportsProvider } from "@/lib/server/registry";
import { errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    return json({ competitions: await getSportsProvider().getCompetitions({ signal: req.signal }) }, { maxAge: 3600 });
  } catch (e) {
    return errorResponse(e, "competitions");
  }
}
