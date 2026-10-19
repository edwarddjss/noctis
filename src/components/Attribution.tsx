"use client";
import { apiGet, schemas } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";

/** Data-source credit, shown at the bottom of data screens. */
export function Attribution() {
  const meta = useApi("meta", (s) => apiGet("/api/meta", schemas.meta, s));
  if (!meta.data) return null;
  return <p className="tiny muted center pad">{meta.data.attribution}</p>;
}
