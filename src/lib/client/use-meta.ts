"use client";
import { apiGet, schemas } from "./api";
import { useApi } from "./use-api";

/** Server configuration flags (cached per page). */
export function useMeta() {
  const meta = useApi("meta", (s) => apiGet("/api/meta", schemas.meta, s));
  return { meta: meta.data, videoEnabled: meta.data ? meta.data.streamProvider !== "none" : false };
}
