import { describe, expect, it } from "vitest";
import { canManageBilling, getBillingReturnUrl } from "./billing-routes";

describe("getBillingReturnUrl", () => {
  it("returns the /app/billing path on the request origin", () => {
    const url = getBillingReturnUrl("https://dependableqa.com/api/billing/portal");
    expect(url).toBe("https://dependableqa.com/app/billing");
  });

  it("preserves a non-default port", () => {
    const url = getBillingReturnUrl("http://localhost:8888/api/billing/fund-checkout");
    expect(url).toBe("http://localhost:8888/app/billing");
  });
});

describe("canManageBilling", () => {
  it("allows owner, admin, and billing roles", () => {
    expect(canManageBilling("owner")).toBe(true);
    expect(canManageBilling("admin")).toBe(true);
    expect(canManageBilling("billing")).toBe(true);
  });

  it("rejects roles without billing authority", () => {
    expect(canManageBilling("reviewer")).toBe(false);
    expect(canManageBilling("analyst")).toBe(false);
    expect(canManageBilling("")).toBe(false);
  });
});
