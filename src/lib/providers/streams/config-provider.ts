/**
 * Stream provider backed by the administrator's authorized-streams config.
 * Only streams listed there, for competitions the provider is authorized for,
 * on allowlisted hosts, inside their availability window, are ever returned.
 */
import { log } from "../../log";
import { checkStreamUrl, type UrlPolicy } from "../../security/stream-url";
import type { StreamConfig } from "./config-schema";
import type { AuthorizedStream, CaptionTrack, PlaybackMetadata, StreamProvider, StreamValidationResult } from "./types";

export interface ConfigStreamProviderOptions {
  globalAllowlist: string[];
  now?: () => number;
  /** Mock/demo mode: allow same-origin /demo/ media and mark streams as demo. */
  demo?: boolean;
}

export class ConfigStreamProvider implements StreamProvider {
  readonly id: string;
  constructor(
    private readonly config: StreamConfig,
    private readonly opts: ConfigStreamProviderOptions,
  ) {
    this.id = opts.demo ? "mock-streams" : "config-streams";
  }

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  private entry(matchId: string) {
    return this.config.streams.find((s) => s.matchId === matchId);
  }

  private build(matchId: string): AuthorizedStream | null {
    const s = this.entry(matchId);
    if (!s) return null;
    const p = this.config.providers.find((x) => x.id === s.providerId);
    if (!p) return null;
    return {
      matchId,
      providerId: p.id,
      providerName: p.name,
      label: s.label,
      sources: s.sources,
      captions: s.captions,
      rightsNote: p.rightsNote,
      airplayAllowed: p.airplayAllowed,
      isDemo: Boolean(this.opts.demo),
    };
  }

  /** URL policy for a provider (used by the admin probe). */
  policyFor(providerId: string): UrlPolicy | null {
    const p = this.config.providers.find((x) => x.id === providerId);
    return p ? { providerHosts: p.allowedHosts, globalAllowlist: this.opts.globalAllowlist, allowLocalDemo: this.opts.demo } : null;
  }

  async validateStream(stream: AuthorizedStream): Promise<StreamValidationResult> {
    const reasons: string[] = [];
    const entry = this.entry(stream.matchId);
    const provider = this.config.providers.find((p) => p.id === stream.providerId);
    if (!entry || !provider) return { ok: false, reasons: ["stream is not in the authorized configuration"] };
    if (!this.config.competitions.some((c) => c.competitionId === entry.competitionId && c.providerId === provider.id))
      reasons.push("competition is not authorized for this provider");
    const now = this.now();
    if (entry.availableFrom && Date.parse(entry.availableFrom) > now) reasons.push("stream window has not opened");
    if (entry.availableUntil && Date.parse(entry.availableUntil) < now) reasons.push("stream window has closed");
    const policy = { providerHosts: provider.allowedHosts, globalAllowlist: this.opts.globalAllowlist, allowLocalDemo: this.opts.demo };
    for (const src of [...stream.sources.map((s) => s.url), ...stream.captions.map((c) => c.src)]) {
      const why = checkStreamUrl(src, policy);
      if (why) reasons.push(why);
    }
    return { ok: reasons.length === 0, reasons };
  }

  async getAuthorizedStreamForMatch(matchId: string): Promise<AuthorizedStream | null> {
    const stream = this.build(matchId);
    if (!stream) return null;
    const v = await this.validateStream(stream);
    if (!v.ok) {
      log.warn("streams.rejected", { matchId, reasons: v.reasons });
      return null;
    }
    // Extension point: if the provider requires short-lived signed URLs, mint
    // them here server-side using provider credentials from env vars.
    return stream;
  }

  async getCaptions(matchId: string): Promise<CaptionTrack[]> {
    return (await this.getAuthorizedStreamForMatch(matchId))?.captions ?? [];
  }

  async getPlaybackMetadata(matchId: string): Promise<PlaybackMetadata | null> {
    const s = await this.getAuthorizedStreamForMatch(matchId);
    if (!s) return null;
    return { matchId, title: s.label, providerName: s.providerName, rightsNote: s.rightsNote, airplayAllowed: s.airplayAllowed, isDemo: s.isDemo };
  }

  async getAvailability(matchIds: string[]): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    await Promise.all(matchIds.map(async (id) => (out[id] = (await this.getAuthorizedStreamForMatch(id)) !== null)));
    return out;
  }
}
