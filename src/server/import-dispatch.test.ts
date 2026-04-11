import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertAuditLog } = vi.hoisted(() => ({
  insertAuditLog: vi.fn(),
}));

vi.mock("../lib/app-data", async () => {
  const actual = await vi.importActual<typeof import("../lib/app-data")>("../lib/app-data");
  return {
    ...actual,
    insertAuditLog,
  };
});

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
});
