import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '../../../supabase/types'

export const createBrowserSupabaseClient = () =>
  createBrowserClient<Database>(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  )
