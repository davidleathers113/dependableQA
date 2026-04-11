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
  const env = typeof process !== "undefined" ? process.env : {};
  const config = requirePublicSupabaseConfig({
    url: env.SUPABASE_URL,
    fallbackUrl: env.SUPABASE_DATABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
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
