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

import { dispatchImportBatch } from "./import-dispatch";

function createMockClient(storagePath: string, status = "uploaded") {
  const updateValues: Array<Record<string, unknown>> = [];
  const deleteCalls: Array<{ table: string; organizationId: string | null; batchId: string | null }> = [];
  const download = vi.fn();

  return {
    updateValues,
    deleteCalls,
    download,
    client: {
      from(table: string) {
        if (table === "import_batches") {
          return {
            select() {
              return this;
            },
            update(values: Record<string, unknown>) {
              updateValues.push(values);
              return {
                error: null,
                eq() {
                  return this;
                },
              };
            },
            eq(column: string, value: string) {
              if (column === "organization_id" && value === "org_1") {
                return this;
              }

              if (column === "id" && value === "batch_1") {
                return this;
              }

              return this;
            },
            async single() {
              return {
                data: {
                  id: "batch_1",
                  filename: "calls.csv",
                  storage_path: storagePath,
                  source_provider: "custom",
                  status,
                },
                error: null,
              };
            },
          };
        }

        if (table === "import_row_errors") {
          const scope = {
            table,
            organizationId: null as string | null,
            batchId: null as string | null,
          };

          return {
            delete() {
              return this;
            },
            eq(column: string, value: string) {
              if (column === "organization_id") {
                scope.organizationId = value;
              }

              if (column === "import_batch_id") {
                scope.batchId = value;
                deleteCalls.push(scope);
              }

              return {
                error: null,
                eq: this.eq.bind(this),
              };
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
      storage: {
        from(bucket: string) {
          expect(bucket).toBe("imports");
          return {
            download,
          };
        },
      },
    },
  };
}

describe("dispatchImportBatch", () => {
  beforeEach(() => {
    insertAuditLog.mockReset();
    enqueueAiJob.mockReset();
  });

  it("marks the batch failed when the storage path is outside the organization prefix", async () => {
    const { client, download, updateValues, deleteCalls } = createMockClient("other-org/calls.csv");

    await expect(
      dispatchImportBatch(client as never, {
        organizationId: "org_1",
        batchId: "batch_1",
        actorUserId: "user_1",
      })
    ).rejects.toThrow("Import storage path is invalid for this organization.");

    expect(download).not.toHaveBeenCalled();
    expect(deleteCalls).toEqual([
      {
        table: "import_row_errors",
        organizationId: "org_1",
        batchId: "batch_1",
      },
    ]);
    expect(updateValues).toHaveLength(2);
    expect(updateValues[0]).toMatchObject({ status: "processing", row_count_total: 0 });
    expect(updateValues[1]).toMatchObject({ status: "failed" });
    expect(insertAuditLog).toHaveBeenCalledWith(client, expect.objectContaining({
      action: "import.dispatch.failed",
      entityId: "batch_1",
    }));
  });

  it("rejects retry when the batch is already processing", async () => {
    const { client, download, updateValues, deleteCalls } = createMockClient("org_1/calls.csv", "processing");

    await expect(
      dispatchImportBatch(client as never, {
        organizationId: "org_1",
        batchId: "batch_1",
        actorUserId: "user_1",
      })
    ).rejects.toThrow("This batch is already processing. Wait for it to finish before retrying dispatch.");

    expect(download).not.toHaveBeenCalled();
    expect(deleteCalls).toHaveLength(0);
    expect(updateValues).toHaveLength(0);
  });

  it("rejects retry when the batch is already completed", async () => {
    const { client, download, updateValues, deleteCalls } = createMockClient("org_1/calls.csv", "completed");

    await expect(
      dispatchImportBatch(client as never, {
        organizationId: "org_1",
        batchId: "batch_1",
        actorUserId: "user_1",
      })
    ).rejects.toThrow("Retry dispatch is only available for uploaded, failed, or partial batches.");

    expect(download).not.toHaveBeenCalled();
    expect(deleteCalls).toHaveLength(0);
    expect(updateValues).toHaveLength(0);
  });

  it("enqueues analysis when a CSV row already includes transcript text", async () => {
    const csv = [
      "caller_number,started_at,transcript_text",
      "+15555550123,2026-04-11T00:00:00.000Z,\"Agent: Hello. Customer: Hi.\"",
    ].join("\n");

    const client = {
      from(table: string) {
        if (table === "import_batches") {
          return {
            select() {
              return this;
            },
            update() {
              return {
                error: null,
                eq() {
                  return this;
                },
              };
            },
            eq() {
              return this;
            },
            async single() {
              return {
                data: {
                  id: "batch_1",
                  filename: "calls.csv",
                  storage_path: "org_1/calls.csv",
                  source_provider: "custom",
                  status: "uploaded",
                },
                error: null,
              };
            },
          };
        }

        if (table === "import_row_errors") {
          return {
            delete() {
              return {
                eq() {
                  return {
                    error: null,
                    eq() {
                      return this;
                    },
                  };
                },
              };
            },
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        if (table === "calls") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "call_1" },
                  error: null,
                })),
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
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
      storage: {
        from() {
          return {
            download: vi.fn(async () => ({
              data: {
                text: async () => csv,
              },
              error: null,
            })),
          };
        },
      },
    };

    const result = await dispatchImportBatch(client as never, {
      organizationId: "org_1",
      batchId: "batch_1",
      actorUserId: "user_1",
    });

    expect(result).toMatchObject({
      acceptedCount: 1,
      rejectedCount: 0,
      status: "completed",
    });
    expect(enqueueAiJob).toHaveBeenCalledWith(client, {
      organizationId: "org_1",
      callId: "call_1",
      jobType: "analysis",
    });
  });

  it("enqueues transcription when a CSV row includes a recording URL", async () => {
    const csv = [
      "caller_number,started_at,recording_url,language",
      "+15555550123,2026-04-11T00:00:00.000Z,https://example.com/call.mp3,en",
    ].join("\n");

    const client = {
      from(table: string) {
        if (table === "import_batches") {
          return {
            select() {
              return this;
            },
            update() {
              return {
                error: null,
                eq() {
                  return this;
                },
              };
            },
            eq() {
              return this;
            },
            async single() {
              return {
                data: {
                  id: "batch_1",
                  filename: "calls.csv",
                  storage_path: "org_1/calls.csv",
                  source_provider: "custom",
                  status: "uploaded",
                },
                error: null,
              };
            },
          };
        }

        if (table === "import_row_errors") {
          return {
            delete() {
              return {
                eq() {
                  return {
                    error: null,
                    eq() {
                      return this;
                    },
                  };
                },
              };
            },
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        if (table === "calls") {
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: "call_2" },
                  error: null,
                })),
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
            insert: vi.fn(async () => ({ error: null })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
      storage: {
        from() {
          return {
            download: vi.fn(async () => ({
              data: {
                text: async () => csv,
              },
              error: null,
            })),
          };
        },
      },
    };

    await dispatchImportBatch(client as never, {
      organizationId: "org_1",
      batchId: "batch_1",
      actorUserId: "user_1",
    });

    expect(enqueueAiJob).toHaveBeenCalledWith(client, {
      organizationId: "org_1",
      callId: "call_2",
      jobType: "transcription",
      payload: {
        language: "en",
      },
    });
  });
});
