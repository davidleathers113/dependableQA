import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPool,
  isDatabaseAvailable,
  resolveTestDatabaseUrl,
  seedCoreFixtures,
  truncateAll,
  withRole,
  withServiceRoleClient,
  type SeededFixtures,
} from "./db-harness";

const dbUrl = resolveTestDatabaseUrl();
const available = await isDatabaseAvailable(dbUrl);

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(`[test:db] Skipping wallet-reservation tests — no local Postgres reachable at ${dbUrl}.`);
}

const RESERVE = "select public.reserve_calls_for_processing($1,$2,$3::jsonb) as reserved";
const RELEASE = "select public.release_call_processing_hold($1,$2) as released";
const SWEEP = "select public.sweep_expired_processing_holds() as swept";
const DEBIT = "select public.apply_call_processing_debit($1,$2,$3,$4) as applied";

describe.skipIf(!available)("reserve_calls_for_processing (wallet holds, migration 0018)", () => {
  let pool: Pool;
  let f: SeededFixtures;
  // A second org-A call so batch / concurrency tests don't collide on one id.
  let callA2: string;

  beforeAll(async () => {
    pool = createPool(dbUrl);
    f = await seedCoreFixtures(pool);
    callA2 = randomUUID();
    await pool.query(
      `insert into public.calls (id, organization_id, caller_number, started_at, source_provider)
       values ($1, $2, '+15555550003', now(), 'custom')`,
      [callA2, f.orgA]
    );
  });

  beforeEach(async () => {
    await pool.query("truncate table public.wallet_processing_holds");
    await pool.query("truncate table public.wallet_ledger_entries");
  });

  afterAll(async () => {
    if (pool) {
      await truncateAll(pool).catch(() => {});
      await pool.end();
    }
  });

  async function seedBalance(cents: number) {
    await pool.query(
      `insert into public.wallet_ledger_entries
         (organization_id, billing_account_id, entry_type, amount_cents, balance_after_cents, reference_type)
       values ($1, $2, 'recharge', $3, $3, 'seed')`,
      [f.orgA, f.billingAccountA, cents]
    );
  }

  function callsJson(items: Array<[string, number]>): string {
    return JSON.stringify(items.map(([call_id, amount_cents]) => ({ call_id, amount_cents })));
  }

  async function openHolds(orgId = f.orgA) {
    const { rows } = await pool.query(
      `select call_id, amount_cents, status from public.wallet_processing_holds
       where organization_id = $1 and status = 'open'`,
      [orgId]
    );
    return rows;
  }

  async function holdStatus(callId: string): Promise<string | null> {
    const { rows } = await pool.query(
      `select status from public.wallet_processing_holds where call_id = $1`,
      [callId]
    );
    return rows[0]?.status ?? null;
  }

  it("reserves when the balance covers the batch and inserts one open hold per call", async () => {
    await seedBalance(1000);
    await withServiceRoleClient(pool, async (client) => {
      const r = await client.query(RESERVE, [
        f.orgA,
        f.billingAccountA,
        callsJson([[f.callA, 200], [callA2, 300]]),
      ]);
      expect(r.rows[0].reserved).toBe(true);
    });
    expect(await openHolds()).toHaveLength(2);
  });

  it("refuses (inserts nothing) when the balance can't cover the batch", async () => {
    await seedBalance(100);
    await withServiceRoleClient(pool, async (client) => {
      const r = await client.query(RESERVE, [f.orgA, f.billingAccountA, callsJson([[f.callA, 200]])]);
      expect(r.rows[0].reserved).toBe(false);
    });
    expect(await openHolds()).toHaveLength(0);
  });

  it("is idempotent: re-reserving an already-held call needs no new funds", async () => {
    await seedBalance(200);
    await withServiceRoleClient(pool, async (client) => {
      expect((await client.query(RESERVE, [f.orgA, f.billingAccountA, callsJson([[f.callA, 200]])])).rows[0].reserved).toBe(
        true
      );
      // Available is now 0, but the call is already covered by its open hold → true, no duplicate.
      expect((await client.query(RESERVE, [f.orgA, f.billingAccountA, callsJson([[f.callA, 200]])])).rows[0].reserved).toBe(
        true
      );
    });
    expect(await openHolds()).toHaveLength(1);
  });

  it("two concurrent reservations cannot jointly exceed the balance", async () => {
    await seedBalance(200); // covers exactly ONE 200¢ reservation
    const c1: PoolClient = await pool.connect();
    const c2: PoolClient = await pool.connect();
    try {
      await c1.query("set role service_role");
      await c2.query("set role service_role");
      await c1.query("begin");
      await c2.query("begin");

      // c1 takes the FOR UPDATE lock on the billing account and holds it open.
      const r1 = await c1.query(RESERVE, [f.orgA, f.billingAccountA, callsJson([[f.callA, 200]])]);
      // c2 blocks on the same lock until c1 commits, then sees the open hold.
      const p2 = c2.query(RESERVE, [f.orgA, f.billingAccountA, callsJson([[callA2, 200]])]);
      await c1.query("commit");
      const r2 = await p2;
      await c2.query("commit");

      const reserved = [r1.rows[0].reserved as boolean, r2.rows[0].reserved as boolean];
      expect(reserved.filter(Boolean)).toHaveLength(1); // exactly one wins
      expect(reserved.filter((v) => v === false)).toHaveLength(1);
    } finally {
      await c1.query("rollback").catch(() => {});
      await c2.query("rollback").catch(() => {});
      c1.release(true);
      c2.release(true);
    }
    expect(await openHolds()).toHaveLength(1);
  });

  it("a debit settles the matching open hold", async () => {
    await seedBalance(1000);
    await withServiceRoleClient(pool, async (client) => {
      await client.query(RESERVE, [f.orgA, f.billingAccountA, callsJson([[f.callA, 200]])]);
      const debit = await client.query(DEBIT, [f.orgA, f.billingAccountA, f.callA, 200]);
      expect(debit.rows[0].applied).toBe(true);
    });
    expect(await holdStatus(f.callA)).toBe("settled");
  });

  it("release frees an open hold, returning its funds to available", async () => {
    await seedBalance(200);
    await withServiceRoleClient(pool, async (client) => {
      await client.query(RESERVE, [f.orgA, f.billingAccountA, callsJson([[f.callA, 200]])]);
      // Available is now 0 → a second 200¢ reservation fails.
      expect((await client.query(RESERVE, [f.orgA, f.billingAccountA, callsJson([[callA2, 200]])])).rows[0].reserved).toBe(
        false
      );
      // Release the first → available is 200 again.
      expect((await client.query(RELEASE, [f.orgA, f.callA])).rows[0].released).toBe(true);
      expect((await client.query(RESERVE, [f.orgA, f.billingAccountA, callsJson([[callA2, 200]])])).rows[0].reserved).toBe(
        true
      );
    });
    expect(await holdStatus(f.callA)).toBe("released");
    expect(await holdStatus(callA2)).toBe("open");
  });

  it("sweep releases only expired open holds", async () => {
    await pool.query(
      `insert into public.wallet_processing_holds
         (organization_id, billing_account_id, call_id, amount_cents, status, expires_at)
       values ($1, $2, $3, 100, 'open', now() - interval '1 minute'),
              ($1, $2, $4, 100, 'open', now() + interval '1 hour')`,
      [f.orgA, f.billingAccountA, f.callA, callA2]
    );
    let swept = -1;
    await withServiceRoleClient(pool, async (client) => {
      swept = Number((await client.query(SWEEP)).rows[0].swept);
    });
    expect(swept).toBe(1);
    expect(await holdStatus(f.callA)).toBe("released"); // expired
    expect(await holdStatus(callA2)).toBe("open"); // still fresh
  });

  it("grants EXECUTE only to service_role", async () => {
    const fns = [
      "public.reserve_calls_for_processing(uuid,uuid,jsonb)",
      "public.release_call_processing_hold(uuid,uuid)",
      "public.sweep_expired_processing_holds()",
    ];
    await withRole(pool, { role: "service_role" }, async (run) => {
      for (const fn of fns) {
        const { rows } = await run<{ can: boolean }>(
          "select has_function_privilege('service_role', $1, 'execute') as can",
          [fn]
        );
        expect(rows[0].can).toBe(true);
      }
    });
    for (const role of ["anon", "authenticated"] as const) {
      await withRole(pool, { role }, async (run) => {
        for (const fn of fns) {
          const { rows } = await run<{ can: boolean }>(
            "select has_function_privilege($1, $2, 'execute') as can",
            [role, fn]
          );
          expect(rows[0].can).toBe(false);
        }
      });
    }
  });
});
