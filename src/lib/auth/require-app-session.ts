import type { AstroGlobal } from "astro";
import { getDefaultOrganizationId, listUserOrganizations } from "../app-data";
import { getActiveOrganizationId, setActiveOrganizationId } from "./active-organization";
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
  const supabase = createServerSupabaseClient(Astro.request, Astro.cookies);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw Astro.redirect("/login");
  }

  const activeOrganizationId = await getDefaultOrganizationId(
    supabase,
    session.user.id,
    getActiveOrganizationId(Astro.cookies)
  );

  if (!activeOrganizationId) {
    throw Astro.redirect("/onboarding");
  }

  setActiveOrganizationId(Astro.cookies, activeOrganizationId);

  const organizations = await listUserOrganizations(supabase, session.user.id);
  const membership = organizations.find((organization) => organization.id === activeOrganizationId);

  if (!membership) {
    throw Astro.redirect("/onboarding");
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email!,
    },
    organization: {
      id: membership.id,
      name: membership.name,
      role: membership.role,
    },
  };
}
