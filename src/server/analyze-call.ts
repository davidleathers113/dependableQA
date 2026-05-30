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

// --- Disposition-intelligence ontology (schema v2) -------------------------
// A vertical-agnostic layer answering three questions per call: what happened
// (finalDisposition + journeyStageReached), was it valuable (qualification +
// expressedInterest + conversion + leadQuality), was it risky (fraud). Every
// conclusion is evidence-backed; absence of evidence means "unclear", not a
// guess. Sub-conclusions carry string-snippet evidence (matching `flags`); the
// top-level `evidenceSpans` remains the transcript-jump mechanism.

/** Exactly one overall outcome for the call. */
const FINAL_DISPOSITION_VALUES = [
  "converted",
  "qualified_no_conversion",
  "interested_unqualified",
  "not_interested",
  "unqualified",
  "callback_scheduled",
  "callback_requested",
  "appointment_scheduled",
  "transferred",
  "application_started",
  "application_submitted",
  "enrollment_processed",
  "sale_completed",
  "support_resolved",
  "support_unresolved",
  "complaint_or_escalation",
  "voicemail",
  "hangup",
  "wrong_number",
  "dead_air",
  "no_contact",
  "test_or_duplicate",
  "suspected_fraud",
  "unclear",
] as const;

/** Ordered ladder: how far the call progressed. */
const JOURNEY_STAGE_VALUES = [
  "no_meaningful_contact",
  "connected",
  "opening",
  "need_identified",
  "interest_expressed",
  "qualification_started",
  "qualification_completed",
  "eligible_or_qualified",
  "offer_presented",
  "objection_or_questions",
  "commitment_requested",
  "callback_or_appointment_set",
  "transfer_completed",
  "application_or_order_started",
  "application_or_order_submitted",
  "sale_or_enrollment_completed",
  "post_sale_or_follow_up",
  "unclear",
] as const;

const QUALIFICATION_STATUS_VALUES = [
  "qualified",
  "unqualified",
  "partially_qualified",
  "qualification_attempted_incomplete",
  "not_attempted",
  "unclear",
] as const;
const CRITERION_STATUS_VALUES = ["met", "not_met", "unclear", "not_asked", "not_applicable"] as const;

const INTEREST_STATUS_VALUES = ["yes", "no", "unclear"] as const;
const INTEREST_STRENGTH_VALUES = ["none", "weak", "moderate", "strong", "unclear"] as const;

const CONVERSION_STATUS_VALUES = [
  "none",
  "attempted",
  "callback_requested",
  "callback_scheduled",
  "appointment_scheduled",
  "transfer_completed",
  "application_started",
  "application_submitted",
  "sale_completed",
  "enrollment_processed",
  "unclear",
] as const;
const CONVERSION_TYPE_VALUES = [
  "sale",
  "enrollment",
  "application",
  "appointment",
  "transfer",
  "callback",
  "lead_accepted",
  "support_resolution",
  "none",
  "other",
] as const;
const FOLLOW_UP_TYPE_VALUES = [
  "none",
  "callback",
  "appointment",
  "send_information",
  "complete_application",
  "verify_information",
  "manager_review",
  "compliance_review",
  "fraud_review",
  "other",
] as const;

const FRAUD_RISK_VALUES = ["none", "low", "medium", "high", "critical", "unclear"] as const;
const FRAUD_CATEGORY_VALUES = [
  "consumer_scam_or_social_engineering",
  "identity_mismatch",
  "caller_impersonation",
  "agent_misrepresentation",
  "lead_source_or_publisher_fraud",
  "incentivized_or_non_genuine_interest",
  "duplicate_or_recycled_lead",
  "bot_or_recorded_audio",
  "telephony_or_duration_fraud",
  "payment_or_financial_fraud",
  "data_privacy_or_sensitive_info_risk",
  "other",
] as const;
const FRAUD_ACTION_VALUES = [
  "none",
  "manual_review",
  "do_not_bill",
  "do_not_pay_publisher",
  "suppress_caller",
  "block_source",
  "compliance_review",
  "fraud_investigation",
  "refund_or_credit_review",
  "other",
] as const;

