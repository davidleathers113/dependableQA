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
  console.warn(`[test:db] Skipping organization onboarding tests — no local Postgres at ${dbUrl}.`);
}

const RPC_SIGNATURE = "public.create_organization_with_owner(text)";

describe.skipIf(!available)("organization onboarding (migration 0011)", () => {
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

  it("blocks an authenticated user from inserting an organization directly", async () => {
    // The permissive WITH CHECK (true) insert policy was removed; with no insert
    // policy for `authenticated`, a direct insert is denied by RLS.
    await expect(
      withRole(pool, { role: "authenticated", userId: f.ownerA }, (run) =>
        run("insert into public.organizations (name, slug) values ('Rogue Org', 'rogue-org')")
      )
    ).rejects.toThrow("row-level security policy");
  });

  it("blocks anon from inserting an organization directly", async () => {
    await expect(
      withRole(pool, { role: "anon" }, (run) =>
        run("insert into public.organizations (name, slug) values ('Anon Org', 'anon-org')")
      )
    ).rejects.toThrow();
  });

  it("create_organization_with_owner creates the org and an owner membership for the caller", async () => {
    await withRole(pool, { role: "authenticated", userId: f.ownerB }, async (run) => {
      const created = await run("select id, name, slug from public.create_organization_with_owner($1)", [
        "Acme QA Workspace",
      ]);
      const org = created.rows[0];
      expect(org?.slug).toBe("acme-qa-workspace");

      // Visible to the caller because they are now a member.
      const membership = await run(
        "select role, invite_status from public.organization_members where organization_id = $1 and user_id = $2",
        [org.id, f.ownerB]
      );
      expect(membership.rows[0]?.role).toBe("owner");
      expect(membership.rows[0]?.invite_status).toBe("accepted");
    });
  });

  it("create_organization_with_owner rejects an empty name", async () => {
    await expect(
      withRole(pool, { role: "authenticated", userId: f.ownerB }, (run) =>
        run("select public.create_organization_with_owner($1)", ["   "])
      )
    ).rejects.toThrow("organization name is required");
  });

  it("grants EXECUTE on the onboarding RPC to authenticated but not anon", async () => {
    const { rows: anonRows } = await pool.query(
      "select has_function_privilege('anon', $1, 'EXECUTE') as can_execute",
      [RPC_SIGNATURE]
    );
    expect(anonRows[0]?.can_execute).toBe(false);

    const { rows: authRows } = await pool.query(
      "select has_function_privilege('authenticated', $1, 'EXECUTE') as can_execute",
      [RPC_SIGNATURE]
    );
    expect(authRows[0]?.can_execute).toBe(true);
  });
});
