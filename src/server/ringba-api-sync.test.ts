import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicIntegrationRingbaConfig: vi.fn(),
  getRingbaApiAccessTokenFromConfig: vi.fn(),
  mergeRingbaApiLastSyncAt: vi.fn(),
  getRingbaMinimumDurationSeconds: vi.fn(),
  ingestIntegrationCalls: vi.fn(),
  loadIntegrationContext: vi.fn(),
  recordIntegrationEvent: vi.fn(),
  buildRingbaCallLogsReportRange: vi.fn(),
  fetchRingbaCallLogsPage: vi.fn(),
  filterRecordingRows: vi.fn(),
  mapRingbaCallLogRowToNormalizedCall: vi.fn(),
}));

vi.mock("../lib/integration-config", () => ({
  getPublicIntegrationRingbaConfig: mocks.getPublicIntegrationRingbaConfig,
  getRingbaApiAccessTokenFromConfig: mocks.getRingbaApiAccessTokenFromConfig,
  mergeRingbaApiLastSyncAt: mocks.mergeRingbaApiLastSyncAt,
}));

vi.mock("./integration-ingest", () => ({
  getRingbaMinimumDurationSeconds: mocks.getRingbaMinimumDurationSeconds,
  ingestIntegrationCalls: mocks.ingestIntegrationCalls,
  loadIntegrationContext: mocks.loadIntegrationContext,
  recordIntegrationEvent: mocks.recordIntegrationEvent,
}));

vi.mock("./ringba-calllogs", () => ({
  buildRingbaCallLogsReportRange: mocks.buildRingbaCallLogsReportRange,
  fetchRingbaCallLogsPage: mocks.fetchRingbaCallLogsPage,
  filterRecordingRows: mocks.filterRecordingRows,
  mapRingbaCallLogRowToNormalizedCall: mocks.mapRingbaCallLogRowToNormalizedCall,
  // Small bounds so pagination/limit behavior is easy to exercise.
  RINGBA_CALLLOG_MAX_PAGES: 3,
  RINGBA_CALLLOG_PAGE_SIZE: 2,
  RINGBA_MAX_RECORDING_CALLS_PER_SYNC: 5,
}));

import {
  runRingbaApiSyncForAllEligibleIntegrations,
  runRingbaApiSyncForIntegration,
  shouldRunRingbaApiScheduledSync,
} from "./ringba-api-sync";

const NOW = Date.parse("2026-05-30T12:00:00.000Z");

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

/** Fake Supabase client whose integrations.update().eq().eq() resolves to `result`. */
function fakeClient(result: { error: { message: string } | null } = { error: null }) {
  const eqCalls: Array<[string, unknown]> = [];
  const updates: Array<Record<string, unknown>> = [];
  const selectRows: { data: unknown; error: { message: string } | null } = { data: [], error: null };
  const client = {
    from: vi.fn(() => builder),
    __setSelect(data: unknown, error: { message: string } | null = null) {
      selectRows.data = data;
      selectRows.error = error;
    },
    eqCalls,
    updates,
  };
  const builder: Record<string, unknown> = {
    update(values: Record<string, unknown>) {
      updates.push(values);
      return builder;
    },
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      eqCalls.push([column, value]);
      // The select path (loadAllEligible) awaits the builder after .eq("provider",…).
      return builder;
    },
    then(resolve: (value: unknown) => unknown) {
      // Terminal for both the config update (returns `result`) and the provider
      // select (returns rows). The select chain calls .select() first.
      return Promise.resolve(selectUsed ? selectRows : result).then(resolve);
    },
  };
  let selectUsed = false;
  builder.select = () => {
    selectUsed = true;
    return builder;
  };
  return client;
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getPublicIntegrationRingbaConfig.mockReturnValue(pubConfig());
  mocks.getRingbaApiAccessTokenFromConfig.mockReturnValue("token_1");
  mocks.getRingbaMinimumDurationSeconds.mockReturnValue(30);
  mocks.buildRingbaCallLogsReportRange.mockReturnValue({ reportStart: "S", reportEnd: "E" });
  mocks.filterRecordingRows.mockImplementation((rows: unknown[]) => rows);
  mocks.mapRingbaCallLogRowToNormalizedCall.mockImplementation((row: { id: string }) => ({
    callerNumber: row.id,
  }));
  mocks.mergeRingbaApiLastSyncAt.mockImplementation((config: unknown, ts: string) => ({
    config,
    lastRingbaApiSyncAt: ts,
  }));
  mocks.ingestIntegrationCalls.mockResolvedValue({
    ingestedCount: 0,
    rejectedCount: 0,
    statusCode: 200,
    eventId: "evt_1",
  });
});

