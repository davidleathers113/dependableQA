import type { AstroCookies } from "astro";

export const ACTIVE_ORGANIZATION_COOKIE = "dq_active_org";

export function getActiveOrganizationId(cookies: AstroCookies) {
  return cookies.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;
}

export function setActiveOrganizationId(cookies: AstroCookies, organizationId: string) {
  const isProduction = typeof process !== "undefined" && process.env.NODE_ENV === "production";
  cookies.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 60 * 60 * 24 * 30,
  });
}
