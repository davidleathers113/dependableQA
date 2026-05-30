// Repeatable seed for the Playwright/MCP reviewer-workflow e2e. Runs against the
// LOCAL Supabase stack only (postgres@127.0.0.1:54322) — never production.
//
// Creates: a confirmed reviewer user (email+password, via a bcrypt hash GoTrue
// accepts), an org + owner membership, and one call with a transcript, an open
// flag, and a review note. The call has no recording so the UI exercises its
// graceful "no recording" fallback (no audio fixture required).
//
// Usage: node tests/e2e/seed.mjs   (prints JSON with ids, login creds, URLs)
import { randomUUID } from "node:crypto";
import pg from "pg";

const DB_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const host = new URL(DB_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error(`Refusing to seed e2e data against non-local host "${host}".`);
}

const EMAIL = "reviewer@e2e.test";
const PASSWORD = "Passw0rd!e2e";

const ids = {
  org: randomUUID(),
  user: randomUUID(),
  call: randomUUID(),
  flag: randomUUID(),
  note: randomUUID(),
};

const segments = [
  { speaker: "Agent", start: 0, end: 4, text: "Thanks for calling DependableQA, how can I help?" },
  { speaker: "Customer", start: 5, end: 12, text: "I want pricing details for the enterprise plan." },
  { speaker: "Agent", start: 13, end: 20, text: "Happy to help with pricing — let me pull that up." },
];
const transcriptText = segments.map((s) => `${s.speaker}: ${s.text}`).join("\n");

const client = new pg.Client({ connectionString: DB_URL });

async function main() {
  await client.connect();
  // Clean slate (cascades clear org-scoped data and profiles/memberships).
  await client.query("truncate table public.organizations, public.processed_stripe_events, auth.users cascade");

  // Confirmed email/password user; trigger creates the profile.
  await client.query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, recovery_token, email_change_token_new, email_change
     ) values (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       extensions.crypt($3, extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       '{"first_name":"Rev","last_name":"Iewer"}'::jsonb, now(), now(),
       '', '', '', ''
     )`,
    [ids.user, EMAIL, PASSWORD]
  );

  await client.query(
    `insert into public.organizations (id, name, slug) values ($1, 'E2E QA Workspace', 'e2e-qa')`,
    [ids.org]
  );
  await client.query(
    `insert into public.organization_members (organization_id, user_id, role, invite_status)
     values ($1, $2, 'owner', 'accepted')`,
    [ids.org, ids.user]
  );
  await client.query(
    `insert into public.billing_accounts (organization_id, billing_email) values ($1, $2)`,
    [ids.org, EMAIL]
  );

  // Call with NO recording (exercises the graceful fallback), analysis completed.
  await client.query(
    `insert into public.calls
       (id, organization_id, caller_number, started_at, duration_seconds, source_provider,
        current_review_status, analysis_status)
     values ($1, $2, '+15555551234', now() - interval '1 hour', 142, 'custom', 'unreviewed', 'completed')`,
    [ids.call, ids.org]
  );
  await client.query(
    `insert into public.call_transcripts (organization_id, call_id, transcript_text, transcript_segments)
     values ($1, $2, $3, $4::jsonb)`,
    [ids.org, ids.call, transcriptText, JSON.stringify(segments)]
  );
  await client.query(
    `insert into public.call_flags
       (id, organization_id, call_id, flag_type, flag_category, severity, status, source, title, description, start_seconds, end_seconds)
     values ($1, $2, $3, 'compliance', 'disclosure', 'medium', 'open', 'ai', 'Missing disclosure',
             'Agent did not read the required disclosure.', 5, 12)`,
    [ids.flag, ids.org, ids.call]
  );
  await client.query(
    `insert into public.call_review_notes (id, organization_id, call_id, created_by, body, start_seconds, end_seconds)
     values ($1, $2, $3, $4, 'Follow up on the pricing request.', 5, 12)`,
    [ids.note, ids.org, ids.call, ids.user]
  );

  console.log(
    JSON.stringify(
      {
        login: { email: EMAIL, password: PASSWORD },
        ids,
        urls: {
          login: "http://localhost:4321/login",
          calls: "http://localhost:4321/app/calls",
          callDetail: `http://localhost:4321/app/calls/${ids.call}`,
          callDetailAtTime: `http://localhost:4321/app/calls/${ids.call}?t=6`,
          callDetailAtFlag: `http://localhost:4321/app/calls/${ids.call}?flag=${ids.flag}`,
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
