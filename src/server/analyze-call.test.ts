import { beforeEach, describe, expect, it, vi } from "vitest";

const { parseMock, getOpenAiClientMock, getOpenAiServerConfigMock } = vi.hoisted(() => ({
  parseMock: vi.fn(),
  getOpenAiClientMock: vi.fn(),
  getOpenAiServerConfigMock: vi.fn(),
}));

vi.mock("../lib/openai/server-client", () => ({
  getOpenAiClient: getOpenAiClientMock,
  getOpenAiServerConfig: getOpenAiServerConfigMock,
}));

import { analyzeCall, buildAnalysisInstructions, buildAnalysisTextFormat } from "./analyze-call";

function createClient(existingAnalysis: Record<string, unknown> | null = null) {
  const insertedFlags: Array<Record<string, unknown>> = [];
  const insertedAnalyses: Array<Record<string, unknown>> = [];
  const analysisUpsertOptions: Array<Record<string, unknown> | undefined> = [];
  const callUpdates: Array<Record<string, unknown>> = [];

  return {
    insertedFlags,
    insertedAnalyses,
    analysisUpsertOptions,
    callUpdates,
    client: {
      from(table: string) {
        if (table === "call_transcripts") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      transcript_text: "Agent: Thanks for calling. Customer: I want pricing details.",
                      transcript_segments: [
                        {
                          speaker: "Agent",
                          start: 0,
                          end: 4,
                          text: "Thanks for calling.",
                        },
                        {
                          speaker: "Customer",
                          start: 5,
                          end: 10,
                          text: "I want pricing details.",
                        },
                      ],
                    },
                    error: null,
                  })),
                })),
              })),
            })),
          };
        }

        if (table === "calls") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: {
                      duration_seconds: 65,
                      started_at: "2026-04-13T10:00:00.000Z",
                      source_provider: "ringba",
                      current_disposition: "pending_review",
                      campaigns: {
                        name: "Emergency Plumbing",
                      },
                      publishers: {
                        name: "Publisher One",
                      },
                    },
                    error: null,
                  })),
                })),
              })),
            })),
            update: vi.fn((row: Record<string, unknown>) => {
              callUpdates.push(row);
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({ error: null })),
                })),
              };
            }),
          };
        }

        if (table === "call_flags") {
          return {
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({ error: null })),
                })),
              })),
            })),
            insert: vi.fn(async (rows: Array<Record<string, unknown>>) => {
              insertedFlags.push(...rows);
              return { error: null };
            }),
          };
        }

        if (table === "call_analyses") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: existingAnalysis, error: null })),
                  })),
                })),
              })),
            })),
            upsert: vi.fn(async (row: Record<string, unknown>, options?: Record<string, unknown>) => {
              insertedAnalyses.push(row);
              analysisUpsertOptions.push(options);
              return { error: null };
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    },
  };
}

