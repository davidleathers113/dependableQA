import { z } from "zod";

/**
 * Client-safe view of the AI analysis structured output.
 *
 * The canonical schema lives in `src/server/analyze-call.ts`, which must never
 * be imported into a browser island (it pulls in the OpenAI SDK). This is a
 * deliberately lenient mirror: every field is optional and the parser never
 * throws, so older/partial analysis payloads still render what they can.
 */
const scoreSchema = z.number().min(0).max(100);

const insightsSchema = z
  .object({
    callOutcome: z.string().min(1).optional(),
    suggestedDisposition: z.string().min(1).nullable().optional(),
    confidence: z.number().min(0).max(1).optional(),
    agentQuality: z
      .object({
        score: scoreSchema.optional(),
        summary: z.string().optional(),
      })
      .optional(),
    customerIntent: z
      .object({
        primaryIntent: z.string().optional(),
        summary: z.string().optional(),
      })
      .optional(),
    compliance: z
      .object({
        status: z.string().optional(),
        summary: z.string().optional(),
      })
      .optional(),
    scoring: z
      .object({
        overall: scoreSchema.optional(),
        compliance: scoreSchema.optional(),
        communication: scoreSchema.optional(),
        outcomeAlignment: scoreSchema.optional(),
      })
      .optional(),
    followUpRecommendation: z.string().min(1).optional(),
    redactionsNeeded: z.boolean().optional(),
  })
  .partial();

export type AnalysisInsights = z.infer<typeof insightsSchema>;

/**
 * Parse the raw `analysisStructuredOutput` JSON into a typed insights object.
 * Returns null when there is no usable structured output.
 */
export function parseAnalysisInsights(structured: unknown): AnalysisInsights | null {
  if (!structured || typeof structured !== "object") {
    return null;
  }
  const result = insightsSchema.safeParse(structured);
  if (!result.success) {
    return null;
  }
  return result.data;
}

/** Human label for a 0–100 score, or null when absent. */
export function formatScore(score: number | undefined): string | null {
  if (score == null || !Number.isFinite(score)) {
    return null;
  }
  return `${String(Math.round(score))}/100`;
}

/** Format a 0–1 confidence as a percentage, or null when absent. */
export function formatConfidence(confidence: number | null | undefined): string | null {
  if (confidence == null || !Number.isFinite(confidence)) {
    return null;
  }
  return `${String(Math.round(confidence * 100))}%`;
}
