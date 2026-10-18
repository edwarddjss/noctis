"use client";
import { useEffect } from "react";
import { schemas, apiGet } from "@/lib/client/api";
import { useApi } from "@/lib/client/use-api";

/** Mock-data banner + service-worker registration. */
export function AppChrome() {
  const meta = useApi("meta", (s) => apiGet("/api/meta", schemas.meta, s));

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  if (!meta.data?.isMock) return null;
  return (
    <div className="mock-banner" role="note" data-testid="mock-banner">
      Mock data — fictional teams and fixtures. Connect a licensed provider to see real matches.
    </div>
  );
}
