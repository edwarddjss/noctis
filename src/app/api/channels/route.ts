import { LIVE_CHANNELS } from "@/lib/channels";
import { json } from "@/lib/server/respond";

export function GET() {
  return json({ channels: LIVE_CHANNELS }, { private: true });
}
