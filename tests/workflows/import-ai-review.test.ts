import { describe, expect, it, vi } from "vitest";

const { insertAuditLog } = vi.hoisted(() => ({
  insertAuditLog: vi.fn(),
}));

vi.mock("../../src/lib/app-data", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/app-data")>("../../src/lib/app-data");
  return {
    ...actual,
    insertAuditLog,
  };
});

import { dispatchImportBatch } from "../../src/server/import-dispatch";
import { runAiJobs } from "../../src/server/ai-jobs";

type JobRow = {
  id: string;
  organization_id: string;
  call_id: string;
  job_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  priority: number;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  lease_expires_at: string | null;
  dedupe_key: string;
  payload_json: Record<string, unknown>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function applyFilters<T extends Record<string, unknown>>(
  rows: T[],
  filters: Array<{ kind: "eq" | "in" | "lte"; column: string; value: unknown }>
) {
  return rows.filter((row) =>
    filters.every((filter) => {
      const value = row[filter.column];
      if (filter.kind === "eq") {
        return value === filter.value;
      }

      if (filter.kind === "in") {
        return Array.isArray(filter.value) && filter.value.includes(value);
      }

      if (typeof value === "string" && typeof filter.value === "string") {
        return value <= filter.value;
      }

      return false;
    })
  );
}

function createAiJobsQuery(rows: JobRow[]) {
  const filters: Array<{ kind: "eq" | "in" | "lte"; column: string; value: unknown }> = [];
  let limitCount = Number.POSITIVE_INFINITY;

  return {
    eq(column: string, value: unknown) {
      filters.push({ kind: "eq", column, value });
      return this;
    },
    in(column: string, value: unknown) {
      filters.push({ kind: "in", column, value });
      return this;
    },
    lte(column: string, value: unknown) {
      filters.push({ kind: "lte", column, value });
      return this;
    },
    order() {
      return this;
    },
    limit(value: number) {
      limitCount = value;
      return this;
    },
    async maybeSingle() {
      const filtered = applyFilters(rows, filters);
      return {
        data: filtered[0] ?? null,
        error: null,
      };
    },
    async single() {
      const filtered = applyFilters(rows, filters);
      return {
        data: filtered[0] ?? null,
        error: null,
      };
    },
    then(resolve: (value: { data: JobRow[]; error: null }) => unknown) {
      const filtered = applyFilters(rows, filters).slice(0, limitCount);
      return Promise.resolve({
        data: filtered,
        error: null,
      }).then(resolve);
    },
  };
}

function createWorkflowClient(csvText: string) {
  const calls: Array<Record<string, unknown>> = [];
  const callTranscripts: Array<Record<string, unknown>> = [];
  const callAnalyses: Array<Record<string, unknown>> = [];
  const aiJobs: JobRow[] = [];
  const importBatchUpdates: Array<Record<string, unknown>> = [];

  return {
    calls,
    callTranscripts,
    callAnalyses,
    aiJobs,
    importBatchUpdates,
    client: {
      from(table: string) {
        if (table === "import_batches") {
          return {
            select() {
              return this;
            },
            update(values: Record<string, unknown>) {
              importBatchUpdates.push(values);
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
            insert: vi.fn((values: Record<string, unknown>) => {
              const row = {
                id: `call_${calls.length + 1}`,
                ...values,
              };
              calls.push(row);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: { id: row.id },
                    error: null,
                  })),
                })),
              };
            }),
            update: vi.fn((values: Record<string, unknown>) => ({
              eq: vi.fn((column: string, _value: unknown) => {
                if (column !== "organization_id") {
                  return {
                    eq: vi.fn(async (_idColumn: string, idValue: unknown) => {
                      const row = calls.find((entry) => entry.id === idValue);
                      if (row) {
                        Object.assign(row, values);
                      }
                      return { error: null };
                    }),
                  };
                }

                return {
                  eq: vi.fn(async (_: string, idValue: unknown) => {
                    const row = calls.find((entry) => entry.id === idValue);
                    if (row) {
                      Object.assign(row, values);
                    }
                    return { error: null };
                  }),
                };
              }),
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
            insert: vi.fn(async (values: Record<string, unknown>) => {
              callTranscripts.push(values);
              return { error: null };
            }),
          };
        }

        if (table === "call_analyses") {
          return {
            insert: vi.fn(async (values: Record<string, unknown>) => {
              callAnalyses.push(values);
              return { error: null };
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
          };
        }

        if (table === "ai_jobs") {
          return {
            select: () => createAiJobsQuery(aiJobs),
            insert(values: Record<string, unknown>) {
              const row: JobRow = {
                id: `job_${aiJobs.length + 1}`,
                organization_id: String(values.organization_id),
                call_id: String(values.call_id),
                job_type: String(values.job_type),
                status: String(values.status ?? "queued"),
                attempt_count: Number(values.attempt_count ?? 0),
                max_attempts: Number(values.max_attempts ?? 3),
                priority: Number(values.priority ?? 100),
                scheduled_at: String(values.scheduled_at ?? "2026-04-12T00:00:00.000Z"),
                started_at: null,
                completed_at: null,
                lease_expires_at: null,
                dedupe_key: String(values.dedupe_key),
                payload_json: (values.payload_json as Record<string, unknown>) ?? {},
                last_error: null,
                created_at: "2026-04-12T00:00:00.000Z",
                updated_at: "2026-04-12T00:00:00.000Z",
              };
              aiJobs.push(row);
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: row,
                        error: null,
                      };
                    },
                  };
                },
              };
            },
            update(values: Record<string, unknown>) {
              const filters: Array<{ kind: "eq"; column: string; value: unknown }> = [];
              return {
                eq(column: string, value: unknown) {
                  filters.push({ kind: "eq", column, value });
                  return this;
                },
                select() {
                  return this;
                },
                async maybeSingle() {
                  const match = applyFilters(aiJobs, filters)[0] ?? null;
                  if (match) {
                    Object.assign(match, values);
                  }
                  return { data: match, error: null };
                },
                async single() {
                  const match = applyFilters(aiJobs, filters)[0] ?? null;
                  if (match) {
                    Object.assign(match, values);
                  }
                  return { data: match, error: null };
                },
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
            download: vi.fn(async () => ({
              data: {
                text: async () => csvText,
              },
              error: null,
            })),
          };
        },
      },
    },
  };
}

