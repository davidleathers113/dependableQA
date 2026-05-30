import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPool,
  isDatabaseAvailable,
  resolveTestDatabaseUrl,
  seedCoreFixtures,
  truncateAll,
  withRole,
  type SeededFixtures,
} from "./db-harness";

const dbUrl = resolveTestDatabaseUrl();
const available = await isDatabaseAvailable(dbUrl);

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(`[test:db] Skipping ringba_import_batches tests — no local Postgres at ${dbUrl}.`);
}

describe.skipIf(!available)("ringba_import_batches (migration 0015)", () => {
  let pool: Pool;
  let f: SeededFixtures;

  beforeAll(async () => {
    pool = createPool(dbUrl);
    f = await seedCoreFixtures(pool);
  });

  afterAll(async () => {
    if (pool) {
      await truncateAll(pool).catch(() => {});
      await pool.end();
    }
  });

  async function insertBatch(orgId: string, integrationId: string, overrides: Record<string, string> = {}) {
    const id = randomUUID();
    await pool.query(
      `insert into public.ringba_import_batches
         (id, organization_id, integration_id, date_start, date_end, max_records, status, import_behavior)
       values ($1, $2, $3, now() - interval '7 days', now(), $4, $5, $6)`,
      [
        id,
        orgId,
        integrationId,
        overrides.max_records ?? "100",
        overrides.status ?? "running",
        overrides.import_behavior ?? "import_only",
      ]
    );
    return id;
  }

  it("accepts a valid batch row with defaults", async () => {
    const id = await insertBatch(f.orgA, f.integrationA);
    const { rows } = await pool.query(
      "select records_seen, records_imported, recordings_imported, status from public.ringba_import_batches where id = $1",
      [id]
    );
    expect(rows[0]).toMatchObject({
      records_seen: 0,
      records_imported: 0,
      recordings_imported: 0,
      status: "running",
    });
  });

  it("rejects an invalid status via the CHECK constraint", async () => {
    await expect(insertBatch(f.orgA, f.integrationA, { status: "bogus" })).rejects.toThrow();
  });

  it("rejects an invalid import_behavior via the CHECK constraint", async () => {
    await expect(
      insertBatch(f.orgA, f.integrationA, { import_behavior: "delete_everything" })
    ).rejects.toThrow();
  });

  it("rejects a non-positive max_records", async () => {
    await expect(insertBatch(f.orgA, f.integrationA, { max_records: "0" })).rejects.toThrow();
  });

  it("a member can read their own org's import batches but not another org's", async () => {
    const batchA = await insertBatch(f.orgA, f.integrationA);
    const batchB = await insertBatch(f.orgB, f.integrationB);

    const ownRows = await withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
      run("select id from public.ringba_import_batches where id = $1", [batchA]).then((r) => r.rows)
    );
    expect(ownRows).toHaveLength(1);

    const crossRows = await withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
      run("select id from public.ringba_import_batches where id = $1", [batchB]).then((r) => r.rows)
    );
    expect(crossRows).toHaveLength(0);
  });

  it("only owners/admins can insert a batch (reviewer is blocked by RLS)", async () => {
    await expect(
      withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
        run(
          `insert into public.ringba_import_batches
             (organization_id, integration_id, date_start, date_end, max_records)
           values ($1, $2, now() - interval '1 day', now(), 10)`,
          [f.orgA, f.integrationA]
        )
      )
    ).rejects.toThrow();
  });
});
