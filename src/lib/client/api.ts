"use client";
/** Typed, validated client for MatchNest's own /api routes (never third parties). */
import { z } from "zod";
import { CompetitionSchema, MatchDetailsSchema, MatchSchema, PlayerSchema, TeamDetailsSchema, TeamSchema } from "../domain";
import { AuthorizedStreamSchema } from "../providers/streams/types";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export async function apiGet<S extends z.ZodType>(path: string, schema: S, signal?: AbortSignal): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(path, { signal, headers: { accept: "application/json" } });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("offline", 0, "You appear to be offline");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ErrorBody.safeParse(body);
    throw new ApiError(parsed.success ? parsed.data.error.code : "http_error", res.status, parsed.success ? parsed.data.error.message : `Request failed (${res.status})`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError("invalid_response", res.status, "Unexpected response from server");
  return parsed.data;
}

const Availability = z.record(z.string(), z.boolean());

export const schemas = {
  meta: z.object({ sportsProvider: z.string(), isMock: z.boolean(), streamProvider: z.string(), syncEnabled: z.boolean() }),
  teams: z.object({ teams: z.array(TeamSchema) }),
  players: z.object({ players: z.array(PlayerSchema) }),
  competitions: z.object({ competitions: z.array(CompetitionSchema) }),
  feed: z.object({ matches: z.array(MatchSchema), streams: Availability, partial: z.boolean() }),
  live: z.object({ matches: z.array(MatchSchema), streams: Availability, fetchedAt: z.string() }),
  team: z.object({ team: TeamDetailsSchema, next: z.array(MatchSchema), last: z.array(MatchSchema) }),
  player: z.object({ player: PlayerSchema }),
  match: z.object({
    match: MatchDetailsSchema,
    playback: z
      .object({ matchId: z.string(), title: z.string(), providerName: z.string(), rightsNote: z.string(), airplayAllowed: z.boolean(), isDemo: z.boolean() })
      .nullable(),
  }),
  stream: z.object({ stream: AuthorizedStreamSchema }),
  competition: z.object({ competition: CompetitionSchema.nullable(), next: z.array(MatchSchema), last: z.array(MatchSchema), streams: Availability }),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "offline":
        return "You're offline. Scores will refresh when you reconnect.";
      case "rate_limited":
        return "The data provider is busy. Trying again shortly.";
      case "not_configured":
        return "The sports-data provider isn't configured on the server.";
      case "plan_restricted":
        return "This data isn't included in the current data-provider plan.";
      default:
        return e.message;
    }
  }
  return "Something went wrong.";
}
