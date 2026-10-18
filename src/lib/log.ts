/**
 * Minimal structured logger that never writes credentials, tokens, cookies or
 * private stream URLs. URLs are reduced to origin + path; sensitive keys are
 * masked wherever they appear in the payload.
 */
const SECRET_KEY = /(key|token|secret|password|authorization|cookie|signature|^sig$|credential|session)/i;
const URL_KEY = /(url|src|href|uri)$/i;

export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw, "http://local.invalid");
    if (u.origin === "http://local.invalid") return u.pathname;
    return `${u.origin}${u.pathname}`;
  } catch {
    return "[unparseable-url]";
  }
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) return redactUrl(value);
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: String(redact(value.message, depth + 1)) };
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(k)) out[k] = "[redacted]";
      else if (URL_KEY.test(k) && typeof v === "string") out[k] = redactUrl(v);
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ level, msg, ...(data ? (redact(data) as object) : {}), t: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, data?: Record<string, unknown>) => emit("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => emit("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => emit("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit("error", msg, data),
};
