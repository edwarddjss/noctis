import { NextResponse } from "next/server";
import { ProviderError, httpStatusFor } from "../errors";
import { log } from "../log";

export function json<T>(data: T, init?: { status?: number; maxAge?: number; private?: boolean }) {
  const cc = init?.private
    ? "private, no-store"
    : init?.maxAge
      ? `public, max-age=0, s-maxage=${init.maxAge}, stale-while-revalidate=${init.maxAge * 3}`
      : "no-store";
  return NextResponse.json(data, { status: init?.status ?? 200, headers: { "cache-control": cc } });
}

export function errorResponse(err: unknown, route: string) {
  if (err instanceof ProviderError) {
    if (err.code !== "aborted") log.warn("api.provider_error", { route, code: err.code });
    const headers: Record<string, string> = { "cache-control": "no-store" };
    if (err.code === "rate_limited" && err.retryAfterMs) headers["retry-after"] = String(Math.ceil(err.retryAfterMs / 1000));
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: httpStatusFor(err.code), headers });
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return NextResponse.json({ error: { code: "aborted", message: "Request aborted" } }, { status: 499 });
  }
  log.error("api.unexpected_error", { route, err: err instanceof Error ? err : String(err) });
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500, headers: { "cache-control": "no-store" } });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: { code: "bad_request", message } }, { status: 400 });
}
