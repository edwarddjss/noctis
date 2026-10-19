import { json } from "@/lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * Optional account-backed sync. Not wired to any backend by default: follows
 * live on-device. To enable, implement auth (e.g. your identity provider's
 * session) and forward to SYNC_BACKEND_URL server-side. See docs/ARCHITECTURE.md.
 */
function notConfigured() {
  return json({ error: { code: "not_configured", message: "Account sync is not configured" } }, { status: 501 });
}
export const GET = notConfigured;
export const PUT = notConfigured;
