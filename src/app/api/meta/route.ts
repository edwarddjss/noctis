import { getSportsProvider, getStreamProvider } from "@/lib/server/registry";
import { errorResponse, json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const s = getSportsProvider();
    const v = getStreamProvider();
    return json({ sportsProvider: s.id, isMock: s.isMock, streamProvider: v.id, syncEnabled: Boolean(process.env.SYNC_BACKEND_URL) }, { maxAge: 60 });
  } catch (e) {
    return errorResponse(e, "meta");
  }
}
