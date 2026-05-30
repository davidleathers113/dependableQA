import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_DATABASE_URL, SUPABASE_URL } from "astro:env/client";
import type { Database } from '../../../supabase/types';
import { requirePublicSupabaseConfig } from "./config";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Browser-side Supabase client. Uses `@supabase/ssr`'s `createBrowserClient`,
 * which reads/writes the auth session from the SAME cookie that the server
 * client (`createServerSupabaseClient`) manages. A plain `createClient` would
 * default to localStorage and never see the cookie session, so every
 * client-side query would run as `anon` and be denied by RLS (PGRST116 / 406).
 */
export function getBrowserSupabase() {
  if (!client) {
    const config = requirePublicSupabaseConfig({
      url: SUPABASE_URL,
      fallbackUrl: SUPABASE_DATABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
    });

    client = createBrowserClient<Database>(config.url, config.anonKey);
  }

  return client;
}
