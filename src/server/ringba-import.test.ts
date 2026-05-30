import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertAuditLog: vi.fn(),
  getPublicIntegrationRingbaConfig: vi.fn(),
  getRingbaApiAccessTokenFromConfig: vi.fn(),
  getRingbaMinimumDurationSeconds: vi.fn(),
  ingestIntegrationCalls: vi.fn(),
  recordIntegrationEvent: vi.fn(),
  fetchRingbaCallLogsPage: vi.fn(),
  filterRecordingRows: vi.fn(),
  mapRingbaCallLogRowToNormalizedCall: vi.fn(),
  buildRingbaReportRangeFromDates: vi.fn(),
  buildRingbaCallLogsReportRange: vi.fn(),
}));

vi.mock("../lib/app-data", () => ({ insertAuditLog: mocks.insertAuditLog }));

vi.mock("../lib/integration-config", () => ({
  getPublicIntegrationRingbaConfig: mocks.getPublicIntegrationRingbaConfig,
  getRingbaApiAccessTokenFromConfig: mocks.getRingbaApiAccessTokenFromConfig,
}));

vi.mock("./integration-ingest", () => ({
  getRingbaMinimumDurationSeconds: mocks.getRingbaMinimumDurationSeconds,
  ingestIntegrationCalls: mocks.ingestIntegrationCalls,
  recordIntegrationEvent: mocks.recordIntegrationEvent,
}));

vi.mock("./ringba-calllogs", () => ({
  buildRingbaReportRangeFromDates: mocks.buildRingbaReportRangeFromDates,
  buildRingbaCallLogsReportRange: mocks.buildRingbaCallLogsReportRange,
  fetchRingbaCallLogsPage: mocks.fetchRingbaCallLogsPage,
  filterRecordingRows: mocks.filterRecordingRows,
  mapRingbaCallLogRowToNormalizedCall: mocks.mapRingbaCallLogRowToNormalizedCall,
  RINGBA_CALLLOG_PAGE_SIZE: 2,
  RINGBA_MANUAL_IMPORT_MAX_PAGES: 5,
  RINGBA_MANUAL_IMPORT_MAX_RECORDS: 2000,
}));

import {
  runRingbaManualImport,
  testRingbaConnection,
  type RingbaManualImportInput,
} from "./ringba-import";

function pubConfig(overrides: Record<string, unknown> = {}) {
  return {
    publicIngestKey: "",
    minimumDurationSeconds: 30,
    ringbaApiSyncEnabled: true,
    ringbaAccountId: "acct_1",
    apiTokenConfigured: true,
    callLogsTimeZone: "America/Chicago",
    pollIntervalMinutes: 60,
    lookbackHours: 48,
    lastRingbaApiSyncAt: null as string | null,
    ...overrides,
  };
}

function integration() {
  return {
    id: "int_1",
    organizationId: "org_1",
    provider: "ringba" as const,
    displayName: "Ringba",
    config: { ringba: {} },
  };
}

/**
 * Fake client: ringba_import_batches insert returns {id}; updates and calls-select
 * are captured. The calls select (re-read of imported calls) resolves to `callRows`.
 */
