import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPool,
  isDatabaseAvailable,
  resolveTestDatabaseUrl,
  seedCoreFixtures,
  truncateAll,
  withServiceRoleClient,
  type SeededFixtures,
} from "./db-harness";

const dbUrl = resolveTestDatabaseUrl();
const available = await isDatabaseAvailable(dbUrl);

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    `[test:db] Skipping Stripe recharge tests — no local Postgres reachable at ${dbUrl}.`
  );
}

const RPC = "select public.apply_stripe_recharge_event($1,$2,$3,$4,$5,$6,$7) as applied";

describe.skipIf(!available)("apply_stripe_recharge_event (DB-level idempotency/concurrency)", () => {
  let pool: Pool;
  let f: SeededFixtures;

  beforeAll(async () => {
    pool = createPool(dbUrl);
    f = await seedCoreFixtures(pool);
  });

  beforeEach(async () => {
    // Clean slate for each test: no processed events, empty wallet ledger.
    await pool.query("truncate table public.processed_stripe_events");
    await pool.query("truncate table public.wallet_ledger_entries");
  });

  afterAll(async () => {
    if (pool) {
      await truncateAll(pool).catch(() => {});
      await pool.end();
    }
  });

  function rpcArgs(opts: {
    eventId: string;
    orgId?: string;
    accountId?: string;
    amount?: number;
    customer?: string;
    session?: string;
    type?: string;
  }) {
    return [
      opts.eventId,
      opts.type ?? "checkout.session.completed",
      opts.orgId ?? f.orgA,
      opts.accountId ?? f.billingAccountA,
      opts.amount ?? 5000,
      opts.customer ?? "cus_test",
      opts.session ?? "cs_test",
    ];
  }

  async function ledgerCount(orgId = f.orgA): Promise<number> {
    const { rows } = await pool.query(
      "select count(*)::int as n from public.wallet_ledger_entries where organization_id = $1",
      [orgId]
    );
    return rows[0]?.n ?? 0;
  }

  async function latestBalance(orgId = f.orgA): Promise<number | null> {
    const { rows } = await pool.query(
      `select balance_after_cents from public.wallet_ledger_entries
       where organization_id = $1 order by created_at desc, id desc limit 1`,
      [orgId]
    );
    return rows[0]?.balance_after_cents ?? null;
  }

  // --- 1. Same event id applied twice => true then false, one ledger row ----
  it("applies a recharge once and treats a duplicate event id as a no-op", async () => {
    const eventId = "evt_dup_1";
    const [first, second] = await withServiceRoleClient(pool, async (client) => {
      const r1 = await client.query(RPC, rpcArgs({ eventId, amount: 5000 }));
      const r2 = await client.query(RPC, rpcArgs({ eventId, amount: 5000 }));
      return [r1.rows[0].applied as boolean, r2.rows[0].applied as boolean];
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await ledgerCount()).toBe(1);
    expect(await latestBalance()).toBe(5000);
  });

  // --- 2. Concurrent same event id => exactly one credit --------------------
  it("credits only once when the same event id is applied concurrently", async () => {
    const eventId = "evt_concurrent_same";
    const c1: PoolClient = await pool.connect();
    const c2: PoolClient = await pool.connect();
    try {
      await c1.query("set role service_role");
      await c2.query("set role service_role");
      await c1.query("begin");
      await c2.query("begin");

      // c1 inserts the PK and completes its statement while its txn stays open.
      const r1 = await c1.query(RPC, rpcArgs({ eventId, amount: 5000 }));
      // c2 contends for the same PK and blocks until c1 resolves.
      const p2 = c2.query(RPC, rpcArgs({ eventId, amount: 5000 }));
      await c1.query("commit");
      const r2 = await p2;
      await c2.query("commit");

      const applied = [r1.rows[0].applied as boolean, r2.rows[0].applied as boolean];
      expect(applied.filter(Boolean)).toHaveLength(1);
      expect(applied.filter((v) => v === false)).toHaveLength(1);
    } finally {
      await c1.query("rollback").catch(() => {});
      await c2.query("rollback").catch(() => {});
      // Destroy rather than recycle: a backend that ran the RPC must not be
      // reused (see the image-segfault note in db-harness.ts).
      c1.release(true);
      c2.release(true);
    }
    expect(await ledgerCount()).toBe(1);
    expect(await latestBalance()).toBe(5000);
  });

  // --- 3. Concurrent different event ids => both apply, no lost update -------
  it("serializes concurrent distinct events so the running balance is correct", async () => {
    const c1: PoolClient = await pool.connect();
    const c2: PoolClient = await pool.connect();
    try {
      await c1.query("set role service_role");
      await c2.query("set role service_role");
      await c1.query("begin");
      await c2.query("begin");

      // c1 takes the FOR UPDATE lock on the billing account and stays open.
      const r1 = await c1.query(RPC, rpcArgs({ eventId: "evt_a", amount: 1000 }));
      // c2 has a different PK, so it proceeds to the FOR UPDATE and blocks on c1.
      const p2 = c2.query(RPC, rpcArgs({ eventId: "evt_b", amount: 2500 }));
      await c1.query("commit");
      const r2 = await p2;
      await c2.query("commit");

      expect(r1.rows[0].applied).toBe(true);
      expect(r2.rows[0].applied).toBe(true);
    } finally {
      await c1.query("rollback").catch(() => {});
      await c2.query("rollback").catch(() => {});
      // Destroy rather than recycle: a backend that ran the RPC must not be
      // reused (see the image-segfault note in db-harness.ts).
      c1.release(true);
      c2.release(true);
    }
    // No lost update: the second credit read the first's committed balance.
    expect(await ledgerCount()).toBe(2);
    expect(await latestBalance()).toBe(3500);
  });

  // --- 4. Billing account / organization mismatch => clean failure ----------
  it("raises when the billing account does not belong to the organization", async () => {
    await expect(
      withServiceRoleClient(pool, (client) =>
        client.query(RPC, rpcArgs({ eventId: "evt_mismatch", accountId: f.billingAccountB }))
      )
    ).rejects.toThrow("not found for organization");
  });

  // --- 5. A failed application leaves no processed event and no ledger row ---
  it("does not record a processed event when the transaction fails", async () => {
    await withServiceRoleClient(pool, async (client) => {
      await client
        .query(RPC, rpcArgs({ eventId: "evt_rollback", accountId: f.billingAccountB }))
        .catch(() => {});
    });
    const { rows: events } = await pool.query(
      "select count(*)::int as n from public.processed_stripe_events where stripe_event_id = $1",
      ["evt_rollback"]
    );
    expect(events[0]?.n).toBe(0);
    expect(await ledgerCount()).toBe(0);
  });

  // --- 6/7. Execute grants are service-role-only ----------------------------
  //
  // We assert the EXECUTE privilege directly (via has_function_privilege) rather
  // than invoking the function as anon/authenticated. That privilege is exactly
  // what the migration's `revoke ... from public, anon, authenticated` + `grant
  // ... to service_role` controls, so this is the precise invariant. It also
  // sidesteps a local-image crash: invoking this PL/pgSQL function as a role
  // that lacks EXECUTE segfaults the Supabase Postgres 17 image on the
  // permission-denied path — a path never reached in production, where only the
  // service-role admin client (which HAS execute) calls it.
  const SIGNATURE =
    "public.apply_stripe_recharge_event(text,text,uuid,uuid,integer,text,text)";

  it("does not grant EXECUTE to anon", async () => {
    const { rows } = await pool.query(
      "select has_function_privilege('anon', $1, 'EXECUTE') as can_execute",
      [SIGNATURE]
    );
    expect(rows[0]?.can_execute).toBe(false);
  });

  it("does not grant EXECUTE to authenticated", async () => {
    const { rows } = await pool.query(
      "select has_function_privilege('authenticated', $1, 'EXECUTE') as can_execute",
      [SIGNATURE]
    );
    expect(rows[0]?.can_execute).toBe(false);
  });

  it("grants EXECUTE to service_role and runs the happy path", async () => {
    const { rows } = await pool.query(
      "select has_function_privilege('service_role', $1, 'EXECUTE') as can_execute",
      [SIGNATURE]
    );
    expect(rows[0]?.can_execute).toBe(true);

    const applied = await withServiceRoleClient(pool, (client) =>
      client.query(RPC, rpcArgs({ eventId: "evt_service", amount: 7500 })).then((r) => r.rows[0].applied)
    );
    expect(applied).toBe(true);
    expect(await latestBalance()).toBe(7500);
  });
});
