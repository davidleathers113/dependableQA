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

import { requireApiSession, resolveRequestAppSession } from "./request-session";

const VERIFIED_USER = { id: "user_1", email: "member@example.test" };

function contextWith(user: unknown) {
  const cookies = { __cookies: true };
  return {
    context: { locals: { user, supabase: { __client: true } }, cookies } as never,
    cookies,
  };
}

describe("resolveRequestAppSession / requireApiSession", () => {
  beforeEach(() => {
    getDefaultOrganizationId.mockReset();
    listUserOrganizations.mockReset();
    getActiveOrganizationId.mockReset();
    setActiveOrganizationId.mockReset();
    getActiveOrganizationId.mockReturnValue(null);
  });

  it("returns null when there is no verified user", async () => {
    const { context } = contextWith(null);
    expect(await requireApiSession(context)).toBeNull();
    expect(getDefaultOrganizationId).not.toHaveBeenCalled();
  });

  it("returns null when the verified user has no email", async () => {
    const { context } = contextWith({ id: "user_1", email: null });
    expect(await requireApiSession(context)).toBeNull();
  });

  it("returns null when the user has no organization", async () => {
    getDefaultOrganizationId.mockResolvedValue(null);
    const { context } = contextWith(VERIFIED_USER);
    expect(await requireApiSession(context)).toBeNull();
  });

  it("returns null when the active org is not one the user belongs to", async () => {
    getDefaultOrganizationId.mockResolvedValue("org_other");
    listUserOrganizations.mockResolvedValue([{ id: "org_1", name: "Org One", role: "owner" }]);
    const { context } = contextWith(VERIFIED_USER);
    expect(await requireApiSession(context)).toBeNull();
  });

  it("resolves the active org when the user belongs to multiple orgs", async () => {
    getDefaultOrganizationId.mockResolvedValue("org_2");
    listUserOrganizations.mockResolvedValue([
      { id: "org_1", name: "Org One", role: "owner" },
      { id: "org_2", name: "Org Two", role: "analyst" },
    ]);
    const { context, cookies } = contextWith(VERIFIED_USER);

    const session = await resolveRequestAppSession(context);

    expect(session).toEqual({
      user: { id: "user_1", email: "member@example.test" },
      organization: { id: "org_2", name: "Org Two", role: "analyst" },
    });
    expect(setActiveOrganizationId).toHaveBeenCalledWith(cookies, "org_2");
  });
});
