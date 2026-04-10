import type { AstroGlobal } from "astro";
import { createServerSupabaseClient } from "../supabase/server-client";

export interface AppSession {
  user: { id: string; email: string };
  organization: { id: string; name: string; role: string };
}

/**
 * Resolves the current session and the user's active organization.
 * Redirects to /login if unauthenticated.
 * Redirects to onboarding if no organization membership is found.
 */
export async function requireAppSession(Astro: AstroGlobal): Promise<AppSession> {
  const supabase = createServerSupabaseClient(Astro.cookies);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw Astro.redirect("/login");
  }

  // Resolve active organization
  // In a real app, you might store the active org ID in a cookie or resolve the first one
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("role, organization:organizations(id, name)")
    .eq("user_id", session.user.id)
    .limit(1)
    .single();

  if (error || !membership) {
    // No organization found - redirect to onboarding/creation
    // For now, redirect to a placeholder or let the app handle it
    // throw Astro.redirect("/onboarding");
    // Returning a dummy for scaffold purposes if needed, but better to enforce
    throw Astro.redirect("/login?error=no_org");
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email!,
    },
    organization: {
      id: (membership.organization as any).id,
      name: (membership.organization as any).name,
      role: membership.role,
    },
  };
}
