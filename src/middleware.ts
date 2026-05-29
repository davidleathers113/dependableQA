import { defineMiddleware } from "astro:middleware";
import { createServerSupabaseClient } from "./lib/supabase/server-client";

export async function handleAppRequest(
  context: Parameters<Parameters<typeof defineMiddleware>[0]>[0],
  next: Parameters<Parameters<typeof defineMiddleware>[0]>[1]
) {
  const supabase = createServerSupabaseClient(context.request, context.cookies);

  // getUser() validates the JWT against the Supabase Auth server on every
  // request — so revoked, deleted, or expired users are rejected. getSession()
  // only decodes the cookie and must NOT be used as a server trust anchor. This
  // is the single verification point; downstream resolvers trust locals.user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  context.locals.supabase = supabase;
  context.locals.user = user;

  // Auth guard for /app routes.
  if (context.url.pathname.startsWith("/app") && !user) {
    return context.redirect("/login");
  }

  return next();
}

export const onRequest = defineMiddleware(handleAppRequest);
