import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../supabase/types';
import { requireAdminSupabaseConfig } from "./config";

export function getAdminSupabase() {
  const config = requireAdminSupabaseConfig({
    url: process.env.SUPABASE_URL,
    fallbackUrl: process.env.SUPABASE_DATABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
