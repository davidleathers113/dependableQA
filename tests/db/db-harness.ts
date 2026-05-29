import { randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

/**
 * Shared harness for DB-level tests (RLS tenant isolation + Stripe
 * idempotency/concurrency). These tests run against a *local* Postgres — the
 * Supabase CLI stack (`supabase start`) — and NEVER against production.
 *
 * Two safety rails:
 *  - `assertLocalDatabase` refuses any non-local host, so a stray
 *    `TEST_DATABASE_URL`/`SUPABASE_DB_URL` pointing at a remote project cannot
 *    be truncated by these tests.
 *  - `isDatabaseAvailable` lets the suites skip cleanly when no local database
 *    is reachable, so the default test run / CI (which has no Postgres) is
 *    unaffected. DB tests are run on demand with `npm run test:db`.
 */

const DEFAULT_LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Disable JIT on test connections — harmless for these tiny queries and one
// fewer variable in the local image. (Note: the real cause of the crash
// described below was NOT JIT.)
//
// The local Supabase Postgres 17 image segfaults (signal 11) when a pooled
// backend is reused to re-invoke a PL/pgSQL function over the extended/
// parameterized protocol *after that function raised an exception* on the same
// backend (corrupted cached plan). This is an image bug, not a defect in the
// migration or app logic — in production each Stripe webhook uses a fresh
// connection and the mismatch RAISE is an exceptional path. The harness avoids
// it by destroying (never reusing) any connection that ran an RPC: see the
// `release(true)` calls in withRole/withServiceRoleClient.
const CONNECTION_OPTIONS = "-c jit=off";

export function resolveTestDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.SUPABASE_DB_URL ??
    DEFAULT_LOCAL_DB_URL
  );
}

/** Throws unless the URL clearly points at a local/throwaway database. */
export function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname;
  const localHosts = ["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"];
  if (!localHosts.includes(host)) {
    throw new Error(
      `Refusing to run DB tests against non-local host "${host}". ` +
        "These tests truncate tables and must only target a local Supabase/Postgres stack."
    );
  }
}

export async function isDatabaseAvailable(url: string): Promise<boolean> {
  try {
    assertLocalDatabase(url);
  } catch {
    return false;
  }
  const probe = new Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 2_000,
    options: CONNECTION_OPTIONS,
  });
  try {
    await probe.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

export function createPool(url = resolveTestDatabaseUrl()): Pool {
  assertLocalDatabase(url);
  return new Pool({ connectionString: url, max: 8, options: CONNECTION_OPTIONS });
}

export type DbRole = "anon" | "authenticated" | "service_role";

export type RoleRunner = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) => Promise<QueryResult<T>>;

/**
 * Runs `fn` inside a transaction acting as the given Postgres role with the
 * given auth.uid() (via `request.jwt.claims`). The transaction is always rolled
 * back, so per-test mutations never leak into other tests. RLS applies because
 * `authenticated`/`anon` are not BYPASSRLS roles (only `service_role` is).
 */
export async function withRole<T>(
  pool: Pool,
  options: { role: DbRole; userId?: string },
  fn: (run: RoleRunner) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const claims =
      options.userId != null
        ? JSON.stringify({ sub: options.userId, role: options.role })
        : JSON.stringify({ role: options.role });
    // Set claims as superuser (before switching role) so auth.uid() resolves.
    await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    // `role` is a constrained union (never user input); set role cannot be
    // parameterized, so interpolation here is safe.
    await client.query(`set local role ${options.role}`);
    return await fn((text, params) => client.query(text, params));
  } finally {
    await client.query("rollback").catch(() => {});
    // Destroy rather than recycle: a backend that executed an RPC must never be
    // reused (see CONNECTION_OPTIONS note on the image segfault).
    client.release(true);
  }
}

/**
 * Acquires a dedicated connection already switched to `service_role` for the
 * lifetime of the callback (used by the concurrency tests, which need two
 * overlapping transactions that COMMIT). The caller controls begin/commit.
 */
export async function withServiceRoleClient<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("set role service_role");
    return await fn(client);
  } finally {
    await client.query("reset role").catch(() => {});
    // Destroy rather than recycle (see CONNECTION_OPTIONS note on the segfault).
    client.release(true);
  }
}

export interface SeededFixtures {
  orgA: string;
  orgB: string;
  ownerA: string;
  reviewerA: string;
  analystA: string;
  billingA: string;
  ownerB: string;
  billingAccountA: string;
  billingAccountB: string;
  integrationA: string;
  integrationB: string;
  callA: string;
  callB: string;
  flagA: string;
  flagB: string;
  noteA: string;
  noteB: string;
  aiJobA: string;
  stripeEventSeed: string;
}

const SEED_TABLES = [
  "public.organizations",
  "public.processed_stripe_events",
  "auth.users",
];

