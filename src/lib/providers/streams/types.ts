import { z } from "zod";

export const StreamSourceSchema = z.object({
  url: z.string().min(1).max(2048),
  type: z.enum(["hls", "mp4", "webm"]),
});
export type StreamSource = z.infer<typeof StreamSourceSchema>;

export const CaptionTrackSchema = z.object({
  src: z.string().min(1).max(2048),
  srclang: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/),
  label: z.string().min(1).max(60),
  default: z.boolean().optional(),
});
export type CaptionTrack = z.infer<typeof CaptionTrackSchema>;

/** What the browser receives for an authorized match stream. */
export const AuthorizedStreamSchema = z.object({
  matchId: z.string(),
  providerId: z.string(),
  providerName: z.string(),
  label: z.string(),
  sources: z.array(StreamSourceSchema).min(1),
  captions: z.array(CaptionTrackSchema),
  rightsNote: z.string(),
  airplayAllowed: z.boolean(),
  isDemo: z.boolean(),
});
export type AuthorizedStream = z.infer<typeof AuthorizedStreamSchema>;

export interface PlaybackMetadata {
  matchId: string;
  title: string;
  providerName: string;
  rightsNote: string;
  airplayAllowed: boolean;
  isDemo: boolean;
}

export interface StreamValidationResult {
  ok: boolean;
  reasons: string[];
}

export interface StreamProvider {
  readonly id: string;
  /** Returns null when no authorized stream is configured (the common case). */
  getAuthorizedStreamForMatch(matchId: string, opts?: { signal?: AbortSignal }): Promise<AuthorizedStream | null>;
  /** Static policy checks (allowlist, scheme, provider, window). No network. */
  validateStream(stream: AuthorizedStream): Promise<StreamValidationResult>;
  getCaptions(matchId: string): Promise<CaptionTrack[]>;
  getPlaybackMetadata(matchId: string): Promise<PlaybackMetadata | null>;
  /** Cheap lookup for list views ("video available" badges). */
  getAvailability(matchIds: string[]): Promise<Record<string, boolean>>;
}
