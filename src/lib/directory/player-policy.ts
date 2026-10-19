/** Explicit player origins; never embed arbitrary URLs from the source feed. */
export const DIRECTORY_PLAYER_HOSTS = ["tvf90.com", "tv-90.com", "futbollibrefullhd.org"] as const;

export function embeddedPlayerUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    return DIRECTORY_PLAYER_HOSTS.some(host => host === url.hostname) ? url.href : null;
  } catch { return null; }
}
