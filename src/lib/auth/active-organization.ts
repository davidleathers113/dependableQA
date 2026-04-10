import type { AstroCookies } from "astro";

export const ACTIVE_ORGANIZATION_COOKIE = "dq_active_org";

export function getActiveOrganizationId(cookies: AstroCookies) {
  return cookies.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;
}

export function setActiveOrganizationId(cookies: AstroCookies, organizationId: string) {
  cookies.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 30,
  });
}
