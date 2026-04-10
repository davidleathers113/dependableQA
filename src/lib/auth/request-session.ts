import type { APIContext, AstroCookies } from "astro";
import { getDefaultOrganizationId, listUserOrganizations } from "../app-data";
import { getActiveOrganizationId, setActiveOrganizationId } from "./active-organization";
import { createServerSupabaseClient } from "../supabase/server-client";

export interface RequestAppSession {
  user: { id: string; email: string };
  organization: { id: string; name: string; role: string };
}

export async function resolveRequestAppSession(cookies: AstroCookies): Promise<RequestAppSession | null> {
  const supabase = createServerSupabaseClient(cookies);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user.email) {
    return null;
  }

  const organizationId = await getDefaultOrganizationId(supabase, session.user.id, getActiveOrganizationId(cookies));
  if (!organizationId) {
    return null;
  }

  const memberships = await listUserOrganizations(supabase, session.user.id);
  const membership = memberships.find((item) => item.id === organizationId);
  if (!membership) {
    return null;
  }

  setActiveOrganizationId(cookies, organizationId);

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
    },
    organization: {
      id: membership.id,
      name: membership.name,
      role: membership.role,
    },
  };
}

export async function requireApiSession(context: APIContext) {
  const session = await resolveRequestAppSession(context.cookies);
  if (!session) {
    return null;
  }

  return session;
}
