import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_DATABASE_URL, SUPABASE_URL } from "astro:env/client";
import type { Database } from "../../supabase/types";
import { resolvePublicSupabaseConfig } from "../lib/supabase/config";

const config = resolvePublicSupabaseConfig({
  url: SUPABASE_URL,
  fallbackUrl: SUPABASE_DATABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
});

export const supabase =
  config
    ? createClient<Database>(config.url, config.anonKey)
    : null;