/** Removes all rows the harness creates (cascades clear org-scoped tables). */
export async function truncateAll(pool: Pool): Promise<void> {
  // No RESTART IDENTITY: cascading into auth.* would try to restart sequences
  // owned by supabase_auth_admin (not postgres). Plain truncate is sufficient.
  await pool.query(`truncate table ${SEED_TABLES.join(", ")} cascade`);
}

async function insertUser(pool: Pool, id: string, email: string): Promise<void> {
  // Insert directly into auth.users; the on_auth_user_created trigger creates
  // the matching public.profiles row. Empty-string tokens keep local GoTrue
  // happy without going through a real signup.
  await pool.query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change
     ) values (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
       '', '', '', ''
     )`,
    [id, email]
  );
}

/**
 * Seeds two organizations with members across roles plus tenant-owned records
 * (billing, integrations, calls, flags, notes, an AI job, a processed Stripe
 * event). Returns all generated ids. Idempotent: truncates first.
 */
export async function seedCoreFixtures(pool: Pool): Promise<SeededFixtures> {
  await truncateAll(pool);

  const f: SeededFixtures = {
    orgA: randomUUID(),
    orgB: randomUUID(),
    ownerA: randomUUID(),
    reviewerA: randomUUID(),
    analystA: randomUUID(),
    billingA: randomUUID(),
    ownerB: randomUUID(),
    billingAccountA: randomUUID(),
    billingAccountB: randomUUID(),
    integrationA: randomUUID(),
    integrationB: randomUUID(),
    callA: randomUUID(),
    callB: randomUUID(),
    flagA: randomUUID(),
    flagB: randomUUID(),
    noteA: randomUUID(),
    noteB: randomUUID(),
    aiJobA: randomUUID(),
    stripeEventSeed: `evt_seed_${randomUUID()}`,
  };

  await pool.query(
    `insert into public.organizations (id, name, slug) values ($1, 'Org A', 'org-a'), ($2, 'Org B', 'org-b')`,
    [f.orgA, f.orgB]
  );

  await insertUser(pool, f.ownerA, "owner-a@example.test");
  await insertUser(pool, f.reviewerA, "reviewer-a@example.test");
  await insertUser(pool, f.analystA, "analyst-a@example.test");
  await insertUser(pool, f.billingA, "billing-a@example.test");
  await insertUser(pool, f.ownerB, "owner-b@example.test");

  await pool.query(
    `insert into public.organization_members (organization_id, user_id, role, invite_status) values
       ($1, $2, 'owner', 'accepted'),
       ($1, $3, 'reviewer', 'accepted'),
       ($1, $4, 'analyst', 'accepted'),
       ($1, $5, 'billing', 'accepted'),
       ($6, $7, 'owner', 'accepted')`,
    [f.orgA, f.ownerA, f.reviewerA, f.analystA, f.billingA, f.orgB, f.ownerB]
  );

  await pool.query(
    `insert into public.billing_accounts (id, organization_id) values ($1, $2), ($3, $4)`,
    [f.billingAccountA, f.orgA, f.billingAccountB, f.orgB]
  );

  await pool.query(
    `insert into public.integrations (id, organization_id, provider, display_name) values
       ($1, $2, 'custom', 'Integration A'),
       ($3, $4, 'custom', 'Integration B')`,
    [f.integrationA, f.orgA, f.integrationB, f.orgB]
  );

  await pool.query(
    `insert into public.calls (id, organization_id, caller_number, started_at, source_provider) values
       ($1, $2, '+15555550001', now(), 'custom'),
       ($3, $4, '+15555550002', now(), 'custom')`,
    [f.callA, f.orgA, f.callB, f.orgB]
  );

  await pool.query(
    `insert into public.call_flags
       (id, organization_id, call_id, flag_type, flag_category, severity, source, title) values
       ($1, $2, $3, 'compliance', 'disclosure', 'medium', 'manual', 'Flag A'),
       ($4, $5, $6, 'compliance', 'disclosure', 'medium', 'manual', 'Flag B')`,
    [f.flagA, f.orgA, f.callA, f.flagB, f.orgB, f.callB]
  );

  await pool.query(
    `insert into public.call_review_notes
       (id, organization_id, call_id, created_by, body, start_seconds) values
       ($1, $2, $3, $4, 'Reviewer note for org A', 0),
       ($5, $6, $7, $8, 'Owner note for org B', 0)`,
    [f.noteA, f.orgA, f.callA, f.reviewerA, f.noteB, f.orgB, f.callB, f.ownerB]
  );

  await pool.query(
    `insert into public.ai_jobs (id, organization_id, call_id, job_type, status, dedupe_key) values
       ($1, $2, $3, 'transcription', 'queued', 'seed-dedupe-a')`,
    [f.aiJobA, f.orgA, f.callA]
  );

  await pool.query(
    `insert into public.processed_stripe_events (stripe_event_id, event_type) values ($1, 'checkout.session.completed')`,
    [f.stripeEventSeed]
  );

  return f;
}
