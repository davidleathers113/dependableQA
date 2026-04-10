import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { Database } from '../../../supabase/types'
import type { AstroCookies } from 'astro'
import { requirePublicSupabaseConfig } from "./config"

export const createServerSupabaseClient = (cookies: AstroCookies) => {
  const config = requirePublicSupabaseConfig({
    url: process.env.SUPABASE_URL,
    fallbackUrl: process.env.SUPABASE_DATABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  })

  return createServerClient<Database>(
    config.url,
    config.anonKey,
    {
      cookies: {
        get(key: string) {
          return cookies.get(key)?.value
        },
        set(key: string, value: string, options: CookieOptions) {
          cookies.set(key, value, options)
        },
        remove(key: string, options: CookieOptions) {
          cookies.delete(key, options)
        },
      },
    }
  )
}
