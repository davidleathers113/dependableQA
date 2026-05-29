import type { AstroGlobal } from "astro";
import { getDefaultOrganizationId, listUserOrganizations } from "../app-data";
import { getActiveOrganizationId, setActiveOrganizationId } from "./active-organization";

export interface AppSession {
  user: { id: string; email: string };
  organization: { id: string; name: string; role: string };
}

/**
 * Resolves the current session and the user's active organization for an app
 * page. The user identity comes from `Astro.locals.user`, which the middleware
 * resolved with `supabase.auth.getUser()` (server-verified against the Auth
 * server) — this never trusts an unverified cookie session.
 *
 * Redirects to /login if unauthenticated, or /onboarding if there's no
 * organization membership for the active organization.
 */
export async function requireAppSession(Astro: AstroGlobal): Promise<AppSession> {
  const user = Astro.locals.user;
  const supabase = Astro.locals.supabase;

  if (!user?.email) {
    throw Astro.redirect("/login");
  }

  const activeOrganizationId = await getDefaultOrganizationId(
    supabase,
    user.id,
    getActiveOrganizationId(Astro.cookies)
  );

  if (!activeOrganizationId) {
    throw Astro.redirect("/onboarding");
  }

  setActiveOrganizationId(Astro.cookies, activeOrganizationId);

  const organizations = await listUserOrganizations(supabase, user.id);
  const membership = organizations.find((organization) => organization.id === activeOrganizationId);

  if (!membership) {
    throw Astro.redirect("/onboarding");
  }

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    organization: {
      id: membership.id,
      name: membership.name,
      role: membership.role,
    },
  };
}