describe("analyzeCall", () => {
  beforeEach(() => {
    parseMock.mockReset();
    getOpenAiClientMock.mockReset();
    getOpenAiServerConfigMock.mockReset();

    getOpenAiClientMock.mockReturnValue({
      responses: {
        parse: parseMock,
      },
    });
    getOpenAiServerConfigMock.mockReturnValue({
      apiKey: "test-key",
      webhookSecret: null,
      transcriptionModel: "gpt-4o-transcribe-diarize",
      analysisModel: "gpt-4.1-mini",
      analysisFallbackModel: "gpt-4.1",
      analysisPromptVersion: "v1",
      analysisSchemaVersion: "v1",
    });
  });

  it("omits verbosity for gpt-4.1 models (they 400 on 'low') and sends it for gpt-5", () => {
    // Regression: gpt-4.1-mini/gpt-4.1 reject text.verbosity:'low' with a 400,
    // which failed every analysis under the default models.
    const mini = buildAnalysisTextFormat("gpt-4.1-mini");
    expect("verbosity" in mini).toBe(false);
    expect(mini.format).toBeDefined();

    const full = buildAnalysisTextFormat("gpt-4.1");
    expect("verbosity" in full).toBe(false);

    const gpt5 = buildAnalysisTextFormat("gpt-5-mini") as { verbosity?: string };
    expect(gpt5.verbosity).toBe("low");
  });

  it("instructs the model to infer agent vs customer roles from context", () => {
    const text = buildAnalysisInstructions("v2");
    expect(text).toContain("Prompt version: v2.");
    expect(text).toContain("AGENT represents the business");
    expect(text).toContain("CUSTOMER has the need");
    expect(text).toContain("Attribute agentQuality strictly to the inferred agent");
    expect(text).toContain("do NOT reliably identify who is the agent");
  });

  it("skips OpenAI when an analysis at the active version already exists", async () => {
    const { client, insertedAnalyses, insertedFlags } = createClient({
      model_name: "gpt-4.1-mini",
      summary: "Previously analyzed.",
      disposition_suggested: "qualified",
      confidence: 0.81,
      flag_summary: [{ category: "follow_up", severity: "low", title: "x" }],
    });

    const result = await analyzeCall(client as never, {
      organizationId: "org_1",
      callId: "call_1",
    });

    expect(result.summary).toBe("Previously analyzed.");
    expect(result.flagCount).toBe(1);
    expect(parseMock).not.toHaveBeenCalled();
    expect(insertedAnalyses).toHaveLength(0);
    expect(insertedFlags).toHaveLength(0);
  });

  it("repairs the call row from the stored analysis without re-calling OpenAI", async () => {
    // A prior run wrote call_analyses but crashed before updating `calls`. The
    // retry must repair analysis_status + the denormalized ai_* columns from the
    // stored structured_output — not short-circuit and leave them stale.
    const { client, callUpdates, insertedAnalyses } = createClient({
      model_name: "gpt-4.1-mini",
      summary: "Previously analyzed.",
      disposition_suggested: "sale",
      confidence: 0.9,
      flag_summary: [],
      created_at: "2026-05-30T09:00:00.000Z",
      structured_output: {
        disposition: {
          finalDisposition: "sale_completed",
          journeyStageReached: "sale_or_enrollment_completed",
          confidence: 0.9,
          qualification: { status: "qualified", confidence: 0.9, disqualificationReasons: [], criteria: [] },
          conversion: { status: "sale_completed", conversionType: "sale", evidence: ["I'll take it"], followUp: { required: false, type: "none", dueDateOrTimeMentioned: null, ownerMentioned: null, evidence: [] } },
          fraud: { riskLevel: "low", fraudLikely: false, confidence: 0.8, categories: [], indicators: [], recommendedAction: "none" },
          leadQuality: { status: "high_quality", billableRecommendation: "billable", payoutRecommendation: "pay_publisher", reasons: [] },
        },
      },
    });

    await analyzeCall(client as never, { organizationId: "org_1", callId: "call_1" });

    expect(parseMock).not.toHaveBeenCalled();
    expect(insertedAnalyses).toHaveLength(0);
    expect(callUpdates).toHaveLength(1);
    expect(callUpdates[0]).toMatchObject({
      analysis_status: "completed",
      analysis_error: null,
      // Restored from the stored analysis timestamp, not the repair time.
      analysis_completed_at: "2026-05-30T09:00:00.000Z",
      ai_final_disposition: "sale_completed",
      ai_conversion_status: "sale_completed",
      ai_payout_recommendation: "pay_publisher",
      ai_analysis_version: "v1:v1",
    });
  });

  it("bridges a high fraud risk into a fraud-category flag", async () => {
    parseMock.mockResolvedValue({
      output_parsed: {
        summary: "Caller was coached and incentivized.",
        suggestedDisposition: "unclear",
        confidence: 0.6,
        callOutcome: "unclear",
        agentQuality: { score: 40, summary: "n/a" },
        customerIntent: { primaryIntent: "unknown", summary: "Confused caller.", expressedInterest: { status: "no", strength: "none" } },
        compliance: { status: "review", summary: "Possible misrepresentation." },
        flags: [],
        evidenceSpans: [],
        redactionsNeeded: false,
        followUpRecommendation: "Review.",
        scoring: { overall: 40, compliance: 50, communication: 45, outcomeAlignment: 30 },
        disposition: {
          finalDisposition: "suspected_fraud",
          journeyStageReached: "opening",
          confidence: 0.86,
          qualification: { status: "not_attempted", confidence: 0.5, disqualificationReasons: [], criteria: [] },
          conversion: { status: "none", conversionType: "none", evidence: [], followUp: { required: false, type: "none", dueDateOrTimeMentioned: null, ownerMentioned: null, evidence: [] } },
          fraud: {
            riskLevel: "high",
            fraudLikely: true,
            confidence: 0.86,
            categories: ["incentivized_or_non_genuine_interest"],
            indicators: [
              { type: "incentivized_caller", severity: "high", description: "Said they were told to call for a gift card.", evidence: ["I was promised a gift card"] },
            ],
            recommendedAction: "do_not_pay_publisher",
          },
          leadQuality: { status: "suspected_fraud", billableRecommendation: "not_billable", payoutRecommendation: "do_not_pay_publisher", reasons: [] },
        },
      },
      usage: { input_tokens: 500, output_tokens: 120, total_tokens: 620 },
    });

    const { client, insertedFlags, callUpdates } = createClient();
    await analyzeCall(client as never, { organizationId: "org_1", callId: "call_1" });

    const fraudFlags = insertedFlags.filter((f) => f.flag_category === "fraud");
    expect(fraudFlags).toHaveLength(1);
    expect(fraudFlags[0]).toMatchObject({ severity: "high", source: "ai", flag_category: "fraud" });
    expect(callUpdates[0]).toMatchObject({ ai_fraud_risk: "high", ai_payout_recommendation: "do_not_pay_publisher" });
  });

  it("stores structured analysis output and AI flags from transcript context", async () => {
    parseMock.mockResolvedValue({
      output_parsed: {
        summary: "Customer asked for pricing and next steps.",
        suggestedDisposition: "qualified",
        confidence: 0.92,
        callOutcome: "qualified",
        agentQuality: {
          score: 88,
          summary: "Agent handled the request clearly.",
        },
        customerIntent: {
          primaryIntent: "pricing",
          summary: "Customer wants details before committing.",
        },
        compliance: {
          status: "pass",
          summary: "No compliance issues found.",
        },
        flags: [
          {
            category: "follow_up",
            severity: "medium",
            title: "Customer requested pricing details",
            description: "A follow-up quote should be sent.",
            evidence: ["Customer: I want pricing details."],
            recommendedAction: "Send pricing quote.",
          },
        ],
        evidenceSpans: [
          {
            speaker: "Customer",
            start: 12,
            end: 19,
            text: "I want pricing details.",
            reason: "Primary buying signal.",
          },
        ],
        redactionsNeeded: false,
        followUpRecommendation: "Send a quote within one business day.",
        scoring: {
          overall: 86,
          compliance: 100,
          communication: 84,
          outcomeAlignment: 80,
        },
      },
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        total_tokens: 1200,
      },
    });

    const { client, insertedFlags, insertedAnalyses, analysisUpsertOptions, callUpdates } = createClient();
    const result = await analyzeCall(client as never, {
      organizationId: "org_1",
      callId: "call_1",
    });

    expect(result).toMatchObject({
      modelName: "gpt-4.1-mini",
      suggestedDisposition: "qualified",
      flagCount: 1,
    });
    expect(parseMock).toHaveBeenCalledTimes(1);
    expect(parseMock.mock.calls[0]?.[0]).toMatchObject({
      model: "gpt-4.1-mini",
    });
    const analysisInput = String(parseMock.mock.calls[0]?.[0]?.input ?? "");
    expect(analysisInput.includes("Transcript segments:")).toBe(true);
    expect(analysisInput.includes('"campaignName": "Emergency Plumbing"')).toBe(true);
    expect(analysisInput.includes('"publisherName": "Publisher One"')).toBe(true);
    expect(analysisInput.includes('"sourceProvider": "ringba"')).toBe(true);
    expect(insertedFlags).toHaveLength(1);
    expect(insertedFlags[0]).toMatchObject({
      call_id: "call_1",
      source: "ai",
      severity: "medium",
    });
    expect(insertedAnalyses[0]).toMatchObject({
      call_id: "call_1",
      model_name: "gpt-4.1-mini",
      prompt_version: "v1",
      schema_version: "v1",
      disposition_suggested: "qualified",
    });
    // Analysis is written via an idempotent upsert so a reprocessed job at the same
    // version updates rather than duplicating the current analysis (migration 0010).
    expect(analysisUpsertOptions[0]).toEqual({ onConflict: "organization_id,call_id,analysis_version" });
    expect(callUpdates[0]).toMatchObject({
      analysis_status: "completed",
      analysis_error: null,
    });
    expect(Object.hasOwn(callUpdates[0] ?? {}, "analysis_started_at")).toBe(false);
  });

  it("falls back to the configured backup model when the preferred model fails", async () => {
    parseMock
      .mockRejectedValueOnce(new Error("primary parse failed"))
      .mockResolvedValueOnce({
        output_parsed: {
          summary: "Fallback analysis completed.",
          suggestedDisposition: "follow_up",
          confidence: 0.74,
          callOutcome: "follow_up",
          agentQuality: {
            score: 76,
            summary: "The agent gathered enough information for a follow-up.",
          },
          customerIntent: {
            primaryIntent: "pricing",
            summary: "Customer asked for more information before committing.",
          },
          compliance: {
            status: "review",
            summary: "Limited evidence, but no explicit violation was found.",
          },
          flags: [
            {
              category: "qualification",
              severity: "low",
              title: "Needs follow-up",
              description: "The customer did not commit during the call.",
              evidence: ["Customer: I want pricing details."],
              recommendedAction: "Send the pricing details.",
            },
          ],
          evidenceSpans: [
            {
              speaker: "Customer",
              start: 5,
              end: 10,
              text: "I want pricing details.",
              reason: "Shows continued interest without a final commitment.",
            },
          ],
          redactionsNeeded: false,
          followUpRecommendation: "Send pricing details today.",
          scoring: {
            overall: 74,
            compliance: 90,
            communication: 78,
            outcomeAlignment: 68,
          },
        },
        usage: {
          input_tokens: 800,
          output_tokens: 180,
          total_tokens: 980,
        },
      });

    const { client } = createClient();
    const result = await analyzeCall(client as never, {
      organizationId: "org_1",
      callId: "call_1",
      preferredModel: "gpt-4.1-mini",
    });

    expect(result).toMatchObject({
      modelName: "gpt-4.1",
      suggestedDisposition: "follow_up",
      flagCount: 1,
    });
    expect(parseMock).toHaveBeenCalledTimes(2);
    expect(parseMock.mock.calls[0]?.[0]).toMatchObject({
      model: "gpt-4.1-mini",
    });
    expect(parseMock.mock.calls[1]?.[0]).toMatchObject({
      model: "gpt-4.1",
    });
  });
});
