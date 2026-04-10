import { parse } from "cookie";
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { Database } from '../../../supabase/types'
import type { AstroCookies } from 'astro'
import { requirePublicSupabaseConfig } from "./config"

function getRequestCookies(request: Request) {
  return Object.entries(parse(request.headers.get("cookie") ?? "")).map(([name, value]) => ({
    name,
    value: value ?? "",
  }));
}

export const createServerSupabaseClient = (request: Request, cookies: AstroCookies) => {
  const config = requirePublicSupabaseConfig({
    url: import.meta.env.SUPABASE_URL,
    fallbackUrl: import.meta.env.SUPABASE_DATABASE_URL,
    anonKey: import.meta.env.SUPABASE_ANON_KEY,
  })

  return createServerClient<Database>(
    config.url,
    config.anonKey,
    {
      cookies: {
        getAll() {
          return getRequestCookies(request)
        },
        setAll(cookieValues) {
          for (const { name, value, options } of cookieValues) {
            cookies.set(name, value, options as CookieOptions)
          }
        },
      },
    }
  )
}