const LEAD_QUALITY_VALUES = [
  "high_quality",
  "acceptable",
  "low_quality",
  "invalid",
  "suspected_fraud",
  "unclear",
] as const;
const BILLABLE_RECOMMENDATION_VALUES = [
  "billable",
  "not_billable",
  "review_required",
  "credit_recommended",
  "unclear",
] as const;
const PAYOUT_RECOMMENDATION_VALUES = ["pay_publisher", "do_not_pay_publisher", "hold_for_review", "unclear"] as const;
const LEAD_QUALITY_REASON_VALUES = [
  "genuine_interest",
  "qualified",
  "unqualified",
  "wrong_number",
  "no_intent",
  "duplicate",
  "incentivized",
  "caller_confused",
  "duration_padding",
  "dead_air",
  "no_required_event",
  "other",
] as const;

/** String-snippet evidence (verbatim transcript quotes), matching `flags.evidence`. */
const snippetEvidence = z.array(z.string());

/**
 * The four-axis disposition-intelligence block. Required (non-nullable) so new
 * (v3:v2) analyses always populate it; older stored analyses lack it and are
 * rendered via the lenient client mirror.
 */
export const dispositionIntelligenceSchema = z.object({
  finalDisposition: z.enum(FINAL_DISPOSITION_VALUES),
  journeyStageReached: z.enum(JOURNEY_STAGE_VALUES),
  confidence: z.number().min(0).max(1),
  qualification: z.object({
    status: z.enum(QUALIFICATION_STATUS_VALUES),
    confidence: z.number().min(0).max(1),
    disqualificationReasons: z.array(z.string()),
    criteria: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        status: z.enum(CRITERION_STATUS_VALUES),
        value: z.string().nullable(),
        evidence: snippetEvidence,
      })
    ),
  }),
  conversion: z.object({
    status: z.enum(CONVERSION_STATUS_VALUES),
    conversionType: z.enum(CONVERSION_TYPE_VALUES),
    evidence: snippetEvidence,
    followUp: z.object({
      required: z.boolean(),
      type: z.enum(FOLLOW_UP_TYPE_VALUES),
      dueDateOrTimeMentioned: z.string().nullable(),
      ownerMentioned: z.string().nullable(),
      evidence: snippetEvidence,
    }),
  }),
  fraud: z.object({
    riskLevel: z.enum(FRAUD_RISK_VALUES),
    fraudLikely: z.boolean(),
    confidence: z.number().min(0).max(1),
    categories: z.array(z.enum(FRAUD_CATEGORY_VALUES)),
    indicators: z.array(
      z.object({
        type: z.string(),
        severity: z.enum(FLAG_SEVERITY_VALUES),
        description: z.string(),
        evidence: snippetEvidence,
      })
    ),
    recommendedAction: z.enum(FRAUD_ACTION_VALUES),
  }),
  leadQuality: z.object({
    status: z.enum(LEAD_QUALITY_VALUES),
    billableRecommendation: z.enum(BILLABLE_RECOMMENDATION_VALUES),
    payoutRecommendation: z.enum(PAYOUT_RECOMMENDATION_VALUES),
    reasons: z.array(
      z.object({
        type: z.enum(LEAD_QUALITY_REASON_VALUES),
        summary: z.string(),
        evidence: snippetEvidence,
      })
    ),
  }),
});

export type DispositionIntelligenceResult = z.infer<typeof dispositionIntelligenceSchema>;

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
    expressedInterest: z.object({
      status: z.enum(INTEREST_STATUS_VALUES),
      strength: z.enum(INTEREST_STRENGTH_VALUES),
    }),
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
  disposition: dispositionIntelligenceSchema,
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

