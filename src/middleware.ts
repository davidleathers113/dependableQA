import { defineMiddleware } from "astro:middleware";
import { createServerSupabaseClient } from "./lib/supabase/server-client";

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createServerSupabaseClient(context.cookies);

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
});
