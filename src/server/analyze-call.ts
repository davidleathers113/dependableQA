import type { SupabaseClient } from "@supabase/supabase-js";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Database, Json } from "../../supabase/types";
import { getOpenAiClient, getOpenAiServerConfig } from "../lib/openai/server-client";

type SupabaseAny = SupabaseClient<Database>;

export const callAnalysisSchema = z.object({
  summary: z.string(),
  suggestedDisposition: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  callOutcome: z.string(),
  agentQuality: z.object({
    score: z.number().min(0).max(100),
    summary: z.string(),
  }),
  customerIntent: z.object({
    primaryIntent: z.string(),
    summary: z.string(),
  }),
  compliance: z.object({
    status: z.string(),
    summary: z.string(),
  }),
  flags: z.array(
    z.object({
      category: z.string(),
      severity: z.string(),
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
    "Follow the transcript evidence exactly and do not invent facts that are not present in the transcript.",
    "Assess the call for outcome quality, customer intent, agent quality, and compliance risk.",
    "When evidence is weak, lower confidence rather than guessing.",
    "Suggested disposition is advisory only and must reflect transcript evidence.",
    "Every flag must contain concise evidence and a recommended action.",
    "Return only data that matches the required schema.",
  ].join("\n");
}

async function loadTranscript(client: SupabaseAny, organizationId: string, callId: string) {
  const result = await client
    .from("call_transcripts")
    .select("transcript_text")
    .eq("organization_id", organizationId)
    .eq("call_id", callId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  const transcriptText = asString(result.data?.transcript_text);
  if (!transcriptText) {
    throw new Error("A transcript is required before analysis can run.");
  }

  return transcriptText;
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
  const transcriptText = await loadTranscript(client, options.organizationId, options.callId);
  const config = getOpenAiServerConfig();
  const modelName = asString(options.preferredModel ?? undefined) || config.analysisModel;
  const startedAt = Date.now();

  const response = await getOpenAiClient().responses.parse({
    model: modelName,
    instructions: buildAnalysisInstructions(config.analysisPromptVersion),
    input: transcriptText,
    prompt_cache_key: `call-analysis:${config.analysisPromptVersion}`,
    text: {
      format: zodTextFormat(callAnalysisSchema, "dependableqa_call_analysis"),
      verbosity: "low",
    },
  });

  const parsed = response.output_parsed;
  if (!parsed) {
    throw new Error("Structured analysis response did not include parsed output.");
  }

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
      analysis_started_at: null,
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
