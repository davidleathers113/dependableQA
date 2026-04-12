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

import { analyzeCall } from "./analyze-call";

function createClient() {
  const insertedFlags: Array<Record<string, unknown>> = [];
  const insertedAnalyses: Array<Record<string, unknown>> = [];
  const callUpdates: Array<Record<string, unknown>> = [];

  return {
    insertedFlags,
    insertedAnalyses,
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
                    },
                    error: null,
                  })),
                })),
              })),
            })),
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
            insert: vi.fn(async (row: Record<string, unknown>) => {
              insertedAnalyses.push(row);
              return { error: null };
            }),
          };
        }

        if (table === "calls") {
          return {
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

  it("stores structured analysis output and AI flags", async () => {
    parseMock.mockResolvedValue({
      output_parsed: {
        summary: "Customer asked for pricing and next steps.",
        suggestedDisposition: "qualified",
        confidence: 0.92,
        callOutcome: "pricing_request",
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

    const { client, insertedFlags, insertedAnalyses, callUpdates } = createClient();
    const result = await analyzeCall(client as never, {
      organizationId: "org_1",
      callId: "call_1",
    });

    expect(result).toMatchObject({
      modelName: "gpt-4.1-mini",
      suggestedDisposition: "qualified",
      flagCount: 1,
    });
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
    expect(callUpdates[0]).toMatchObject({
      analysis_status: "completed",
      analysis_error: null,
    });
  });
});
