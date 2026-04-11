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

function createMockClient(storagePath: string) {
  const updateValues: Array<Record<string, unknown>> = [];
  const download = vi.fn();

  return {
    updateValues,
    download,
    client: {
      from(table: string) {
        if (table !== "import_batches") {
          throw new Error(`Unexpected table: ${table}`);
        }

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
              },
              error: null,
            };
          },
        };
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
    const { client, download, updateValues } = createMockClient("other-org/calls.csv");

    await expect(
      dispatchImportBatch(client as never, {
        organizationId: "org_1",
        batchId: "batch_1",
        actorUserId: "user_1",
      })
    ).rejects.toThrow("Import storage path is invalid for this organization.");

    expect(download).not.toHaveBeenCalled();
    expect(updateValues).toHaveLength(2);
    expect(updateValues[0]).toMatchObject({ status: "processing" });
    expect(updateValues[1]).toMatchObject({ status: "failed" });
    expect(insertAuditLog).toHaveBeenCalledWith(client, expect.objectContaining({
      action: "import.dispatch.failed",
      entityId: "batch_1",
    }));
  });
});
