/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_DATABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly STRIPE_SECRET_KEY: string;
  readonly STRIPE_WEBHOOK_SECRET: string;
  readonly STRIPE_PLATFORM_PRICE_ID: string;
  readonly APP_URL: string;
  readonly NETLIFY_SITE_URL: string;
  readonly DEFAULT_RECHARGE_THRESHOLD_CENTS: string;
  readonly DEFAULT_RECHARGE_AMOUNT_CENTS: string;
  readonly DEFAULT_PER_MINUTE_RATE_CENTS: string;
  readonly APP_ENCRYPTION_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Build-time constants injected by Vite `define` in astro.config.ts. They are
// textually inlined at build, so deployed code reports the exact commit/build
// it was built from (see /api/version). Absent in unit tests/dev (guard with
// `typeof`), where they resolve to "unknown".
declare const __APP_BUILD_SHA__: string;
declare const __APP_BUILD_TIME__: string;

declare namespace App {
  interface Locals {
    supabase: import("@supabase/supabase-js").SupabaseClient<import("../supabase/types").Database>;
    // The server-verified user (resolved once per request by the middleware via
    // supabase.auth.getUser(), which validates the JWT against the Auth server).
    // This is the trust anchor for protected server auth — never derive auth
    // decisions from an unverified getSession() cookie.
    user: import("@supabase/supabase-js").User | null;
  }
}
