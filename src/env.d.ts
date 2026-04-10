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

declare namespace App {
  interface Locals {
    supabase: import("@supabase/supabase-js").SupabaseClient<import("../supabase/types").Database>;
    session: import("@supabase/supabase-js").Session | null;
    user: import("@supabase/supabase-js").User | null;
  }
}