function fakeClient() {
  const batchUpdates: Array<Record<string, unknown>> = [];
  const inserted: Array<Record<string, unknown>> = [];
  const callRows: { data: unknown; error: null } = { data: [], error: null };

  const client = {
    batchUpdates,
    inserted,
    setCallRows(rows: unknown) {
      callRows.data = rows;
    },
    from(table: string) {
      if (table === "ringba_import_batches") {
        return {
          insert(values: Record<string, unknown>) {
            inserted.push(values);
            return {
              select: () => ({
                single: async () => ({ data: { id: "batch_1" }, error: null }),
              }),
            };
          },
          update(values: Record<string, unknown>) {
            batchUpdates.push(values);
            return { eq: () => ({ eq: async () => ({ error: null }) }) };
          },
        };
      }
      if (table === "calls") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => callRows,
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return client;
}

const BASE_INPUT: RingbaManualImportInput & { requestedBy: string | null } = {
  dateStartIso: "2026-05-01T00:00:00.000Z",
  dateEndIso: "2026-05-07T23:59:59.000Z",
  maxRecords: 100,
  recordingOnly: true,
  importBehavior: "import_only",
  requestedBy: "user_1",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getPublicIntegrationRingbaConfig.mockReturnValue(pubConfig());
  mocks.getRingbaApiAccessTokenFromConfig.mockReturnValue("token_1");
  mocks.getRingbaMinimumDurationSeconds.mockReturnValue(30);
  mocks.buildRingbaReportRangeFromDates.mockReturnValue({ reportStart: "S", reportEnd: "E" });
  mocks.buildRingbaCallLogsReportRange.mockReturnValue({ reportStart: "S", reportEnd: "E" });
  mocks.filterRecordingRows.mockImplementation((rows: unknown[]) => rows);
  mocks.mapRingbaCallLogRowToNormalizedCall.mockImplementation((row: { id: string }) => ({
    callerNumber: row.id,
    recordingUrl: `https://rec/${row.id}.mp3`,
  }));
  mocks.ingestIntegrationCalls.mockResolvedValue({
    ingestedCount: 0,
    rejectedCount: 0,
    recordingCount: 0,
    importedCallIds: [],
    statusCode: 200,
    eventId: "evt_1",
  });
});

describe("runRingbaManualImport", () => {
  it("imports metadata only — ingest is called with enqueueAiJobs:false", async () => {
    mocks.fetchRingbaCallLogsPage.mockResolvedValueOnce({ report: { records: [{ id: "r1" }] } });
    mocks.ingestIntegrationCalls.mockResolvedValue({
      ingestedCount: 1,
      rejectedCount: 0,
      recordingCount: 1,
      importedCallIds: ["call_1"],
      statusCode: 200,
      eventId: "evt_1",
    });
    const client = fakeClient();
    client.setCallRows([
      { id: "call_1", caller_number: "r1", duration_seconds: 42, recording_url: "https://rec/r1.mp3" },
    ]);

    const result = await runRingbaManualImport(client as never, integration(), BASE_INPUT);

    expect(mocks.ingestIntegrationCalls).toHaveBeenCalledWith(
      client,
      expect.anything(),
      expect.objectContaining({ ingestionMode: "api" }),
      expect.any(Array),
      { completionEventKind: "ringba_api", enqueueAiJobs: false }
    );
    expect(result).toMatchObject({
      status: "completed",
      recordsImported: 1,
      recordingsImported: 1,
      callIds: ["call_1"],
    });
    expect(result.importedCalls[0]).toMatchObject({ callId: "call_1", hasRecording: true });
  });

  it("enforces the hard max-records cap even when a larger value is requested", async () => {
    mocks.fetchRingbaCallLogsPage.mockResolvedValue({ report: { records: [] } });
    const client = fakeClient();

    const result = await runRingbaManualImport(client as never, integration(), {
      ...BASE_INPUT,
      maxRecords: 999999,
    });

    expect(result.capped).toBe(true);
    expect(client.inserted[0]?.max_records).toBe(2000);
  });

  it("rejects when the date range is inverted", async () => {
    const client = fakeClient();
    await expect(
      runRingbaManualImport(client as never, integration(), {
        ...BASE_INPUT,
        dateStartIso: "2026-05-10T00:00:00.000Z",
        dateEndIso: "2026-05-01T00:00:00.000Z",
      })
    ).rejects.toThrow("dateStart must be on or before dateEnd.");
  });

  it("rejects when token or account id is not configured", async () => {
    mocks.getRingbaApiAccessTokenFromConfig.mockReturnValue("");
    const client = fakeClient();
    await expect(
      runRingbaManualImport(client as never, integration(), BASE_INPUT)
    ).rejects.toThrow("not configured");
  });

  it("uses filterRecordingRows + requireRecording when recordingOnly is true", async () => {
    mocks.fetchRingbaCallLogsPage.mockResolvedValueOnce({ report: { records: [{ id: "r1" }] } });
    const client = fakeClient();

    await runRingbaManualImport(client as never, integration(), { ...BASE_INPUT, recordingOnly: true });

    expect(mocks.filterRecordingRows).toHaveBeenCalled();
    expect(mocks.mapRingbaCallLogRowToNormalizedCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requireRecording: true })
    );
  });

  it("does not filter and passes requireRecording:false when recordingOnly is false", async () => {
    mocks.fetchRingbaCallLogsPage.mockResolvedValueOnce({ report: { records: [{ id: "r1" }] } });
    const client = fakeClient();

    await runRingbaManualImport(client as never, integration(), { ...BASE_INPUT, recordingOnly: false });

    expect(mocks.filterRecordingRows).not.toHaveBeenCalled();
    expect(mocks.mapRingbaCallLogRowToNormalizedCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requireRecording: false })
    );
  });

  it("records an integration event and marks the batch failed when Ringba errors", async () => {
    mocks.fetchRingbaCallLogsPage.mockRejectedValueOnce(new Error("ringba 502"));
    const client = fakeClient();

    const result = await runRingbaManualImport(client as never, integration(), BASE_INPUT);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("ringba 502");
    expect(mocks.recordIntegrationEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordIntegrationEvent.mock.calls[0]?.[2]).toMatchObject({
      eventType: "ringba.api.import_failed",
      severity: "error",
    });
    expect(client.batchUpdates.at(-1)).toMatchObject({ status: "failed" });
    expect(mocks.ingestIntegrationCalls).not.toHaveBeenCalled();
  });

  it("stops fetching once maxRecords is reached", async () => {
    // PAGE_SIZE=2, request 3 records: page 1 gives 2, page 2 gives 2 → stop at 3 mapped.
    mocks.fetchRingbaCallLogsPage
      .mockResolvedValueOnce({ report: { records: [{ id: "a" }, { id: "b" }] } })
      .mockResolvedValueOnce({ report: { records: [{ id: "c" }, { id: "d" }] } });
    const client = fakeClient();

    await runRingbaManualImport(client as never, integration(), { ...BASE_INPUT, maxRecords: 3 });

    const normalized = mocks.ingestIntegrationCalls.mock.calls[0]?.[3] as unknown[];
    expect(normalized).toHaveLength(3);
  });
});

