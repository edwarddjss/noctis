/**
 * Admin configuration model for authorized streaming. An administrator lists
 * the providers they hold agreements with, the competitions each provider is
 * authorized for, and the specific stream URLs per match.
 */
import { z } from "zod";
import { CaptionTrackSchema, StreamSourceSchema } from "./types";

const hostname = z
  .string()
  .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i, "must be a DNS hostname (no IPs, ports or paths)");

export const StreamConfigSchema = z
  .object({
    version: z.literal(1),
    providers: z.array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]{2,40}$/),
        name: z.string().min(1).max(80),
        allowedHosts: z.array(hostname).min(1),
        airplayAllowed: z.boolean().default(true),
        rightsNote: z.string().min(1).max(300),
      }),
    ),
    competitions: z.array(
      z.object({
        competitionId: z.string().min(1).max(60),
        providerId: z.string(),
      }),
    ),
    streams: z.array(
      z.object({
        matchId: z.string().min(1).max(60),
        competitionId: z.string().min(1).max(60),
        providerId: z.string(),
        label: z.string().min(1).max(80),
        sources: z.array(StreamSourceSchema).min(1).max(4),
        captions: z.array(CaptionTrackSchema).max(8).default([]),
        availableFrom: z.iso.datetime({ offset: true }).optional(),
        availableUntil: z.iso.datetime({ offset: true }).optional(),
      }),
    ),
  })
  .superRefine((cfg, ctx) => {
    const providerIds = new Set(cfg.providers.map((p) => p.id));
    cfg.competitions.forEach((c, i) => {
      if (!providerIds.has(c.providerId)) ctx.addIssue({ code: "custom", path: ["competitions", i, "providerId"], message: "unknown provider" });
    });
    const seen = new Set<string>();
    cfg.streams.forEach((s, i) => {
      if (!providerIds.has(s.providerId)) ctx.addIssue({ code: "custom", path: ["streams", i, "providerId"], message: "unknown provider" });
      if (!cfg.competitions.some((c) => c.competitionId === s.competitionId && c.providerId === s.providerId))
        ctx.addIssue({ code: "custom", path: ["streams", i, "competitionId"], message: "competition not authorized for this provider" });
      if (seen.has(s.matchId)) ctx.addIssue({ code: "custom", path: ["streams", i, "matchId"], message: "duplicate matchId" });
      seen.add(s.matchId);
    });
  });

export type StreamConfig = z.infer<typeof StreamConfigSchema>;
