import { describe, expect, it, vi } from "vitest";

const { insertAuditLog, getOpenAiServerConfig } = vi.hoisted(() => ({
  insertAuditLog: vi.fn(),
  getOpenAiServerConfig: vi.fn(),
}));

vi.mock("../lib/app-data", async () => {
  const actual = await vi.importActual<typeof import("../lib/app-data")>("../lib/app-data");
  return {
    ...actual,
    insertAuditLog,
  };
});

vi.mock("../lib/openai/server-client", () => ({
  getOpenAiServerConfig,
}));

import { claimAiJobs, enqueueAiJob, recoverExpiredAiJobs, runAiJobs } from "./ai-jobs";

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

type CallRow = {
  id: string;
  organization_id: string;
  transcription_status: string;
  transcription_error: string | null;
  transcription_started_at: string | null;
  transcription_completed_at: string | null;
  analysis_status: string;
  analysis_error: string | null;
  analysis_started_at: string | null;
  analysis_completed_at: string | null;
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

function createSelectQuery(rows: JobRow[]) {
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

function createClient(initialJobs: JobRow[] = []) {
  const jobs = [...initialJobs];
  const calls = new Map<string, CallRow>([
    [
      "call_1",
      {
        id: "call_1",
        organization_id: "org_1",
        transcription_status: "pending",
        transcription_error: null,
        transcription_started_at: null,
        transcription_completed_at: null,
        analysis_status: "pending",
        analysis_error: null,
        analysis_started_at: null,
        analysis_completed_at: null,
        updated_at: "2026-04-11T00:00:00.000Z",
      },
    ],
  ]);

  return {
    jobs,
    calls,
    client: {
      from(table: string) {
        if (table === "ai_jobs") {
          return {
            select: () => createSelectQuery(jobs),
            insert(values: Record<string, unknown>) {
              const row: JobRow = {
                id: `job_${jobs.length + 1}`,
                organization_id: String(values.organization_id),
                call_id: String(values.call_id),
                job_type: String(values.job_type),
                status: String(values.status ?? "queued"),
                attempt_count: Number(values.attempt_count ?? 0),
                max_attempts: Number(values.max_attempts ?? 3),
                priority: Number(values.priority ?? 100),
                scheduled_at: String(values.scheduled_at ?? "2026-04-11T00:00:00.000Z"),
                started_at: null,
                completed_at: null,
                lease_expires_at: null,
                dedupe_key: String(values.dedupe_key),
                payload_json: (values.payload_json as Record<string, unknown>) ?? {},
                last_error: null,
                created_at: "2026-04-11T00:00:00.000Z",
                updated_at: "2026-04-11T00:00:00.000Z",
              };
              jobs.push(row);
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
                  const match = applyFilters(jobs, filters)[0] ?? null;
                  if (!match) {
                    return { data: null, error: null };
                  }

                  Object.assign(match, values);
                  return { data: match, error: null };
                },
                async single() {
                  const match = applyFilters(jobs, filters)[0] ?? null;
                  if (!match) {
                    return { data: null, error: null };
                  }

                  Object.assign(match, values);
                  return { data: match, error: null };
                },
              };
            },
          };
        }

        if (table === "calls") {
          return {
            update(values: Record<string, unknown>) {
              let organizationId = "";
              let callId = "";

              return {
                eq(column: string, value: unknown) {
                  if (column === "organization_id") {
                    organizationId = String(value);
                  }

                  if (column === "id") {
                    callId = String(value);
                  }

                  const row = calls.get(callId);
                  if (row && row.organization_id === organizationId) {
                    Object.assign(row, values);
                  }

                  return this;
                },
              };
            },
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    },
  };
}

describe("ai jobs", () => {
  it("creates a queued job and updates the matching call status", async () => {
    getOpenAiServerConfig.mockReset();
    getOpenAiServerConfig.mockReturnValue({
      analysisPromptVersion: "v1",
      analysisSchemaVersion: "v1",
    });
    const { client, jobs, calls } = createClient();

    const result = await enqueueAiJob(client as never, {
      organizationId: "org_1",
      callId: "call_1",
      jobType: "transcription",
    });

    expect(result).toMatchObject({
      created: true,
      status: "queued",
    });
    expect(jobs).toHaveLength(1);
    expect(calls.get("call_1")).toMatchObject({
      transcription_status: "queued",
      transcription_error: null,
    });
  });

  it("does not duplicate an existing queued job and can requeue a failed one", async () => {
    getOpenAiServerConfig.mockReset();
    getOpenAiServerConfig.mockReturnValue({
      analysisPromptVersion: "v1",
      analysisSchemaVersion: "v1",
    });
    const queuedJob: JobRow = {
      id: "job_1",
      organization_id: "org_1",
      call_id: "call_1",
      job_type: "analysis",
      status: "queued",
      attempt_count: 0,
      max_attempts: 3,
      priority: 100,
      scheduled_at: "2026-04-11T00:00:00.000Z",
      started_at: null,
      completed_at: null,
      lease_expires_at: null,
      dedupe_key: "call_1:analysis:v1:v1",
      payload_json: {
        analysisVersionKey: "v1:v1",
      },
      last_error: null,
      created_at: "2026-04-11T00:00:00.000Z",
      updated_at: "2026-04-11T00:00:00.000Z",
    };
    const failedJob: JobRow = {
      ...queuedJob,
      id: "job_2",
      job_type: "transcription",
      status: "failed",
      dedupe_key: "call_1:transcription",
      last_error: "old error",
    };

    const { client, jobs, calls } = createClient([queuedJob, failedJob]);

    const existing = await enqueueAiJob(client as never, {
      organizationId: "org_1",
      callId: "call_1",
      jobType: "analysis",
    });
    const retried = await enqueueAiJob(client as never, {
      organizationId: "org_1",
      callId: "call_1",
      jobType: "transcription",
    });

    expect(existing).toMatchObject({
      id: "job_1",
      created: false,
      status: "queued",
    });
    expect(retried).toMatchObject({
      id: "job_2",
      created: false,
      status: "queued",
    });
    expect(jobs).toHaveLength(2);
    expect(jobs[1]).toMatchObject({
      status: "queued",
      last_error: null,
    });
    expect(calls.get("call_1")).toMatchObject({
      transcription_status: "queued",
    });
  });

  it("claims queued jobs that are ready to run", async () => {
    getOpenAiServerConfig.mockReset();
    getOpenAiServerConfig.mockReturnValue({
      analysisPromptVersion: "v1",
      analysisSchemaVersion: "v1",
    });
    const { client, jobs } = createClient([
      {
        id: "job_1",
        organization_id: "org_1",
        call_id: "call_1",
        job_type: "analysis",
        status: "queued",
        attempt_count: 0,
        max_attempts: 3,
        priority: 100,
        scheduled_at: "2026-04-11T00:00:00.000Z",
        started_at: null,
        completed_at: null,
        lease_expires_at: null,
        dedupe_key: "call_1:analysis",
        payload_json: {},
        last_error: null,
        created_at: "2026-04-11T00:00:00.000Z",
        updated_at: "2026-04-11T00:00:00.000Z",
      },
    ]);

    const claimed = await claimAiJobs(client as never, {
      limit: 1,
      jobType: "analysis",
    });

    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      id: "job_1",
      status: "claimed",
    });
    expect(jobs[0].lease_expires_at).not.toBeNull();
  });

  it("recovers expired leased jobs and re-queues them when retries remain", async () => {
    getOpenAiServerConfig.mockReset();
    getOpenAiServerConfig.mockReturnValue({
      analysisPromptVersion: "v1",
      analysisSchemaVersion: "v1",
    });
    const { client, jobs, calls } = createClient([
      {
        id: "job_1",
        organization_id: "org_1",
        call_id: "call_1",
        job_type: "analysis",
        status: "running",
        attempt_count: 1,
        max_attempts: 3,
        priority: 100,
        scheduled_at: "2026-04-11T00:00:00.000Z",
        started_at: "2026-04-11T00:01:00.000Z",
        completed_at: null,
        lease_expires_at: "2026-04-11T00:02:00.000Z",
        dedupe_key: "call_1:analysis",
        payload_json: {},
        last_error: null,
        created_at: "2026-04-11T00:00:00.000Z",
        updated_at: "2026-04-11T00:00:00.000Z",
      },
    ]);

    const recovered = await recoverExpiredAiJobs(client as never, {
      limit: 5,
    });

    expect(recovered).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      status: "retry_scheduled",
      last_error: "AI job lease expired before completion.",
    });
    expect(calls.get("call_1")).toMatchObject({
      analysis_status: "queued",
      analysis_error: "AI job lease expired before completion.",
    });
  });

  it("runs queued jobs and enqueues downstream analysis after transcription", async () => {
    getOpenAiServerConfig.mockReset();
    getOpenAiServerConfig.mockReturnValue({
      analysisPromptVersion: "v1",
      analysisSchemaVersion: "v1",
    });
    const { client, jobs, calls } = createClient([
      {
        id: "job_1",
        organization_id: "org_1",
        call_id: "call_1",
        job_type: "transcription",
        status: "queued",
        attempt_count: 0,
        max_attempts: 3,
        priority: 100,
        scheduled_at: "2026-04-11T00:00:00.000Z",
        started_at: null,
        completed_at: null,
        lease_expires_at: null,
        dedupe_key: "call_1:transcription",
        payload_json: {},
        last_error: null,
        created_at: "2026-04-11T00:00:00.000Z",
        updated_at: "2026-04-11T00:00:00.000Z",
      },
    ]);

    const result = await runAiJobs(client as never, {
      limit: 1,
      handlers: {
        transcription: vi.fn(async () => ({
          transcriptText: "Transcript text",
          transcriptSegments: [],
          durationSeconds: 30,
          modelName: "gpt-4o-transcribe-diarize",
        })),
        analysis: vi.fn(async () => ({
          modelName: "gpt-4.1-mini",
          summary: "Summary",
          suggestedDisposition: "qualified" as const,
          confidence: 0.9,
          flagCount: 0,
        })),
      },
    });

    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]).toMatchObject({
      id: "job_1",
      jobType: "transcription",
      status: "completed",
    });
    expect(jobs).toHaveLength(2);
    expect(jobs[1]).toMatchObject({
      job_type: "analysis",
      status: "queued",
      dedupe_key: "call_1:analysis:v1:v1",
      payload_json: {
        analysisVersionKey: "v1:v1",
      },
    });
    expect(calls.get("call_1")).toMatchObject({
      transcription_status: "processing",
      analysis_status: "queued",
    });
  });

  it("creates a new analysis job when the analysis version changes", async () => {
    getOpenAiServerConfig.mockReset();
    getOpenAiServerConfig.mockReturnValue({
      analysisPromptVersion: "v2",
      analysisSchemaVersion: "v1",
    });
    const { client, jobs } = createClient([
      {
        id: "job_1",
        organization_id: "org_1",
        call_id: "call_1",
        job_type: "analysis",
        status: "completed",
        attempt_count: 1,
        max_attempts: 3,
        priority: 100,
        scheduled_at: "2026-04-11T00:00:00.000Z",
        started_at: "2026-04-11T00:01:00.000Z",
        completed_at: "2026-04-11T00:02:00.000Z",
        lease_expires_at: null,
        dedupe_key: "call_1:analysis:v1:v1",
        payload_json: {
          analysisVersionKey: "v1:v1",
        },
        last_error: null,
        created_at: "2026-04-11T00:00:00.000Z",
        updated_at: "2026-04-11T00:00:00.000Z",
      },
    ]);

    const result = await enqueueAiJob(client as never, {
      organizationId: "org_1",
      callId: "call_1",
      jobType: "analysis",
    });

    expect(result).toMatchObject({
      created: true,
      status: "queued",
    });
    expect(jobs).toHaveLength(2);
    expect(jobs[1]).toMatchObject({
      dedupe_key: "call_1:analysis:v2:v1",
      payload_json: {
        analysisVersionKey: "v2:v1",
      },
    });
  });

  it("marks non-retryable job failures as failed immediately", async () => {
    getOpenAiServerConfig.mockReset();
    getOpenAiServerConfig.mockReturnValue({
      analysisPromptVersion: "v1",
      analysisSchemaVersion: "v1",
    });
    const { client, jobs, calls } = createClient([
      {
        id: "job_1",
        organization_id: "org_1",
        call_id: "call_1",
        job_type: "transcription",
        status: "queued",
        attempt_count: 0,
        max_attempts: 3,
        priority: 100,
        scheduled_at: "2026-04-11T00:00:00.000Z",
        started_at: null,
        completed_at: null,
        lease_expires_at: null,
        dedupe_key: "call_1:transcription",
        payload_json: {},
        last_error: null,
        created_at: "2026-04-11T00:00:00.000Z",
        updated_at: "2026-04-11T00:00:00.000Z",
      },
    ]);

    const result = await runAiJobs(client as never, {
      limit: 1,
      handlers: {
        transcription: vi.fn(async () => {
          const error = new Error("Recording exceeds the 25 MB transcription limit.");
          (error as Error & { retryable?: boolean }).retryable = false;
          throw error;
        }),
        analysis: vi.fn(async () => ({
          modelName: "gpt-4.1-mini",
          summary: "Summary",
          suggestedDisposition: "qualified" as const,
          confidence: 0.9,
          flagCount: 0,
        })),
      },
    });

    expect(result.processed[0]).toMatchObject({
      id: "job_1",
      status: "failed",
    });
    expect(jobs[0]).toMatchObject({
      status: "failed",
      last_error: "Recording exceeds the 25 MB transcription limit.",
    });
    expect(calls.get("call_1")).toMatchObject({
      transcription_status: "failed",
      transcription_error: "Recording exceeds the 25 MB transcription limit.",
    });
  });
});
