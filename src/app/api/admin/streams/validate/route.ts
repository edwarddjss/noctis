import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { isValidId } from "@/lib/providers/sports/types";
import { probeStreamUrl } from "@/lib/security/probe";
import { getStreamProvider } from "@/lib/server/registry";
import { badRequest, errorResponse, json } from "@/lib/server/respond";
import { ConfigStreamProvider } from "@/lib/providers/streams/config-provider";

export const dynamic = "force-dynamic";

const Body = z.object({ matchId: z.string().refine(isValidId), probe: z.boolean().default(false) });

function authorized(req: NextRequest): boolean {
  const expected = process.env.ADMIN_API_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 24) return false; // refuse weak/missing tokens
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Admin-only: check that a configured stream passes policy and (optionally)
 * that its URLs answer like real media, using an SSRF-safe probe. It only ever
 * probes URLs already present in the admin config — never caller-supplied URLs.
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return json({ error: { code: "unauthorized", message: "Admin token required" } }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Body must be { matchId, probe? }");
  try {
    const provider = getStreamProvider();
    const stream = await provider.getAuthorizedStreamForMatch(parsed.data.matchId);
    if (!stream) return json({ ok: false, reasons: ["no authorized stream passes policy for this match"] }, { private: true });
    const policyResult = await provider.validateStream(stream);
    let probes: unknown[] = [];
    if (parsed.data.probe && !stream.isDemo && provider instanceof ConfigStreamProvider) {
      const policy = provider.policyFor(stream.providerId);
      if (policy) probes = await Promise.all(stream.sources.map(async (s) => ({ type: s.type, ...(await probeStreamUrl(s.url, s.type, policy)) })));
    }
    return json({ ...policyResult, probes }, { private: true });
  } catch (e) {
    return errorResponse(e, "admin.validate");
  }
}
