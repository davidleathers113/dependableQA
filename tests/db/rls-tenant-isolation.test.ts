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
  console.warn(
    `[test:db] Skipping RLS tests — no local Postgres reachable at ${dbUrl}. ` +
      "Run `supabase start` first."
  );
}

describe.skipIf(!available)("DB-level RLS tenant isolation", () => {
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

  // --- 1. Cross-org reads on calls -----------------------------------------
  it("a member can read calls in their own org", async () => {
    const rows = await withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
      run("select id from public.calls where id = $1", [f.callA]).then((r) => r.rows)
    );
    expect(rows).toHaveLength(1);
  });

  it("Org A user cannot read Org B calls", async () => {
    const rows = await withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
      run("select id from public.calls where id = $1", [f.callB]).then((r) => r.rows)
    );
    expect(rows).toHaveLength(0);
  });

  it("Org A user cannot see Org B in an unfiltered organizations scan", async () => {
    const ids = await withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
      run("select id from public.organizations").then((r) => r.rows.map((row) => row.id))
    );
    expect(ids).toContain(f.orgA);
    expect(ids).not.toContain(f.orgB);
  });

  // --- 2. Cross-org writes on call_flags -----------------------------------
  it("Org A user cannot INSERT a call flag into Org B", async () => {
    await expect(
      withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
        run(
          `insert into public.call_flags
             (organization_id, call_id, flag_type, flag_category, severity, source, title)
           values ($1, $2, 'compliance', 'disclosure', 'low', 'manual', 'Cross-tenant')`,
          [f.orgB, f.callB]
        )
      )
    ).rejects.toThrow("row-level security policy");
  });

  it("Org A user UPDATE of an Org B call flag affects zero rows", async () => {
    const rowCount = await withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
      run("update public.call_flags set title = 'hijacked' where id = $1", [f.flagB]).then(
        (r) => r.rowCount
      )
    );
    expect(rowCount).toBe(0);
    // Confirm the row is genuinely untouched (read back as superuser).
    const { rows } = await pool.query("select title from public.call_flags where id = $1", [f.flagB]);
    expect(rows[0]?.title).toBe("Flag B");
  });

  it("Org A user DELETE of an Org B call flag affects zero rows", async () => {
    const rowCount = await withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
      run("delete from public.call_flags where id = $1", [f.flagB]).then((r) => r.rowCount)
    );
    expect(rowCount).toBe(0);
    const { rows } = await pool.query("select count(*)::int as n from public.call_flags where id = $1", [
      f.flagB,
    ]);
    expect(rows[0]?.n).toBe(1);
  });

  // --- 3. Cross-org reads on review notes ----------------------------------
  it("Org A user cannot read Org B call review notes", async () => {
    const rows = await withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
      run("select id from public.call_review_notes where id = $1", [f.noteB]).then((r) => r.rows)
    );
    expect(rows).toHaveLength(0);
  });

  // --- 4. Reviewer can manage review objects in their own org --------------
  it("a reviewer can insert a call flag in their own org", async () => {
    const rowCount = await withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
      run(
        `insert into public.call_flags
           (organization_id, call_id, flag_type, flag_category, severity, source, title)
         values ($1, $2, 'compliance', 'disclosure', 'low', 'manual', 'In-org flag')`,
        [f.orgA, f.callA]
      ).then((r) => r.rowCount)
    );
    expect(rowCount).toBe(1);
  });

  it("a reviewer can insert their own review note in their own org", async () => {
    const rowCount = await withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
      run(
        `insert into public.call_review_notes
           (organization_id, call_id, created_by, body, start_seconds)
         values ($1, $2, $3, 'New reviewer note', 1.5)`,
        [f.orgA, f.callA, f.reviewerA]
      ).then((r) => r.rowCount)
    );
    expect(rowCount).toBe(1);
  });

  it("a reviewer cannot insert a review note attributed to another user", async () => {
    // created_by must equal auth.uid() per the insert policy's WITH CHECK.
    await expect(
      withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
        run(
          `insert into public.call_review_notes
             (organization_id, call_id, created_by, body, start_seconds)
           values ($1, $2, $3, 'Spoofed author', 0)`,
          [f.orgA, f.callA, f.ownerA]
        )
      )
    ).rejects.toThrow("row-level security policy");
  });

  // --- 5. Analyst/billing cannot perform reviewer-only writes --------------
  it("an analyst cannot insert a call flag (reviewer-only write)", async () => {
    await expect(
      withRole(pool, { role: "authenticated", userId: f.analystA }, (run) =>
        run(
          `insert into public.call_flags
             (organization_id, call_id, flag_type, flag_category, severity, source, title)
           values ($1, $2, 'compliance', 'disclosure', 'low', 'manual', 'Analyst flag')`,
          [f.orgA, f.callA]
        )
      )
    ).rejects.toThrow("row-level security policy");
  });

  it("an analyst is still a member who can read their org's calls", async () => {
    const rows = await withRole(pool, { role: "authenticated", userId: f.analystA }, (run) =>
      run("select id from public.calls where id = $1", [f.callA]).then((r) => r.rows)
    );
    expect(rows).toHaveLength(1);
  });

  it("a billing member can manage billing accounts but an analyst cannot", async () => {
    const billingRowCount = await withRole(
      pool,
      { role: "authenticated", userId: f.billingA },
      (run) =>
        run("update public.billing_accounts set autopay_enabled = false where id = $1", [
          f.billingAccountA,
        ]).then((r) => r.rowCount)
    );
    expect(billingRowCount).toBe(1);

    const analystRowCount = await withRole(
      pool,
      { role: "authenticated", userId: f.analystA },
      (run) =>
        run("update public.billing_accounts set autopay_enabled = true where id = $1", [
          f.billingAccountA,
        ]).then((r) => r.rowCount)
    );
    expect(analystRowCount).toBe(0);
  });

  // --- 6. Cross-org billing rows invisible to non-member -------------------
  it("a non-member cannot read another org's billing account", async () => {
    const rows = await withRole(pool, { role: "authenticated", userId: f.ownerB }, (run) =>
      run("select id from public.billing_accounts where id = $1", [f.billingAccountA]).then(
        (r) => r.rows
      )
    );
    expect(rows).toHaveLength(0);
  });

  it("a member can read their own org's billing account", async () => {
    const rows = await withRole(pool, { role: "authenticated", userId: f.ownerA }, (run) =>
      run("select id from public.billing_accounts where id = $1", [f.billingAccountA]).then(
        (r) => r.rows
      )
    );
    expect(rows).toHaveLength(1);
  });

  // --- 7. Cross-org integrations invisible to non-member -------------------
  it("a non-member cannot read another org's integrations", async () => {
    const rows = await withRole(pool, { role: "authenticated", userId: f.ownerB }, (run) =>
      run("select id from public.integrations where id = $1", [f.integrationA]).then((r) => r.rows)
    );
    expect(rows).toHaveLength(0);
  });

  it("a member can read their own org's integrations", async () => {
    const rows = await withRole(pool, { role: "authenticated", userId: f.reviewerA }, (run) =>
      run("select id from public.integrations where id = $1", [f.integrationA]).then((r) => r.rows)
    );
    expect(rows).toHaveLength(1);
  });

  // --- 8. ai_jobs is service-role-only (RLS enabled, no policies) -----------
  it("ai_jobs is invisible to an authenticated member (deny-all)", async () => {
    const rows = await withRole(pool, { role: "authenticated", userId: f.ownerA }, (run) =>
      run("select id from public.ai_jobs").then((r) => r.rows)
    );
    expect(rows).toHaveLength(0);
    // The seeded row genuinely exists — it is invisible, not absent.
    const { rows: real } = await pool.query("select count(*)::int as n from public.ai_jobs");
    expect(real[0]?.n).toBeGreaterThanOrEqual(1);
  });

  it("ai_jobs is invisible to anon and rejects authenticated writes", async () => {
    const anonRows = await withRole(pool, { role: "anon" }, (run) =>
      run("select id from public.ai_jobs").then((r) => r.rows)
    );
    expect(anonRows).toHaveLength(0);

    await expect(
      withRole(pool, { role: "authenticated", userId: f.ownerA }, (run) =>
        run(
          `insert into public.ai_jobs (organization_id, call_id, job_type, status, dedupe_key)
           values ($1, $2, 'analysis', 'queued', 'should-fail')`,
          [f.orgA, f.callA]
        )
      )
    ).rejects.toThrow("row-level security policy");
  });

  // --- 9. processed_stripe_events is service-role-only ---------------------
  it("processed_stripe_events is invisible to authenticated and anon (deny-all)", async () => {
    const authRows = await withRole(pool, { role: "authenticated", userId: f.ownerA }, (run) =>
      run("select stripe_event_id from public.processed_stripe_events").then((r) => r.rows)
    );
    expect(authRows).toHaveLength(0);

    const anonRows = await withRole(pool, { role: "anon" }, (run) =>
      run("select stripe_event_id from public.processed_stripe_events").then((r) => r.rows)
    );
    expect(anonRows).toHaveLength(0);

    const { rows: real } = await pool.query(
      "select count(*)::int as n from public.processed_stripe_events"
    );
    expect(real[0]?.n).toBeGreaterThanOrEqual(1);
  });

  // --- anon baseline -------------------------------------------------------
  it("anon cannot read any tenant data", async () => {
    const [calls, orgs, billing] = await withRole(pool, { role: "anon" }, async (run) => [
      (await run("select id from public.calls")).rows,
      (await run("select id from public.organizations")).rows,
      (await run("select id from public.billing_accounts")).rows,
    ]);
    expect(calls).toHaveLength(0);
    expect(orgs).toHaveLength(0);
    expect(billing).toHaveLength(0);
  });

  // --- 10. service_role bypasses RLS — which is WHY app code must filter ----
  it("service_role bypasses RLS and sees all orgs (app code must filter organization_id)", async () => {
    // This is the invariant behind ADR 0002: the admin client bypasses RLS, so
    // server paths must always scope queries with .eq('organization_id', …).
    // App-side enforcement of that filter is covered by the server unit tests;
    // here we prove the bypass is real so the requirement is not hypothetical.
    const ids = await withRole(pool, { role: "service_role" }, (run) =>
      run("select id from public.calls where id in ($1, $2)", [f.callA, f.callB]).then((r) =>
        r.rows.map((row) => row.id)
      )
    );
    expect(ids).toEqual(expect.arrayContaining([f.callA, f.callB]));
  });
});
