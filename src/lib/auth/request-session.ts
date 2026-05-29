import type { APIContext } from "astro";
import { getDefaultOrganizationId, listUserOrganizations } from "../app-data";
import { getActiveOrganizationId, setActiveOrganizationId } from "./active-organization";

export interface RequestAppSession {
  user: { id: string; email: string };
  organization: { id: string; name: string; role: string };
}

/**
 * Resolves the authenticated session + active organization for an API route.
 * The user identity comes from `context.locals.user`, which the middleware
 * resolved with `supabase.auth.getUser()` (server-verified). Returns null when
 * the request is unauthenticated or has no membership in the active org, so a
 * revoked/deleted user (getUser → null) cannot reach protected data.
 */
export async function resolveRequestAppSession(
  context: APIContext
): Promise<RequestAppSession | null> {
  const user = context.locals.user;
  const supabase = context.locals.supabase;

  if (!user?.email) {
    return null;
  }

  const organizationId = await getDefaultOrganizationId(
    supabase,
    user.id,
    getActiveOrganizationId(context.cookies)
  );
  if (!organizationId) {
    return null;
  }

  const memberships = await listUserOrganizations(supabase, user.id);
  const membership = memberships.find((item) => item.id === organizationId);
  if (!membership) {
    return null;
  }

  setActiveOrganizationId(context.cookies, organizationId);

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

export async function requireApiSession(context: APIContext) {
  return resolveRequestAppSession(context);
}
