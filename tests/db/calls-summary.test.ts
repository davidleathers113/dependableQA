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
  console.warn(`[test:db] Skipping calls-summary tests — no local Postgres reachable at ${dbUrl}.`);
}

// Deterministic fixture: 600 calls in org A. This intentionally exceeds the old
// 500-row JS cap in getCallsSummary so the test proves summarize_calls()
// aggregates over the *entire* filtered set rather than a truncated slice.
//
// flag_count is trigger-maintained (sync_call_flag_summary counts OPEN flags),
// so "flagged" is driven by inserting one open flag per call. We tie flagged to
// publisher assignment: every publisher-assigned call gets an open flag, every
// unassigned call gets none.
//
// By index i in 1..600:
//   publisher:    i<=200 -> P1, i<=300 -> P2, else unassigned   (P1=200, P2=100, null=300)
//   flagged:      has a publisher (open flag inserted)          (flagged=300)
//   disposition:  i<=150 'qualified', i<=250 'rejected', else null
//   review:       i<=200 'reviewed', else 'unreviewed'          (needsReview=400)
const TOTAL = 600;
const FLAGGED = 300;
const NEEDS_REVIEW = 400;
const QUALIFIED = 150; // "qualified"
const DISQUALIFIED = 100; // "rejected" (a disqualified substring, no qualified substring)
const COMPLIANCE_FLAGS = 5;

describe.skipIf(!available)("summarize_calls (full-set summary, migration 0021)", () => {
  let pool: Pool;
  let f: SeededFixtures;
  let publisherP1: string;
  let publisherP2: string;

  beforeAll(async () => {
    pool = createPool(dbUrl);
    f = await seedCoreFixtures(pool);

    // Start from a clean call set for org A (seedCoreFixtures seeds one call +
    // flag) so the expected counts below are exact.
    await pool.query("truncate table public.calls cascade");

    const publishers = await pool.query<{ id: string }>(
      `insert into public.publishers (organization_id, name, normalized_name)
       values ($1, 'Publisher One', 'publisher one'), ($1, 'Publisher Two', 'publisher two')
       returning id`,
      [f.orgA]
    );
    publisherP1 = publishers.rows[0].id;
    publisherP2 = publishers.rows[1].id;

    await pool.query(
      `insert into public.calls
         (id, organization_id, caller_number, started_at, source_provider,
          publisher_id, current_disposition, current_review_status)
       select
         gen_random_uuid(),
         $1,
         '+1555' || lpad(i::text, 7, '0'),
         now(),
         'custom',
         case when i <= 200 then $2::uuid when i <= 300 then $3::uuid else null end,
         case when i <= $4 then 'qualified' when i <= $4 + $5 then 'rejected' else null end,
         (case when i <= 200 then 'reviewed' else 'unreviewed' end)::public.call_review_status
       from generate_series(1, $6) as g(i)`,
      [f.orgA, publisherP1, publisherP2, QUALIFIED, DISQUALIFIED, TOTAL]
    );

    // Flag every publisher-assigned call once (open) so the trigger sets
    // flag_count > 0 -> flagged = 300. Five carry 'compliance' (counted by
    // complianceFlagCount); the rest carry 'quality' (wrong category, excluded).
    await pool.query(
      `insert into public.call_flags
         (organization_id, call_id, flag_type, flag_category, severity, status, source, title)
       select $1, id, 'compliance', 'compliance', 'medium', 'open', 'manual', 'Seeded compliance flag'
       from public.calls
       where organization_id = $1 and publisher_id is not null
       order by caller_number
       limit $2`,
      [f.orgA, COMPLIANCE_FLAGS]
    );
    await pool.query(
      `insert into public.call_flags
         (organization_id, call_id, flag_type, flag_category, severity, status, source, title)
       select $1, c.id, 'compliance', 'quality', 'medium', 'open', 'manual', 'Seeded quality flag'
       from public.calls c
       where c.organization_id = $1 and c.publisher_id is not null
         and not exists (select 1 from public.call_flags f where f.call_id = c.id)`,
      [f.orgA]
    );

    // A dismissed 'compliance' flag on an unflagged (unassigned) call: wrong
    // status, so it neither flags the call nor counts toward complianceFlagCount.
    await pool.query(
      `insert into public.call_flags
         (organization_id, call_id, flag_type, flag_category, severity, status, source, title)
       select $1, id, 'compliance', 'compliance', 'medium', 'dismissed', 'manual', 'Dismissed flag'
       from public.calls
       where organization_id = $1 and publisher_id is null
       order by caller_number
       limit 1`,
      [f.orgA]
    );
  });

  afterAll(async () => {
    if (pool) {
      await truncateAll(pool).catch(() => {});
      await pool.end();
    }
  });

  // Always read through RLS as an org-A member; summarize_calls is SECURITY
  // INVOKER, so this exercises the same isolation the browser/SSR client gets.
  async function summarize(args: { callIds?: string[] | null } = {}) {
    return withRole(pool, { role: "authenticated", userId: f.ownerA }, async (run) => {
      const { rows } = await run<Record<string, string | null>>(
        `select * from public.summarize_calls(p_org => $1, p_call_ids => $2::uuid[])`,
        [f.orgA, args.callIds ?? null]
      );
      return rows[0];
    });
  }

  it("counts the full filtered set, not a 500-row slice", async () => {
    const row = await summarize();
    expect(Number(row.total_calls)).toBe(TOTAL);
    expect(Number(row.flagged_calls)).toBe(FLAGGED);
    expect(Number(row.needs_review_count)).toBe(NEEDS_REVIEW);
    expect(Number(row.qualified_count)).toBe(QUALIFIED);
    expect(Number(row.disqualified_count)).toBe(DISQUALIFIED);
    expect(Number(row.compliance_flag_count)).toBe(COMPLIANCE_FLAGS);
  });

  it("returns the top flagged publisher over the full set", async () => {
    const row = await summarize();
    expect(row.top_publisher_id).toBe(publisherP1);
    expect(Number(row.top_publisher_flagged_calls)).toBe(200);
    expect(Number(row.top_publisher_total_calls)).toBe(200);
  });

  it("restricts the aggregate to the supplied call-id intersection", async () => {
    const subset = await withRole(pool, { role: "authenticated", userId: f.ownerA }, async (run) => {
      const { rows } = await run<{ id: string }>(
        `select id from public.calls where organization_id = $1 and current_disposition = 'qualified'`,
        [f.orgA]
      );
      return rows.map((r) => r.id);
    });
    expect(subset).toHaveLength(QUALIFIED);

    const row = await summarize({ callIds: subset });
    expect(Number(row.total_calls)).toBe(QUALIFIED);
    expect(Number(row.qualified_count)).toBe(QUALIFIED);
    expect(Number(row.disqualified_count)).toBe(0);
  });

  it("treats an empty call-id set as matching nothing", async () => {
    const row = await summarize({ callIds: [] });
    expect(Number(row.total_calls)).toBe(0);
    expect(Number(row.flagged_calls)).toBe(0);
    expect(row.top_publisher_id).toBeNull();
  });

  it("does not leak another organization's calls through RLS", async () => {
    // Ask for org A's summary while authenticated as org B's owner: RLS hides
    // org A's rows entirely, so the aggregate is empty.
    const row = await withRole(pool, { role: "authenticated", userId: f.ownerB }, async (run) => {
      const { rows } = await run<Record<string, string | null>>(
        `select * from public.summarize_calls(p_org => $1)`,
        [f.orgA]
      );
      return rows[0];
    });
    expect(Number(row.total_calls)).toBe(0);
    expect(Number(row.compliance_flag_count)).toBe(0);
  });
});
