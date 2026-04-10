interface PublicSupabaseConfigInput {
  url?: string | null;
  fallbackUrl?: string | null;
  anonKey?: string | null;
}

interface AdminSupabaseConfigInput {
  url?: string | null;
  fallbackUrl?: string | null;
  serviceRoleKey?: string | null;
}

export interface PublicSupabaseConfig {
  url: string;
  anonKey: string;
}

export interface AdminSupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

function valueOrEmpty(value?: string | null) {
  return value?.trim() ?? "";
}

function resolveSupabaseUrl(url?: string | null, fallbackUrl?: string | null) {
  return valueOrEmpty(url) || valueOrEmpty(fallbackUrl);
}

export function resolvePublicSupabaseConfig(
  input: PublicSupabaseConfigInput
): PublicSupabaseConfig | null {
  const url = resolveSupabaseUrl(input.url, input.fallbackUrl);
  const anonKey = valueOrEmpty(input.anonKey);

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function requirePublicSupabaseConfig(
  input: PublicSupabaseConfigInput
): PublicSupabaseConfig {
  const config = resolvePublicSupabaseConfig(input);

  if (!config) {
    throw new Error(
      "Missing Supabase client configuration. Set SUPABASE_URL and SUPABASE_ANON_KEY, or provide SUPABASE_DATABASE_URL as the URL fallback."
    );
  }

  return config;
}

export function requireAdminSupabaseConfig(
  input: AdminSupabaseConfigInput
): AdminSupabaseConfig {
  const url = resolveSupabaseUrl(input.url, input.fallbackUrl);
  const serviceRoleKey = valueOrEmpty(input.serviceRoleKey);

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or provide SUPABASE_DATABASE_URL as the URL fallback."
    );
  }

  return { url, serviceRoleKey };
}
