import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSha256Hex } from "../../src/server/netlify-request";
import { createPool, isDatabaseAvailable, resolveTestDatabaseUrl, truncateAll } from "./db-harness";

const dbUrl = resolveTestDatabaseUrl();
const available = await isDatabaseAvailable(dbUrl);

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(`[test:db] Skipping Ringba ingest-key tests — no local Postgres at ${dbUrl}.`);
}

const KEY_A = "ringba_live_orga_secret";
const KEY_B = "ringba_live_orgb_secret";

describe.skipIf(!available)("Ringba ingest-key hashed lookup (migration 0014)", () => {
  let pool: Pool;
  const orgA = randomUUID();
  const orgB = randomUUID();

  beforeAll(async () => {
    pool = createPool(dbUrl);
    await truncateAll(pool);
    await pool.query(
      `insert into public.organizations (id, name, slug) values ($1,'Org A','ring-a'), ($2,'Org B','ring-b')`,
      [orgA, orgB]
    );
    await pool.query(
      `insert into public.integrations (organization_id, provider, display_name, config) values
         ($1, 'ringba', 'Ringba A', $2::jsonb),
         ($3, 'ringba', 'Ringba B', $4::jsonb),
         ($1, 'custom', 'Custom A', '{}'::jsonb)`,
      [
        orgA,
        JSON.stringify({ ringba: { publicIngestKey: KEY_A } }),
        orgB,
        JSON.stringify({ ringba: { publicIngestKey: KEY_B } }),
      ]
    );
  });

  afterAll(async () => {
    if (pool) {
      await truncateAll(pool).catch(() => {});
      await pool.end();
    }
  });

  async function lookup(key: string) {
    const { rows } = await pool.query(
      "select organization_id, display_name from public.integrations where provider = 'ringba' and public_ingest_key_hash = $1",
      [createSha256Hex(key)]
    );
    return rows;
  }

  it("the generated column equals the Node SHA-256 of the ingest key", async () => {
    const { rows } = await pool.query(
      "select public_ingest_key_hash from public.integrations where organization_id = $1 and provider = 'ringba'",
      [orgA]
    );
    expect(rows[0]?.public_ingest_key_hash).toBe(createSha256Hex(KEY_A));
  });

  it("resolves each key to exactly its own tenant's integration (no leakage)", async () => {
    const a = await lookup(KEY_A);
    expect(a).toHaveLength(1);
    expect(a[0]?.organization_id).toBe(orgA);

    const b = await lookup(KEY_B);
    expect(b).toHaveLength(1);
    expect(b[0]?.organization_id).toBe(orgB);
  });

  it("returns nothing for an unknown key", async () => {
    expect(await lookup("ringba_live_does_not_exist")).toHaveLength(0);
  });

  it("leaves the hash null for integrations without a ringba ingest key", async () => {
    const { rows } = await pool.query(
      "select public_ingest_key_hash from public.integrations where organization_id = $1 and provider = 'custom'",
      [orgA]
    );
    expect(rows[0]?.public_ingest_key_hash).toBeNull();
  });

  it("enforces uniqueness of the ingest-key hash across tenants", async () => {
    await expect(
      pool.query(
        `insert into public.integrations (organization_id, provider, display_name, config)
         values ($1, 'ringba', 'Dup', $2::jsonb)`,
        [orgB, JSON.stringify({ ringba: { publicIngestKey: KEY_A } })]
      )
    ).rejects.toThrow("idx_integrations_public_ingest_key_hash");
  });
});
