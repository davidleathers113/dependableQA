import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../supabase/types';
import { requireAdminSupabaseConfig } from "./config";

export function getAdminSupabase() {
  const env = typeof process !== "undefined" ? process.env : {};
  const config = requireAdminSupabaseConfig({
    url: env.SUPABASE_URL,
    fallbackUrl: env.SUPABASE_DATABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
