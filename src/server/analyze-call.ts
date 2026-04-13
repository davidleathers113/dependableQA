import type { SupabaseClient } from "@supabase/supabase-js";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Database, Json } from "../../supabase/types";
import { getOpenAiClient, getOpenAiServerConfig } from "../lib/openai/server-client";

type SupabaseAny = SupabaseClient<Database>;

const DISPOSITION_VALUES = [
  "qualified",
  "unqualified",
  "follow_up",
  "sale",
  "voicemail",
  "hangup",
  "wrong_number",
  "transfer",
  "dead_air",
  "unclear",
] as const;
const CALL_OUTCOME_VALUES = [
  "qualified",
  "unqualified",
  "follow_up",
  "sale",
  "voicemail",
  "hangup",
  "wrong_number",
  "transfer",
  "dead_air",
  "incomplete",
  "unclear",
] as const;
const COMPLIANCE_STATUS_VALUES = ["pass", "review", "fail"] as const;
const FLAG_CATEGORY_VALUES = [
  "qualification",
  "compliance",
  "agent_quality",
  "customer_intent",
  "follow_up",
  "transcript_quality",
  "operational",
] as const;
const FLAG_SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;

interface AnalysisTranscriptSegment {
  speaker: string;
  start: number | null;
  end: number | null;
  text: string;
}

interface AnalysisContext {
  transcriptText: string;
  transcriptSegments: AnalysisTranscriptSegment[];
  callMetadata: {
    durationSeconds: number | null;
    startedAt: string | null;
    sourceProvider: string | null;
    campaignName: string | null;
    publisherName: string | null;
    currentDisposition: string | null;
  };
}

export const callAnalysisSchema = z.object({
  summary: z.string(),
  suggestedDisposition: z.enum(DISPOSITION_VALUES).nullable(),
  confidence: z.number().min(0).max(1),
  callOutcome: z.enum(CALL_OUTCOME_VALUES),
  agentQuality: z.object({
    score: z.number().min(0).max(100),
    summary: z.string(),
  }),
  customerIntent: z.object({
    primaryIntent: z.string(),
    summary: z.string(),
  }),
  compliance: z.object({
    status: z.enum(COMPLIANCE_STATUS_VALUES),
    summary: z.string(),
  }),
  flags: z.array(
    z.object({
      category: z.enum(FLAG_CATEGORY_VALUES),
      severity: z.enum(FLAG_SEVERITY_VALUES),
      title: z.string(),
      description: z.string(),
      evidence: z.array(z.string()),
      recommendedAction: z.string(),
    })
  ),
  evidenceSpans: z.array(
    z.object({
      speaker: z.string(),
      start: z.number().nullable(),
      end: z.number().nullable(),
      text: z.string(),
      reason: z.string(),
    })
  ),
  redactionsNeeded: z.boolean(),
  followUpRecommendation: z.string(),
  scoring: z.object({
    overall: z.number().min(0).max(100),
    compliance: z.number().min(0).max(100),
    communication: z.number().min(0).max(100),
    outcomeAlignment: z.number().min(0).max(100),
  }),
});

export type CallAnalysisResult = z.infer<typeof callAnalysisSchema>;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeSeverity(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  return "low";
}

function buildAnalysisInstructions(promptVersion: string) {
  return [
    "You are DependableQA's post-call quality auditor.",
    `Prompt version: ${promptVersion}.`,
    "Follow the provided call metadata, transcript text, and transcript segments exactly.",
    "Do not invent facts, timestamps, speakers, or outcomes that are not supported by the provided evidence.",
    "Assess the call for outcome quality, customer intent, agent quality, and compliance risk.",
    `suggestedDisposition must be one of: ${DISPOSITION_VALUES.join(", ")}, or null when the record is too ambiguous.`,
    `callOutcome must be one of: ${CALL_OUTCOME_VALUES.join(", ")}.`,
    `compliance.status must be one of: ${COMPLIANCE_STATUS_VALUES.join(", ")}.`,
    `flags.category must be one of: ${FLAG_CATEGORY_VALUES.join(", ")}.`,
    `flags.severity must be one of: ${FLAG_SEVERITY_VALUES.join(", ")}.`,
    "Use evidenceSpans only from the provided transcript segments. When a timestamp is not present in the segment data, set start and end to null.",
    "Treat short, incomplete, low-evidence, voicemail, hangup, wrong-number, transfer, and dead-air calls conservatively and lower confidence when needed.",
    "When evidence is weak, lower confidence rather than guessing.",
    "Suggested disposition is advisory only and must reflect transcript evidence.",
    "Every flag must contain concise evidence and a recommended action.",
    "Return only data that matches the required schema.",
  ].join("\n");
}

