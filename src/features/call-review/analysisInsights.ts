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
const snippets = z.array(z.string()).optional();

// Lenient mirror of the disposition-intelligence block (canonical schema in
// src/server/analyze-call.ts). Every field optional so pre-v3 payloads (which
// lack the block entirely) and partial payloads still render what they can.
const dispositionSchema = z
  .object({
    finalDisposition: z.string().min(1).optional(),
    journeyStageReached: z.string().min(1).optional(),
    confidence: z.number().min(0).max(1).optional(),
    qualification: z
      .object({
        status: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
        disqualificationReasons: z.array(z.string()).optional(),
        criteria: z
          .array(
            z
              .object({
                key: z.string().optional(),
                label: z.string().optional(),
                status: z.string().optional(),
                value: z.string().nullable().optional(),
                evidence: snippets,
              })
              .partial()
          )
          .optional(),
      })
      .partial()
      .optional(),
    conversion: z
      .object({
        status: z.string().optional(),
        conversionType: z.string().optional(),
        evidence: snippets,
        followUp: z
          .object({
            required: z.boolean().optional(),
            type: z.string().optional(),
            dueDateOrTimeMentioned: z.string().nullable().optional(),
            ownerMentioned: z.string().nullable().optional(),
            evidence: snippets,
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
    fraud: z
      .object({
        riskLevel: z.string().optional(),
        fraudLikely: z.boolean().optional(),
        confidence: z.number().min(0).max(1).optional(),
        categories: z.array(z.string()).optional(),
        indicators: z
          .array(
            z
              .object({
                type: z.string().optional(),
                severity: z.string().optional(),
                description: z.string().optional(),
                evidence: snippets,
              })
              .partial()
          )
          .optional(),
        recommendedAction: z.string().optional(),
      })
      .partial()
      .optional(),
    leadQuality: z
      .object({
        status: z.string().optional(),
        billableRecommendation: z.string().optional(),
        payoutRecommendation: z.string().optional(),
        reasons: z
          .array(
            z
              .object({
                type: z.string().optional(),
                summary: z.string().optional(),
                evidence: snippets,
              })
              .partial()
          )
          .optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

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
        expressedInterest: z
          .object({
            status: z.string().optional(),
            strength: z.string().optional(),
          })
          .partial()
          .optional(),
      })
      .optional(),
    disposition: dispositionSchema.optional(),
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

/**
 * Turn an enum token like "qualified_no_conversion" into "Qualified no
 * conversion" for display. String-only (no regex), per project rules.
 */
export function humanizeToken(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }
  const words = token.split("_").filter((part) => part.length > 0);
  if (words.length === 0) {
    return null;
  }
  return words
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word
    )
    .join(" ");
}
