export type ProviderErrorCode =
  | "not_configured"
  | "unauthorized"
  | "plan_restricted"
  | "rate_limited"
  | "timeout"
  | "aborted"
  | "invalid_response"
  | "not_found"
  | "upstream";

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function httpStatusFor(code: ProviderErrorCode): number {
  switch (code) {
    case "not_configured":
      return 503;
    case "unauthorized":
      return 502; // our credentials are wrong; not the caller's fault
    case "plan_restricted":
      return 502;
    case "rate_limited":
      return 429;
    case "timeout":
      return 504;
    case "aborted":
      return 499;
    case "not_found":
      return 404;
    default:
      return 502;
  }
}