describe("import to AI review workflow", () => {
  it("dispatches an imported transcript row and completes the analysis job", async () => {
    const csv = [
      "caller_number,started_at,transcript_text",
      "+15555550123,2026-04-12T00:00:00.000Z,\"Agent: Hello. Customer: I need pricing.\"",
    ].join("\n");
    const { client, calls, callTranscripts, callAnalyses, aiJobs } = createWorkflowClient(csv);

    const dispatchResult = await dispatchImportBatch(client as never, {
      organizationId: "org_1",
      batchId: "batch_1",
      actorUserId: "user_1",
    });

    const analysisResult = await runAiJobs(client as never, {
      limit: 1,
      handlers: {
        transcription: vi.fn(async () => ({
          transcriptText: "Transcript text",
          transcriptSegments: [],
          durationSeconds: 60,
          modelName: "gpt-4o-transcribe-diarize",
        })),
        analysis: vi.fn(async (workingClient, input) => {
          const analysisInsert = await workingClient.from("call_analyses").insert({
            organization_id: input.organizationId,
            call_id: input.callId,
            analysis_version: "workflow-test",
            model_name: "gpt-4.1-mini",
            summary: "Workflow summary",
            disposition_suggested: "qualified",
            confidence: 0.9,
            flag_summary: [],
            structured_output: {},
          });
          if (analysisInsert.error) {
            throw new Error(analysisInsert.error.message);
          }

          const callUpdate = await workingClient
            .from("calls")
            .update({
              analysis_status: "completed",
              analysis_error: null,
            })
            .eq("organization_id", input.organizationId)
            .eq("id", input.callId);
          if (callUpdate.error) {
            throw new Error(callUpdate.error.message);
          }

          return {
            modelName: "gpt-4.1-mini",
            summary: "Workflow summary",
            suggestedDisposition: "qualified",
            confidence: 0.9,
            flagCount: 0,
          };
        }),
      },
    });

    expect(dispatchResult).toMatchObject({
      acceptedCount: 1,
      rejectedCount: 0,
      status: "completed",
    });
    expect(calls).toHaveLength(1);
    expect(callTranscripts).toHaveLength(1);
    expect(aiJobs).toHaveLength(1);
    expect(analysisResult.processed).toHaveLength(1);
    expect(aiJobs[0]).toMatchObject({
      job_type: "analysis",
      status: "completed",
    });
    expect(callAnalyses).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      analysis_status: "completed",
    });
  });
});
