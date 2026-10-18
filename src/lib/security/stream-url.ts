/**
 * Policy for which media URLs may ever reach the player. A URL is playable only
 * if it is https, has no embedded credentials, uses the default port, and its
 * host is on BOTH the provider's allowedHosts and the deployment allowlist
 * (STREAM_HOST_ALLOWLIST). There is no "play any URL" path in the app.
 */
export interface UrlPolicy {
  providerHosts: string[];
  globalAllowlist: string[];
  /** Same-origin demo media under /demo/ (mock provider only). */
  allowLocalDemo?: boolean;
}

export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

const IP_LITERAL = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;

export function checkStreamUrl(raw: string, policy: UrlPolicy): string | null {
  if (policy.allowLocalDemo && /^\/demo\/[A-Za-z0-9._\/-]+$/.test(raw) && !raw.includes("..")) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "not an absolute URL";
  }
  if (u.protocol !== "https:") return "only https URLs are allowed";
  if (u.username || u.password) return "credentials in URL are not allowed";
  if (u.port && u.port !== "443") return "non-default ports are not allowed";
  const host = u.hostname.toLowerCase();
  if (IP_LITERAL.test(host) || host.includes(":")) return "IP-address hosts are not allowed";
  if (!policy.providerHosts.map((h) => h.toLowerCase()).includes(host)) return "host not in provider allowedHosts";
  if (!policy.globalAllowlist.includes(host)) return "host not in STREAM_HOST_ALLOWLIST";
  return null;
}

/** Private / reserved address check used before any server-side probe (SSRF). */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const [a, b] = v4.split(".").map(Number) as [number, number, number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast + reserved
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") || // unique local
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") || // link-local
    v6.startsWith("ff") || // multicast
    v6.startsWith("64:ff9b") ||
    v6.startsWith("2001:db8")
  );
}