describe("shouldRunRingbaApiScheduledSync", () => {
  it("always runs when invoked manually", () => {
    mocks.getPublicIntegrationRingbaConfig.mockReturnValue(pubConfig({ ringbaApiSyncEnabled: false }));
    expect(shouldRunRingbaApiScheduledSync({}, NOW, { manual: true })).toBe(true);
  });

  it("does not run when api sync is disabled", () => {
    mocks.getPublicIntegrationRingbaConfig.mockReturnValue(pubConfig({ ringbaApiSyncEnabled: false }));
    expect(shouldRunRingbaApiScheduledSync({}, NOW, {})).toBe(false);
  });

  it("does not run when token or account id is missing", () => {
    mocks.getRingbaApiAccessTokenFromConfig.mockReturnValue("");
    expect(shouldRunRingbaApiScheduledSync({}, NOW, {})).toBe(false);

    mocks.getRingbaApiAccessTokenFromConfig.mockReturnValue("token_1");
    mocks.getPublicIntegrationRingbaConfig.mockReturnValue(pubConfig({ ringbaAccountId: "  " }));
    expect(shouldRunRingbaApiScheduledSync({}, NOW, {})).toBe(false);
  });

  it("runs when the integration has never synced", () => {
    mocks.getPublicIntegrationRingbaConfig.mockReturnValue(pubConfig({ lastRingbaApiSyncAt: null }));
    expect(shouldRunRingbaApiScheduledSync({}, NOW, {})).toBe(true);
  });

  it("does not run before the poll interval has elapsed", () => {
    const last = new Date(NOW - 10 * 60 * 1000).toISOString(); // 10 min ago
    mocks.getPublicIntegrationRingbaConfig.mockReturnValue(
      pubConfig({ lastRingbaApiSyncAt: last, pollIntervalMinutes: 60 })
    );
    expect(shouldRunRingbaApiScheduledSync({}, NOW, {})).toBe(false);
  });

  it("runs once the poll interval has elapsed", () => {
    const last = new Date(NOW - 61 * 60 * 1000).toISOString(); // 61 min ago
    mocks.getPublicIntegrationRingbaConfig.mockReturnValue(
      pubConfig({ lastRingbaApiSyncAt: last, pollIntervalMinutes: 60 })
    );
    expect(shouldRunRingbaApiScheduledSync({}, NOW, {})).toBe(true);
  });
});

