import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertAuditLog } = vi.hoisted(() => ({
  insertAuditLog: vi.fn(),
}));
const { enqueueAiJob } = vi.hoisted(() => ({
  enqueueAiJob: vi.fn(),
}));

vi.mock("../lib/app-data", async () => {
  const actual = await vi.importActual<typeof import("../lib/app-data")>("../lib/app-data");
  return {
    ...actual,
    insertAuditLog,
  };
});

vi.mock("./ai-jobs", () => ({
  enqueueAiJob,
}));

import { ingestIntegrationCalls, parseRingbaPixelRequest, type IntegrationContext } from "./integration-ingest";

function createIntegration(): IntegrationContext {
  return {
    id: "integration_1",
    organizationId: "org_1",
    provider: "trackdrive",
    displayName: "TrackDrive",
    config: {},
  };
}

function createClient() {
  return {
    client: {
      from(table: string) {
        if (table === "calls") {
          return {
            upsert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "call_1" },
                  error: null,
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
              })),
            })),
          };
        }

        if (table === "call_source_snapshots") {
          return {
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        if (table === "call_transcripts") {
          return {
            upsert: vi.fn(async () => ({ error: null })),
          };
        }

        if (table === "integration_events") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "event_1" },
                  error: null,
                })),
              })),
            })),
          };
        }

        if (table === "integrations") {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(async () => ({ error: null })),
              })),
            })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    },
  };
}

describe("ingestIntegrationCalls", () => {
  beforeEach(() => {
    enqueueAiJob.mockReset();
    insertAuditLog.mockReset();
  });

  it("enqueues transcription when the webhook payload includes a recording URL", async () => {
    const { client } = createClient();
    const result = await ingestIntegrationCalls(
      client as never,
      createIntegration(),
      { eventType: "webhook.received" },
      [
        {
          callerNumber: "+15555550123",
          startedAt: "2026-04-11T00:00:00.000Z",
          recordingUrl: "https://example.com/call.mp3",
          language: "en",
        },
      ]
    );

    expect(result).toMatchObject({
      ingestedCount: 1,
      rejectedCount: 0,
      statusCode: 200,
    });
    expect(enqueueAiJob).toHaveBeenCalledWith(client, {
      organizationId: "org_1",
      callId: "call_1",
      jobType: "transcription",
      payload: {
        language: "en",
      },
    });
  });
});

describe("parseRingbaPixelRequest", () => {
  it("normalizes Ringba query params into the shared call shape", () => {
    const parsed = parseRingbaPixelRequest(
      new URL(
        "https://dependableqa.netlify.app/api/integrations/ringba/pixel?api_key=ringba_live_key&platform=ringba&call_id=call_123&caller_number=%2B15555550123&duration_seconds=61&recording_url=https%3A%2F%2Fexample.com%2Frecording.mp3&campaign_name=Alpha&call_timestamp=2026-04-11T00%3A00%3A00.000Z&publisher_name=PubOne&buyer_name=BuyerOne"
      )
    );

    expect(parsed.apiKey).toBe("ringba_live_key");
    expect(parsed.durationSeconds).toBe(61);
    expect(parsed.payload).toEqual({
      provider: "ringba",
      platform: "ringba",
      ingestionMode: "pixel",
      calls: [
        {
          externalCallId: "call_123",
          callerNumber: "+15555550123",
          durationSeconds: 61,
          recordingUrl: "https://example.com/recording.mp3",
          campaignName: "Alpha",
          startedAt: "2026-04-11T00:00:00.000Z",
          publisherName: "PubOne",
          buyerName: "BuyerOne",
        },
      ],
    });
  });

  it("rejects unsupported platforms", () => {
    expect(() =>
      parseRingbaPixelRequest(
        new URL(
          "https://dependableqa.netlify.app/api/integrations/ringba/pixel?api_key=ringba_live_key&platform=retreaver&call_id=call_123&caller_number=%2B15555550123&duration_seconds=61&recording_url=https%3A%2F%2Fexample.com%2Frecording.mp3&campaign_name=Alpha&call_timestamp=2026-04-11T00%3A00%3A00.000Z"
        )
      )
    ).toThrow("platform must be ringba.");
  });
});