describe("testRingbaConnection", () => {
  it("returns ok with the sample count on success", async () => {
    mocks.fetchRingbaCallLogsPage.mockResolvedValueOnce({ report: { records: [{ id: "r1" }] } });
    const result = await testRingbaConnection(integration());
    expect(result).toEqual({ ok: true, sampleCount: 1 });
    // Pure connectivity check — never imports or records an event.
    expect(mocks.ingestIntegrationCalls).not.toHaveBeenCalled();
    expect(mocks.recordIntegrationEvent).not.toHaveBeenCalled();
  });

  it("returns an error when credentials are missing", async () => {
    mocks.getRingbaApiAccessTokenFromConfig.mockReturnValue("");
    const result = await testRingbaConnection(integration());
    expect(result.ok).toBe(false);
    expect(result.error).toContain("before testing");
  });

  it("returns an error when the Ringba request fails", async () => {
    mocks.fetchRingbaCallLogsPage.mockRejectedValueOnce(new Error("unauthorized"));
    const result = await testRingbaConnection(integration());
    expect(result).toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("tests the form overrides (typed creds) before they are saved", async () => {
    // Nothing saved yet (empty saved token + blank saved account).
    mocks.getRingbaApiAccessTokenFromConfig.mockReturnValue("");
    mocks.getPublicIntegrationRingbaConfig.mockReturnValue(pubConfig({ ringbaAccountId: "" }));
    mocks.fetchRingbaCallLogsPage.mockResolvedValueOnce({ report: { records: [] } });

    const result = await testRingbaConnection(integration(), {
      accountId: "typed_acct",
      apiToken: "typed_tok",
      timeZone: "America/New_York",
    });

    expect(result).toEqual({ ok: true, sampleCount: 0 });
    expect(mocks.fetchRingbaCallLogsPage).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "typed_acct", apiToken: "typed_tok", formatTimeZone: "America/New_York" })
    );
  });

  it("falls back to the saved token when the override token is blank", async () => {
    mocks.getRingbaApiAccessTokenFromConfig.mockReturnValue("saved_tok");
    mocks.fetchRingbaCallLogsPage.mockResolvedValueOnce({ report: { records: [{ id: "r1" }] } });

    const result = await testRingbaConnection(integration(), { accountId: "acct_override", apiToken: "" });

    expect(result).toEqual({ ok: true, sampleCount: 1 });
    expect(mocks.fetchRingbaCallLogsPage).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct_override", apiToken: "saved_tok" })
    );
  });
});
