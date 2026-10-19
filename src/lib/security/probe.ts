/**
 * Server-side reachability probe for an admin-configured stream URL, with SSRF
 * protection: allowlist check, DNS resolution with private-range rejection,
 * manual redirect handling (each hop re-checked), short timeout and a small
 * read limit. Used only by the admin validation endpoint.
 *
 * Residual risk: DNS can change between our lookup and the connection
 * (rebinding). Allowlisting exact provider hostnames is the primary control;
 * for stronger guarantees run probes from an egress-restricted worker.
 */
import { lookup } from "node:dns/promises";
import { checkStreamUrl, isPrivateAddress, type UrlPolicy } from "./stream-url";

export interface ProbeResult {
  ok: boolean;
  status?: number;
  contentType?: string;
  reason?: string;
}

export interface ProbeDeps {
  resolve?: (host: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
}

const defaultResolve = async (host: string) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

export async function probeStreamUrl(url: string, kind: "hls" | "mp4" | "webm", policy: UrlPolicy, deps: ProbeDeps = {}): Promise<ProbeResult> {
  const resolve = deps.resolve ?? defaultResolve;
  const fetchImpl = deps.fetchImpl ?? fetch;
  let current = url;
  for (let hop = 0; hop < 3; hop++) {
    const why = checkStreamUrl(current, { ...policy, allowLocalDemo: false });
    if (why) return { ok: false, reason: why };
    const host = new URL(current).hostname;
    let addrs: string[];
    try {
      addrs = await resolve(host);
    } catch {
      return { ok: false, reason: "DNS resolution failed" };
    }
    if (addrs.length === 0 || addrs.some(isPrivateAddress)) return { ok: false, reason: "host resolves to a private or reserved address" };

    let res: Response;
    try {
      res = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        headers: { range: "bytes=0-2047", accept: "*/*" },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
    } catch {
      return { ok: false, reason: "request failed or timed out" };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, status: res.status, reason: "redirect without location" };
      current = new URL(loc, current).toString();
      continue;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) return { ok: false, status: res.status, contentType, reason: "non-success status" };
    if (kind === "hls") {
      const reader = res.body?.getReader();
      const first = reader ? await reader.read() : { value: undefined };
      await reader?.cancel().catch(() => {});
      const text = first.value ? new TextDecoder().decode(first.value.slice(0, 2048)) : "";
      if (!text.startsWith("#EXTM3U")) return { ok: false, status: res.status, contentType, reason: "not an HLS playlist" };
    } else {
      await res.body?.cancel().catch(() => {});
    }
    return { ok: true, status: res.status, contentType };
  }
  return { ok: false, reason: "too many redirects" };
}
