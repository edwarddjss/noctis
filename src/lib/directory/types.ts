export type InferredStatus = "upcoming" | "live-inferred" | "finished-inferred" | "unknown";
export type PlayerTechnology = "hls-clappr" | "drm-bitmovin" | "unknown";

export interface PlayerOption {
  embedId: string;
  name: string;
  provider: string;
  channelId: string | null;
  technology: PlayerTechnology;
  /** Published source-site embed; playback is controlled by its provider. */
  embedPageUrl: string | null;
  /** Decoded player PAGE URL, not an HLS playlist or signed video URL. */
  playerPageUrl: string | null;
}

export interface Match {
  id: string;
  description: string;
  league: string;
  leagueSlug: string;
  /** Original source date in America/Lima; use for ?date= filtering. */
  eventDate: string | null;
  country: string | null;
  teams: string;
  /** ISO-8601 UTC, converted from the source's America/Lima wall time. */
  kickoff: string | null;
  /** Heuristic: not a real-time match status feed. */
  status: InferredStatus;
  options: PlayerOption[];
}

export type StoredMatch = Omit<Match, "status">;

export interface League {
  slug: string;
  name: string;
  country: string | null;
  matchCount: number;
}

export interface Channel {
  id: string;
  provider: string;
  matchCount: number;
  optionCount: number;
}

export interface Provider {
  host: string;
  matchCount: number;
  optionCount: number;
}

export interface DirectoryMeta {
  upstream: string;
  fetchedAt: string | null;
  stale: boolean;
  lastError: string | null;
  refreshIntervalSeconds: number;
  statusIsInferred: true;
}
