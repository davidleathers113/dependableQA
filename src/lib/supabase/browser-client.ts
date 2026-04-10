import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_DATABASE_URL, SUPABASE_URL } from "astro:env/client";
import type { Database } from '../../../supabase/types';
import { requirePublicSupabaseConfig } from "./config";

let client: ReturnType<typeof createClient<Database>> | null = null;

export function getBrowserSupabase() {
  if (!client) {
    const config = requirePublicSupabaseConfig({
      url: SUPABASE_URL,
      fallbackUrl: SUPABASE_DATABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
    });

    client = createClient<Database>(
      config.url,
      config.anonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );
  }

  return client;
}