describe("runRingbaApiSyncForIntegration", () => {
  it("errors cleanly when the token/account is not configured", async () => {
    mocks.getRingbaApiAccessTokenFromConfig.mockReturnValue("");
    const result = await runRingbaApiSyncForIntegration(fakeClient() as never, integration());
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not configured");
    expect(mocks.fetchRingbaCallLogsPage).not.toHaveBeenCalled();
  });

  it("skips a disabled integration on a non-manual run", async () => {
    mocks.getPublicIntegrationRingbaConfig.mockReturnValue(pubConfig({ ringbaApiSyncEnabled: false }));
    const result = await runRingbaApiSyncForIntegration(fakeClient() as never, integration(), {});
    expect(result).toMatchObject({ ok: true, skipped: true, ingestedCount: 0 });
    expect(mocks.fetchRingbaCallLogsPage).not.toHaveBeenCalled();
  });

  it("skips when the poll interval has not elapsed", async () => {
    // runRingbaApiSyncForIntegration compares against the REAL clock (unlike the
    // injectable-`now` helper above), so anchor last-sync to "just now" rather
    // than the fixed NOW constant — otherwise this test breaks once wall-clock
    // passes NOW + pollInterval.
    mocks.getPublicIntegrationRingbaConfig.mockReturnValue(
      pubConfig({ lastRingbaApiSyncAt: new Date().toISOString(), pollIntervalMinutes: 600 })
    );
    const result = await runRingbaApiSyncForIntegration(fakeClient() as never, integration(), {});
    expect(result).toMatchObject({ ok: true, skipped: true });
    expect(mocks.fetchRingbaCallLogsPage).not.toHaveBeenCalled();
  });

  it("ingests a single page and persists the last-sync timestamp (org-scoped)", async () => {
    mocks.fetchRingbaCallLogsPage.mockResolvedValueOnce({ report: { records: [{ id: "r1" }] } });
    mocks.ingestIntegrationCalls.mockResolvedValue({
      ingestedCount: 1,
      rejectedCount: 0,
      statusCode: 200,
      eventId: "evt_1",
    });
    const client = fakeClient();

    const result = await runRingbaApiSyncForIntegration(client as never, integration(), { manual: true });

    expect(result).toMatchObject({ ok: true, ingestedCount: 1 });
    expect(mocks.fetchRingbaCallLogsPage).toHaveBeenCalledTimes(1);
    // last-sync persisted with an org-scoped update
    expect((client as { updates: unknown[] }).updates).toHaveLength(1);
    expect((client as { eqCalls: Array<[string, unknown]> }).eqCalls).toContainEqual(["id", "int_1"]);
    expect((client as { eqCalls: Array<[string, unknown]> }).eqCalls).toContainEqual([
      "organization_id",
      "org_1",
    ]);
  });

  it("paginates across full pages until a short page ends the loop", async () => {
    // PAGE_SIZE=2: two full pages then a short page.
    mocks.fetchRingbaCallLogsPage
      .mockResolvedValueOnce({ report: { records: [{ id: "a" }, { id: "b" }] } })
      .mockResolvedValueOnce({ report: { records: [{ id: "c" }, { id: "d" }] } })
      .mockResolvedValueOnce({ report: { records: [{ id: "e" }] } });
    const client = fakeClient();

    await runRingbaApiSyncForIntegration(client as never, integration(), { manual: true });

    expect(mocks.fetchRingbaCallLogsPage).toHaveBeenCalledTimes(3);
  });

  it("stops at RINGBA_CALLLOG_MAX_PAGES even when pages stay full", async () => {
    mocks.fetchRingbaCallLogsPage.mockResolvedValue({ report: { records: [{ id: "x" }, { id: "y" }] } });
    const client = fakeClient();

    await runRingbaApiSyncForIntegration(client as never, integration(), { manual: true });

    // MAX_PAGES = 3 (mocked)
    expect(mocks.fetchRingbaCallLogsPage).toHaveBeenCalledTimes(3);
  });

  it("records an event and returns an error when the Ringba API call fails", async () => {
    mocks.fetchRingbaCallLogsPage.mockRejectedValueOnce(new Error("ringba 502"));
    const client = fakeClient();

    const result = await runRingbaApiSyncForIntegration(client as never, integration(), { manual: true });

    expect(result).toMatchObject({ ok: false, ingestedCount: 0, error: "ringba 502" });
    expect(mocks.recordIntegrationEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordIntegrationEvent.mock.calls[0]?.[2]).toMatchObject({
      eventType: "ringba.api.sync_failed",
      severity: "error",
    });
    // No last-sync update on failure.
    expect((client as { updates: unknown[] }).updates).toHaveLength(0);
  });

  it("returns an error when persisting the last-sync timestamp fails", async () => {
    mocks.fetchRingbaCallLogsPage.mockResolvedValueOnce({ report: { records: [] } });
    mocks.ingestIntegrationCalls.mockResolvedValue({
      ingestedCount: 0,
      rejectedCount: 0,
      statusCode: 200,
      eventId: "evt_1",
    });
    const client = fakeClient({ error: { message: "update failed" } });

    const result = await runRingbaApiSyncForIntegration(client as never, integration(), { manual: true });

    expect(result).toMatchObject({ ok: false, error: "update failed" });
  });
});

describe("runRingbaApiSyncForAllEligibleIntegrations", () => {
  it("throws when integrations cannot be loaded", async () => {
    const client = fakeClient();
    (client as { __setSelect: (d: unknown, e: { message: string } | null) => void }).__setSelect(
      null,
      { message: "boom" }
    );
    await expect(runRingbaApiSyncForAllEligibleIntegrations(client as never)).rejects.toThrow("boom");
  });

  it("returns zero counts when there are no ringba integrations", async () => {
    const client = fakeClient();
    (client as { __setSelect: (d: unknown) => void }).__setSelect([]);
    const result = await runRingbaApiSyncForAllEligibleIntegrations(client as never);
    expect(result).toEqual({ processed: 0, errors: 0 });
  });

  it("skips integrations that are not eligible and only processes eligible ones", async () => {
    const client = fakeClient();
    (client as { __setSelect: (d: unknown) => void }).__setSelect([{ id: "int_1" }, { id: "int_2" }]);
    mocks.loadIntegrationContext.mockResolvedValue(integration());
    // First integration ineligible, second eligible.
    mocks.getPublicIntegrationRingbaConfig
      .mockReturnValueOnce(pubConfig({ ringbaApiSyncEnabled: false })) // shouldRun for int_1 → false
      .mockReturnValue(pubConfig()); // int_2 and downstream calls → eligible
    mocks.fetchRingbaCallLogsPage.mockResolvedValue({ report: { records: [] } });

    const result = await runRingbaApiSyncForAllEligibleIntegrations(client as never);

    expect(result.processed).toBe(1);
    expect(result.errors).toBe(0);
  });
});
