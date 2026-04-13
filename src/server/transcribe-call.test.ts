import { beforeEach, describe, expect, it, vi } from "vitest";

const { transcriptionCreateMock, getOpenAiClientMock, getOpenAiServerConfigMock, toFileMock } =
  vi.hoisted(() => ({
    transcriptionCreateMock: vi.fn(),
    getOpenAiClientMock: vi.fn(),
    getOpenAiServerConfigMock: vi.fn(),
    toFileMock: vi.fn(),
  }));

vi.mock("openai", () => ({
  toFile: toFileMock,
}));

vi.mock("../lib/openai/server-client", () => ({
  getOpenAiClient: getOpenAiClientMock,
  getOpenAiServerConfig: getOpenAiServerConfigMock,
}));

import { transcribeCall } from "./transcribe-call";

function createClient() {
  const transcriptWrites: Array<Record<string, unknown>> = [];
  const callUpdates: Array<Record<string, unknown>> = [];
  const uploads: Array<{ path: string; bytes: Buffer; options: Record<string, unknown> }> = [];

  return {
    transcriptWrites,
    callUpdates,
    uploads,
    client: {
      from(table: string) {
        if (table === "calls") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: {
                      id: "call_1",
                      organization_id: "org_1",
                      recording_url: "https://example.com/call.mp3",
                      recording_storage_path: null,
                      duration_seconds: 65,
                      transcription_started_at: "2026-04-13T10:00:00.000Z",
                      analysis_error: "Existing analysis error",
                    },
                    error: null,
                  })),
                })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => {
              callUpdates.push(values);
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({ error: null })),
                })),
              };
            }),
          };
        }

        if (table === "call_transcripts") {
          return {
            upsert: vi.fn(async (values: Record<string, unknown>) => {
              transcriptWrites.push(values);
              return { error: null };
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
      storage: {
        from(bucket: string) {
          expect(bucket).toBe("recordings");
          return {
            upload: vi.fn(async (path: string, bytes: Buffer, options: Record<string, unknown>) => {
              uploads.push({ path, bytes, options });
              return { error: null };
            }),
            download: vi.fn(),
          };
        },
      },
    },
  };
}

describe("transcribeCall", () => {
  beforeEach(() => {
    transcriptionCreateMock.mockReset();
    getOpenAiClientMock.mockReset();
    getOpenAiServerConfigMock.mockReset();
    toFileMock.mockReset();

    getOpenAiClientMock.mockReturnValue({
      audio: {
        transcriptions: {
          create: transcriptionCreateMock,
        },
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
    toFileMock.mockResolvedValue("uploadable-file");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(Buffer.from("audio-bytes"), {
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
          },
        })
      )
    );
  });

  it("fetches the recording, uploads a private copy, and stores a normalized transcript", async () => {
    transcriptionCreateMock.mockResolvedValue({
      text: "Agent: Hello there. Customer: I need help.",
      duration: 42,
      segments: [
        {
          speaker: "agent",
          start: 0,
          end: 4,
          text: "Hello there.",
        },
        {
          speaker: "customer",
          start: 5,
          end: 9,
          text: "I need help.",
        },
      ],
      usage: {
        seconds: 42,
        type: "duration",
      },
    });

    const { client, transcriptWrites, callUpdates, uploads } = createClient();
    const result = await transcribeCall(client as never, {
      organizationId: "org_1",
      callId: "call_1",
      language: "en",
    });

    expect(result).toMatchObject({
      transcriptText: "Agent: Hello there. Customer: I need help.",
      durationSeconds: 42,
      modelName: "gpt-4o-transcribe-diarize",
    });
    expect(uploads[0]).toMatchObject({
      path: "org_1/call_1.mp3",
    });
    expect(transcriptWrites[0]).toMatchObject({
      call_id: "call_1",
      provider: "openai",
      model_name: "gpt-4o-transcribe-diarize",
      response_format: "diarized_json",
      transcription_version: "v1",
    });
    expect(transcriptWrites[0].transcript_segments).toEqual([
      { speaker: "agent", start: 0, end: 4, text: "Hello there." },
      { speaker: "customer", start: 5, end: 9, text: "I need help." },
    ]);
    expect(callUpdates.at(-1)).toMatchObject({
      transcription_status: "completed",
      transcription_error: null,
      recording_storage_path: "org_1/call_1.mp3",
    });
    expect(Object.hasOwn(callUpdates.at(-1) ?? {}, "transcription_started_at")).toBe(false);
    expect(Object.hasOwn(callUpdates.at(-1) ?? {}, "analysis_error")).toBe(false);
  });

  it("fails oversized recordings with a non-retryable error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array(26 * 1024 * 1024), {
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
          },
        })
      )
    );

    const { client, transcriptWrites, uploads } = createClient();

    await expect(
      transcribeCall(client as never, {
        organizationId: "org_1",
        callId: "call_1",
        language: "en",
      })
    ).rejects.toThrow(
      "Recording exceeds the 25 MB transcription limit. Upload a smaller file or add chunking support before retrying."
    );

    expect(transcriptionCreateMock).not.toHaveBeenCalled();
    expect(transcriptWrites).toHaveLength(0);
    expect(uploads).toHaveLength(1);
  });
});
