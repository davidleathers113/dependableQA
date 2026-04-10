import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../supabase/types';

let client: ReturnType<typeof createClient<Database>> | null = null;

export function getBrowserSupabase() {
  if (!client) {
    client = createClient<Database>(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
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