function parseTranscriptSegments(value: Json | null | undefined) {
  const segments: AnalysisTranscriptSegment[] = [];
  if (!Array.isArray(value)) {
    return segments;
  }

  for (const item of value) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const text = asString(record.text);
    if (!text) {
      continue;
    }

    segments.push({
      speaker: asString(record.speaker) || "Unknown speaker",
      start: asNumber(record.start),
      end: asNumber(record.end),
      text,
    });
  }

  return segments;
}

async function loadAnalysisContext(client: SupabaseAny, organizationId: string, callId: string) {
  const [transcriptResult, callResult] = await Promise.all([
    client
      .from("call_transcripts")
      .select("transcript_text, transcript_segments")
      .eq("organization_id", organizationId)
      .eq("call_id", callId)
      .maybeSingle(),
    client
      .from("calls")
      .select("duration_seconds, started_at, source_provider, current_disposition, campaigns(name), publishers(name)")
      .eq("organization_id", organizationId)
      .eq("id", callId)
      .maybeSingle(),
  ]);

  if (transcriptResult.error) {
    throw new Error(transcriptResult.error.message);
  }

  if (callResult.error) {
    throw new Error(callResult.error.message);
  }

  const transcriptRow = (transcriptResult.data ?? null) as Record<string, unknown> | null;
  const transcriptText = asString(transcriptRow?.transcript_text);
  if (!transcriptText) {
    throw new Error("A transcript is required before analysis can run.");
  }

  const callRow = (callResult.data ?? null) as Record<string, unknown> | null;
  if (!callRow) {
    throw new Error("Call metadata is required before analysis can run.");
  }

  const campaign = asRecord(callRow.campaigns);
  const publisher = asRecord(callRow.publishers);

  return {
    transcriptText,
    transcriptSegments: parseTranscriptSegments((transcriptRow?.transcript_segments ?? null) as Json | null),
    callMetadata: {
      durationSeconds: asNumber(callRow.duration_seconds),
      startedAt: asString(callRow.started_at) || null,
      sourceProvider: asString(callRow.source_provider) || null,
      campaignName: asString(campaign?.name) || null,
      publisherName: asString(publisher?.name) || null,
      currentDisposition: asString(callRow.current_disposition) || null,
    },
  } satisfies AnalysisContext;
}

function buildAnalysisInput(context: AnalysisContext) {
  return [
    "Call metadata:",
    JSON.stringify(context.callMetadata, null, 2),
    "",
    "Transcript text:",
    context.transcriptText,
    "",
    "Transcript segments:",
    JSON.stringify(context.transcriptSegments, null, 2),
  ].join("\n");
}

