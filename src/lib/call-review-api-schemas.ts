import { z } from "zod";

export const FLAG_CATEGORY_VALUES = [
  "qualification",
  "compliance",
  "agent_quality",
  "customer_intent",
  "follow_up",
  "transcript_quality",
  "operational",
] as const;

export const FLAG_SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;

export const createManualFlagSchema = z.object({
  flagCategory: z.enum(FLAG_CATEGORY_VALUES),
  severity: z.enum(FLAG_SEVERITY_VALUES),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(8000).optional(),
  startSeconds: z.number().finite().min(0).nullable().optional(),
  endSeconds: z.number().finite().min(0).nullable().optional(),
});

export const patchManualFlagSchema = z.object({
  flagCategory: z.enum(FLAG_CATEGORY_VALUES).optional(),
  severity: z.enum(FLAG_SEVERITY_VALUES).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(8000).nullable().optional(),
  startSeconds: z.number().finite().min(0).nullable().optional(),
  endSeconds: z.number().finite().min(0).nullable().optional(),
});

export const createNoteSchema = z.object({
  body: z.string().trim().min(1).max(8000),
  startSeconds: z.number().finite().min(0),
  endSeconds: z.number().finite().min(0).optional(),
});

function validateTimeRange(start: number | null | undefined, end: number | null | undefined) {
  if (start != null && end != null && end < start) {
    return "endSeconds must be greater than or equal to startSeconds.";
  }
  return null;
}

export function validateFlagTimes(startSeconds: number | null | undefined, endSeconds: number | null | undefined) {
  return validateTimeRange(startSeconds ?? undefined, endSeconds ?? undefined);
}

export function validateNoteTimes(startSeconds: number, endSeconds: number | undefined) {
  return validateTimeRange(startSeconds, endSeconds);
}
