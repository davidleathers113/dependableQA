import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, isDatabaseAvailable, resolveTestDatabaseUrl } from "./db-harness";

const dbUrl = resolveTestDatabaseUrl();
const available = await isDatabaseAvailable(dbUrl);

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(`[test:db] Skipping function hardening tests — no local Postgres at ${dbUrl}.`);
}

describe.skipIf(!available)("function security hardening (migration 0013)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createPool(dbUrl);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  async function proconfig(name: string): Promise<string> {
    const { rows } = await pool.query(
      `select coalesce(array_to_string(p.proconfig, ','), '') as cfg
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = $1`,
      [name]
    );
    return rows[0]?.cfg ?? "";
  }

  async function canExecute(role: string, signature: string): Promise<boolean> {
    const { rows } = await pool.query(
      "select has_function_privilege($1, $2, 'EXECUTE') as ok",
      [role, signature]
    );
    return rows[0]?.ok === true;
  }

  it("pins search_path on the previously-mutable functions", async () => {
    for (const fn of ["set_updated_at", "sync_call_flag_summary", "apply_stripe_recharge_event"]) {
      expect(await proconfig(fn)).toContain("search_path");
    }
  });

  it("handle_new_user is not executable by anon or authenticated", async () => {
    expect(await canExecute("anon", "public.handle_new_user()")).toBe(false);
    expect(await canExecute("authenticated", "public.handle_new_user()")).toBe(false);
  });

  it("RLS helper functions are executable by authenticated but not anon", async () => {
    expect(await canExecute("anon", "public.is_org_member(uuid)")).toBe(false);
    expect(await canExecute("authenticated", "public.is_org_member(uuid)")).toBe(true);

    const hasOrgRole = "public.has_org_role(uuid, public.organization_role[])";
    expect(await canExecute("anon", hasOrgRole)).toBe(false);
    expect(await canExecute("authenticated", hasOrgRole)).toBe(true);
  });

  it("apply_stripe_recharge_event remains service-role-only", async () => {
    const sig = "public.apply_stripe_recharge_event(text,text,uuid,uuid,integer,text,text)";
    expect(await canExecute("anon", sig)).toBe(false);
    expect(await canExecute("authenticated", sig)).toBe(false);
    expect(await canExecute("service_role", sig)).toBe(true);
  });
});
