import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDefaultOrganizationId, listUserOrganizations, getActiveOrganizationId, setActiveOrganizationId } =
  vi.hoisted(() => ({
    getDefaultOrganizationId: vi.fn(),
    listUserOrganizations: vi.fn(),
    getActiveOrganizationId: vi.fn(),
    setActiveOrganizationId: vi.fn(),
  }));

vi.mock("../app-data", () => ({ getDefaultOrganizationId, listUserOrganizations }));
vi.mock("./active-organization", () => ({ getActiveOrganizationId, setActiveOrganizationId }));

import { requireAppSession } from "./require-app-session";

const VERIFIED_USER = { id: "user_1", email: "owner@example.test" };

function astroWith(user: unknown) {
  const redirect = vi.fn((path: string) => ({ redirectedTo: path }));
  const cookies = { __cookies: true };
  return {
    astro: { locals: { user, supabase: { __client: true } }, cookies, redirect } as never,
    redirect,
    cookies,
  };
}

describe("requireAppSession", () => {
  beforeEach(() => {
    getDefaultOrganizationId.mockReset();
    listUserOrganizations.mockReset();
    getActiveOrganizationId.mockReset();
    setActiveOrganizationId.mockReset();
    getActiveOrganizationId.mockReturnValue(null);
  });

  it("redirects to /login when there is no verified user (e.g. revoked/expired)", async () => {
    const { astro, redirect } = astroWith(null);
    await expect(requireAppSession(astro)).rejects.toEqual({ redirectedTo: "/login" });
    expect(redirect).toHaveBeenCalledWith("/login");
    expect(getDefaultOrganizationId).not.toHaveBeenCalled();
  });

  it("redirects to /login when the user has no email", async () => {
    const { astro } = astroWith({ id: "user_1", email: null });
    await expect(requireAppSession(astro)).rejects.toEqual({ redirectedTo: "/login" });
  });

  it("redirects to /onboarding when the user has no organization", async () => {
    getDefaultOrganizationId.mockResolvedValue(null);
    const { astro } = astroWith(VERIFIED_USER);
    await expect(requireAppSession(astro)).rejects.toEqual({ redirectedTo: "/onboarding" });
  });

  it("redirects to /onboarding when the active org is not one the user belongs to", async () => {
    getDefaultOrganizationId.mockResolvedValue("org_other");
    listUserOrganizations.mockResolvedValue([{ id: "org_1", name: "Org One", role: "owner" }]);
    const { astro } = astroWith(VERIFIED_USER);
    await expect(requireAppSession(astro)).rejects.toEqual({ redirectedTo: "/onboarding" });
  });

  it("returns the session + active org for a member and persists the active org", async () => {
    getDefaultOrganizationId.mockResolvedValue("org_2");
    listUserOrganizations.mockResolvedValue([
      { id: "org_1", name: "Org One", role: "owner" },
      { id: "org_2", name: "Org Two", role: "reviewer" },
    ]);
    const { astro, cookies } = astroWith(VERIFIED_USER);

    const session = await requireAppSession(astro);

    expect(session).toEqual({
      user: { id: "user_1", email: "owner@example.test" },
      organization: { id: "org_2", name: "Org Two", role: "reviewer" },
    });
    expect(setActiveOrganizationId).toHaveBeenCalledWith(cookies, "org_2");
  });
});
