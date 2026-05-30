import type { Pool } from "pg";
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
  console.warn(`[test:db] Skipping AI-spend debit tests — no local Postgres reachable at ${dbUrl}.`);
}

const DEBIT = "select public.apply_call_processing_debit($1,$2,$3,$4) as applied";

describe.skipIf(!available)("apply_call_processing_debit (DB-level metering)", () => {
  let pool: Pool;
  let f: SeededFixtures;

  beforeAll(async () => {
    pool = createPool(dbUrl);
    f = await seedCoreFixtures(pool);
  });

  beforeEach(async () => {
    await pool.query("truncate table public.wallet_ledger_entries");
  });

  afterAll(async () => {
    if (pool) {
      await truncateAll(pool).catch(() => {});
      await pool.end();
    }
  });

  async function seedBalance(cents: number, orgId = f.orgA, accountId = f.billingAccountA) {
    await pool.query(
      `insert into public.wallet_ledger_entries
         (organization_id, billing_account_id, entry_type, amount_cents, balance_after_cents, reference_type)
       values ($1, $2, 'recharge', $3, $3, 'seed')`,
      [orgId, accountId, cents]
    );
  }

  async function balance(orgId = f.orgA): Promise<number> {
    const { rows } = await pool.query(
      `select balance_after_cents from public.wallet_ledger_entries
       where organization_id = $1 order by seq desc limit 1`,
      [orgId]
    );
    return rows[0] ? Number(rows[0].balance_after_cents) : 0;
  }

  async function debitCount(callId: string): Promise<number> {
    const { rows } = await pool.query(
      `select count(*)::int as n from public.wallet_ledger_entries
       where reference_type = 'call_processing' and reference_id = $1`,
      [callId]
    );
    return Number(rows[0].n);
  }

  it("debits once, then is idempotent for the same call", async () => {
    await seedBalance(1000);

    await withServiceRoleClient(pool, async (client) => {
      const first = await client.query(DEBIT, [f.orgA, f.billingAccountA, f.callA, 200]);
      expect(first.rows[0].applied).toBe(true);

      const second = await client.query(DEBIT, [f.orgA, f.billingAccountA, f.callA, 200]);
      expect(second.rows[0].applied).toBe(false); // already debited this call
    });

    expect(await balance()).toBe(800);
    expect(await debitCount(f.callA)).toBe(1);
  });

  it("never drives the balance negative (clamps to available)", async () => {
    await seedBalance(30);

    await withServiceRoleClient(pool, async (client) => {
      const res = await client.query(DEBIT, [f.orgA, f.billingAccountA, f.callA, 100]);
      expect(res.rows[0].applied).toBe(true);
    });

    expect(await balance()).toBe(0);
    const { rows } = await pool.query(
      `select amount_cents from public.wallet_ledger_entries
       where reference_type = 'call_processing' and reference_id = $1`,
      [f.callA]
    );
    expect(Number(rows[0].amount_cents)).toBe(30); // clamped from 100 to available 30
  });

  it("ignores a non-positive amount", async () => {
    await seedBalance(500);
    await withServiceRoleClient(pool, async (client) => {
      const res = await client.query(DEBIT, [f.orgA, f.billingAccountA, f.callA, 0]);
      expect(res.rows[0].applied).toBe(false);
    });
    expect(await balance()).toBe(500);
  });

  it("fails cleanly on a billing-account/organization mismatch", async () => {
    await seedBalance(1000);
    await expect(
      withServiceRoleClient(pool, async (client) => {
        // billingAccountB does not belong to orgA.
        await client.query(DEBIT, [f.orgA, f.billingAccountB, f.callA, 100]);
      })
    ).rejects.toThrow();
    expect(await balance()).toBe(1000); // no partial state
  });

  it("derives the current balance deterministically by seq when created_at ties (0017)", async () => {
    // Two rows with the SAME created_at but different running balances. The
    // later-inserted (higher seq) row — balance 700 — is authoritative; ordering
    // by created_at alone would be ambiguous (could pick 1000).
    const ts = "2026-05-30T00:00:00.000Z";
    await pool.query(
      `insert into public.wallet_ledger_entries
         (organization_id, billing_account_id, entry_type, amount_cents, balance_after_cents, reference_type, created_at)
       values ($1,$2,'recharge',1000,1000,'seed',$3),
              ($1,$2,'debit',300,700,'seed',$3)`,
      [f.orgA, f.billingAccountA, ts]
    );

    await withServiceRoleClient(pool, async (client) => {
      const res = await client.query(DEBIT, [f.orgA, f.billingAccountA, f.callA, 200]);
      expect(res.rows[0].applied).toBe(true);
    });

    // Debited from 700 (seq-latest) -> 500; NOT from 1000 (which would give 800).
    expect(await balance()).toBe(500);
  });

  it("grants EXECUTE only to service_role", async () => {
    await withRole(pool, { role: "service_role" }, async (run) => {
      const { rows } = await run<{ can: boolean }>(
        "select has_function_privilege('service_role', 'public.apply_call_processing_debit(uuid,uuid,uuid,integer)', 'execute') as can"
      );
      expect(rows[0].can).toBe(true);
    });

    for (const role of ["anon", "authenticated"] as const) {
      await withRole(pool, { role }, async (run) => {
        const { rows } = await run<{ can: boolean }>(
          "select has_function_privilege($1, 'public.apply_call_processing_debit(uuid,uuid,uuid,integer)', 'execute') as can",
          [role]
        );
        expect(rows[0].can).toBe(false);
      });
    }
  });
});
