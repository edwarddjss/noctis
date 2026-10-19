import type { StreamProvider } from "./types";

/** Default until an authorized streaming source is configured: no streams anywhere. */
export class NoStreamProvider implements StreamProvider {
  readonly id = "none";
  async getAuthorizedStreamForMatch() {
    return null;
  }
  async validateStream() {
    return { ok: false, reasons: ["no stream provider configured"] };
  }
  async getCaptions() {
    return [];
  }
  async getPlaybackMetadata() {
    return null;
  }
  async getAvailability(matchIds: string[]) {
    return Object.fromEntries(matchIds.map((id) => [id, false]));
  }
}