async function requestStructuredAnalysis(
  modelName: string,
  instructions: string,
  input: string,
  promptCacheKey: string
) {
  const response = await getOpenAiClient().responses.parse({
    model: modelName,
    instructions,
    input,
    prompt_cache_key: promptCacheKey,
    text: {
      format: zodTextFormat(callAnalysisSchema, "dependableqa_call_analysis"),
      verbosity: "low",
    },
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error("Structured analysis response did not include parsed output.");
  }

  return {
    response,
    parsed,
    modelName,
  };
}

function buildFlagSummary(analysis: CallAnalysisResult) {
  return analysis.flags.map((flag) => ({
    category: flag.category,
    severity: normalizeSeverity(flag.severity),
    title: flag.title,
  })) as Json[];
}

function buildAiFlags(organizationId: string, callId: string, analysis: CallAnalysisResult) {
  return analysis.flags.map((flag) => ({
    organization_id: organizationId,
    call_id: callId,
    flag_type: "analysis_flag",
    flag_category: flag.category,
    severity: normalizeSeverity(flag.severity),
    source: "ai",
    status: "open",
    title: flag.title,
    description: flag.description,
    evidence: {
      snippets: flag.evidence,
      recommendedAction: flag.recommendedAction,
    } satisfies Json,
  }));
}

export async function analyzeCall(
  client: SupabaseAny,
  options: {
    organizationId: string;
    callId: string;
    preferredModel?: string | null;
  }
) {
  const context = await loadAnalysisContext(client, options.organizationId, options.callId);
  const config = getOpenAiServerConfig();
  const requestedModelName = asString(options.preferredModel ?? undefined) || config.analysisModel;
  const startedAt = Date.now();
  const instructions = buildAnalysisInstructions(config.analysisPromptVersion);
  const analysisInput = buildAnalysisInput(context);
  const promptCacheKey = `call-analysis:${config.analysisPromptVersion}:${config.analysisSchemaVersion}`;

  let analysisResult: Awaited<ReturnType<typeof requestStructuredAnalysis>>;
  try {
    analysisResult = await requestStructuredAnalysis(
      requestedModelName,
      instructions,
      analysisInput,
      promptCacheKey
    );
  } catch (primaryError) {
    const fallbackModelName = asString(config.analysisFallbackModel);
    if (!fallbackModelName || fallbackModelName === requestedModelName) {
      throw primaryError;
    }

    try {
      analysisResult = await requestStructuredAnalysis(
        fallbackModelName,
        instructions,
        analysisInput,
        promptCacheKey
      );
    } catch (fallbackError) {
      const primaryMessage = primaryError instanceof Error ? primaryError.message : "Unknown primary model error.";
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : "Unknown fallback model error.";
      throw new Error(
        `Analysis failed with ${requestedModelName} and fallback ${fallbackModelName}: ${primaryMessage}; ${fallbackMessage}`
      );
    }
  }

  const { parsed, response, modelName } = analysisResult;

  const deleteFlags = await client
    .from("call_flags")
    .delete()
    .eq("organization_id", options.organizationId)
    .eq("call_id", options.callId)
    .eq("source", "ai");

  if (deleteFlags.error) {
    throw new Error(deleteFlags.error.message);
  }

  const aiFlags = buildAiFlags(options.organizationId, options.callId, parsed);
  if (aiFlags.length > 0) {
    const insertFlags = await client.from("call_flags").insert(aiFlags);
    if (insertFlags.error) {
      throw new Error(insertFlags.error.message);
    }
  }

  const analysisInsert = await client.from("call_analyses").insert({
    organization_id: options.organizationId,
    call_id: options.callId,
    analysis_version: `${config.analysisPromptVersion}:${config.analysisSchemaVersion}`,
    model_name: modelName,
    summary: parsed.summary,
    disposition_suggested: parsed.suggestedDisposition,
    confidence: parsed.confidence,
    flag_summary: buildFlagSummary(parsed),
    structured_output: parsed as Json,
    processing_ms: Date.now() - startedAt,
    prompt_version: config.analysisPromptVersion,
    schema_version: config.analysisSchemaVersion,
    usage_json: (response.usage ?? null) as Json | null,
    raw_response_json: response as unknown as Json,
  });

  if (analysisInsert.error) {
    throw new Error(analysisInsert.error.message);
  }

  const callUpdate = await client
    .from("calls")
    .update({
      analysis_status: "completed",
      analysis_completed_at: new Date().toISOString(),
      analysis_error: null,
    })
    .eq("organization_id", options.organizationId)
    .eq("id", options.callId);

  if (callUpdate.error) {
    throw new Error(callUpdate.error.message);
  }

  return {
    modelName,
    summary: parsed.summary,
    suggestedDisposition: parsed.suggestedDisposition,
    confidence: parsed.confidence,
    flagCount: parsed.flags.length,
  };
}
