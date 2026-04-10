import { defineMiddleware } from "astro:middleware";
import { createServerSupabaseClient } from "./lib/supabase/server-client";

export async function handleAppRequest(
  context: Parameters<Parameters<typeof defineMiddleware>[0]>[0],
  next: Parameters<Parameters<typeof defineMiddleware>[0]>[1]
) {
  const supabase = createServerSupabaseClient(context.request, context.cookies);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  context.locals.supabase = supabase;
  context.locals.session = session;
  context.locals.user = session?.user ?? null;

  // Simple auth guard for /app routes
  if (context.url.pathname.startsWith("/app") && !session) {
    return context.redirect("/login");
  }

  return next();
}

export const onRequest = defineMiddleware(handleAppRequest);
