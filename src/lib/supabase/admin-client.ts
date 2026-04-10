import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../supabase/types';
import { requireAdminSupabaseConfig } from "./config";

export function getAdminSupabase() {
  const config = requireAdminSupabaseConfig({
    url: import.meta.env.SUPABASE_URL,
    fallbackUrl: import.meta.env.SUPABASE_DATABASE_URL,
    serviceRoleKey: import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