export function buildAnalysisInstructions(promptVersion: string) {
  return [
    "You are DependableQA's post-call quality auditor.",
    `Prompt version: ${promptVersion}.`,
    "Follow the provided call metadata, transcript text, and transcript segments exactly.",
    "Do not invent facts, timestamps, speakers, or outcomes that are not supported by the provided evidence.",
    "Assess the call for outcome quality, customer intent, agent quality, and compliance risk.",
    'The transcript is diarized with generic speaker labels (e.g. "speaker_0", "Agent", "Customer"); these labels are produced by automatic diarization and do NOT reliably identify who is the agent versus the customer.',
    "Infer the roles from conversational context: the AGENT represents the business — greets, qualifies the caller, follows a script, quotes pricing, handles objections; the CUSTOMER has the need or inquiry and answers qualifying questions.",
    "Attribute agentQuality strictly to the inferred agent's turns and customerIntent strictly to the inferred customer's turns. In evidenceSpans, keep each segment's original speaker label, but base your role-specific judgments on the inferred roles.",
    "If the agent/customer roles are genuinely ambiguous, lower confidence rather than guessing.",
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
    // --- disposition intelligence (the `disposition` block) ---
    "Also produce the `disposition` block: a vertical-agnostic read of what happened, whether the lead was valuable, and whether the call was risky. Treat these as four independent judgments — do not collapse them.",
    `disposition.finalDisposition (exactly one) must be one of: ${FINAL_DISPOSITION_VALUES.join(", ")}.`,
    `disposition.journeyStageReached is the DEEPEST stage the call reached on this ordered ladder: ${JOURNEY_STAGE_VALUES.join(" -> ")}.`,
    "Separate the three signals strictly: a caller can express INTEREST without being QUALIFIED, and be QUALIFIED without any CONVERSION. customerIntent.expressedInterest captures interest; disposition.qualification captures eligibility/fit; disposition.conversion captures whether anything actually happened.",
    `disposition.qualification.status must be one of: ${QUALIFICATION_STATUS_VALUES.join(", ")}. Each criterion status must be one of: ${CRITERION_STATUS_VALUES.join(", ")}. There is no universal definition of "qualified" — judge against the criteria the agent actually applied on THIS call (need, eligibility, service area, timeframe, decision-maker, payment ability, required consent), and list them in criteria. Do not import another vertical's rule.`,
    `disposition.conversion.status must be one of: ${CONVERSION_STATUS_VALUES.join(", ")}; conversionType one of: ${CONVERSION_TYPE_VALUES.join(", ")}. A callback merely REQUESTED is callback_requested; a callback with a specific agreed time is callback_scheduled. Distinguish application_started vs application_submitted vs enrollment_processed. Never report a sale, enrollment, application, or transfer as completed without explicit transcript evidence; otherwise use attempted/unclear.`,
    `disposition.fraud assesses risk from transcript evidence AND call metadata. riskLevel one of: ${FRAUD_RISK_VALUES.join(", ")}; categories from: ${FRAUD_CATEGORY_VALUES.join(", ")}; recommendedAction one of: ${FRAUD_ACTION_VALUES.join(", ")}.`,
    "Universal fraud red flags: impersonation of a known entity; an invented problem, emergency, prize, or reward; pressure to act immediately; demands for unusual payment (gift cards, crypto, wire); a caller who was paid/incentivized or 'told to call to get a reward'; a caller with no genuine need or who is confused about why they are on the call; contradictory identity/eligibility info; a third party coaching the caller; bot/recorded/looped audio or dead air; or a billable-length call with no genuine need established (duration padding).",
    "Caller ID and phone numbers are spoofable — never base a fraud judgment on caller ID alone; require transcript evidence. Agent-side misconduct (misrepresentation, missing disclosures, coercion, prohibited payment/sensitive-info requests) is fraud category agent_misrepresentation and must also lower compliance.status.",
    `disposition.leadQuality is advisory for human review (not billing): status one of: ${LEAD_QUALITY_VALUES.join(", ")}; billableRecommendation one of: ${BILLABLE_RECOMMENDATION_VALUES.join(", ")}; payoutRecommendation one of: ${PAYOUT_RECOMMENDATION_VALUES.join(", ")}.`,
    "Every disposition conclusion must rest on concise transcript evidence. When evidence is absent or ambiguous, use unclear / no / not_attempted and lower the relevant confidence — never guess.",
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

/** Return an existing analysis at the given version, or null. */
async function loadExistingAnalysis(
  client: SupabaseAny,
  organizationId: string,
  callId: string,
  analysisVersion: string
) {
  const result = await client
    .from("call_analyses")
    .select("model_name, summary, disposition_suggested, confidence, flag_summary")
    .eq("organization_id", organizationId)
    .eq("call_id", callId)
    .eq("analysis_version", analysisVersion)
    .maybeSingle();

  if (result.error || !result.data) {
    return null;
  }

  const row = result.data as Record<string, unknown>;
  return {
    modelName: asString(row.model_name),
    summary: asString(row.summary),
    suggestedDisposition: asString(row.disposition_suggested) || null,
    confidence: asNumber(row.confidence) ?? 0,
    flagCount: Array.isArray(row.flag_summary) ? row.flag_summary.length : 0,
  };
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

/**
 * Build the `text` payload for the Responses API. `verbosity` is only honored by
 * the GPT-5 family; gpt-4.1* models reject `"low"` (they accept only `"medium"`)
 * with a 400, which previously failed every analysis under the default models. So
 * we send `verbosity` only for GPT-5 models and omit it otherwise (API default).
 */
export function buildAnalysisTextFormat(modelName: string) {
  const format = zodTextFormat(callAnalysisSchema, "dependableqa_call_analysis");
  if (modelName.trim().toLowerCase().startsWith("gpt-5")) {
    return { format, verbosity: "low" as const };
  }
  return { format };
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
    text: buildAnalysisTextFormat(modelName),
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

/**
 * Denormalized disposition-intelligence columns mirrored onto `calls` so the
 * list/summary/report queries can filter without joining `call_analyses`. The
 * full detail stays in `call_analyses.structured_output`.
 */
export function deriveDispositionColumns(analysis: CallAnalysisResult) {
  // Defensive: production output is schema-validated so the block is present,
  // but never let a partial payload throw and abort the whole analysis write.
  const d = analysis.disposition as DispositionIntelligenceResult | undefined;
  if (!d) {
    return {
      ai_final_disposition: null,
      ai_journey_stage: null,
      ai_qualification_status: null,
      ai_conversion_status: null,
      ai_conversion_type: null,
      ai_fraud_risk: null,
      ai_fraud_likely: null,
      ai_lead_quality: null,
      ai_billable_recommendation: null,
    };
  }
  return {
    ai_final_disposition: d.finalDisposition,
    ai_journey_stage: d.journeyStageReached,
    ai_qualification_status: d.qualification.status,
    ai_conversion_status: d.conversion.status,
    ai_conversion_type: d.conversion.conversionType,
    ai_fraud_risk: d.fraud.riskLevel,
    ai_fraud_likely: d.fraud.fraudLikely,
    ai_lead_quality: d.leadQuality.status,
    ai_billable_recommendation: d.leadQuality.billableRecommendation,
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
  const config = getOpenAiServerConfig();
  const analysisVersion = `${config.analysisPromptVersion}:${config.analysisSchemaVersion}`;

  // Idempotency: if an analysis at the active prompt/schema version already
  // exists, a prior (or reclaimed) job already produced it. Returning early
  // avoids re-spending on OpenAI.
  const existingAnalysis = await loadExistingAnalysis(
    client,
    options.organizationId,
    options.callId,
    analysisVersion
  );
  if (existingAnalysis) {
    return existingAnalysis;
  }

  const context = await loadAnalysisContext(client, options.organizationId, options.callId);
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

  // Upsert on the (organization_id, call_id, analysis_version) unique constraint
  // (migration 0010) so a reprocessed or duplicate analysis job — e.g. one re-run
  // after its lease expired — updates the existing analysis instead of inserting a
  // duplicate "current" row.
  const analysisInsert = await client.from("call_analyses").upsert(
    {
      organization_id: options.organizationId,
      call_id: options.callId,
      analysis_version: analysisVersion,
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
    },
    { onConflict: "organization_id,call_id,analysis_version" }
  );

  if (analysisInsert.error) {
    throw new Error(analysisInsert.error.message);
  }

  const callUpdate = await client
    .from("calls")
    .update({
      analysis_status: "completed",
      analysis_completed_at: new Date().toISOString(),
      analysis_error: null,
      // Denormalized disposition-intelligence axes for list/report filtering.
      ...deriveDispositionColumns(parsed),
      ai_analysis_version: analysisVersion,
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
