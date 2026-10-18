import type { NextConfig } from "next";

/**
 * Content Security Policy. Stream and image hosts are derived from env at
 * BUILD time (headers are compiled into the build), so set
 * STREAM_HOST_ALLOWLIST / IMAGE_HOSTS before `next build`.
 *
 * script-src needs 'unsafe-inline' for Next's inline bootstrap scripts unless
 * you adopt nonce-based CSP via proxy.ts — see docs/SECURITY.md.
 */
const isDev = process.env.NODE_ENV !== "production";
const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9.-]+$/i.test(s))
    .map((h) => `https://${h}`);

const streamHosts = list(process.env.STREAM_HOST_ALLOWLIST);
const imageHosts = list(process.env.IMAGE_HOSTS ?? "a.espncdn.com,media.api-sports.io");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${imageHosts.join(" ")}`,
  `media-src 'self' blob: ${streamHosts.join(" ")}`,
  `connect-src 'self' ${streamHosts.join(" ")}${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "font-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
]
  .map((d) => d.trim())
  .join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
