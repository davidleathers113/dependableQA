import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  constructEventMock,
  syncBillingAccountPaymentMethodByCustomerId,
  getAdminSupabase,
  getHeaderValue,
  parseNetlifyRequestBody,
} = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  syncBillingAccountPaymentMethodByCustomerId: vi.fn(),
  getAdminSupabase: vi.fn(),
  getHeaderValue: vi.fn(),
  parseNetlifyRequestBody: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = {
      constructEvent: constructEventMock,
    };
  },
}));

vi.mock("../../src/lib/supabase/admin-client", () => ({
  getAdminSupabase,
}));

vi.mock("../../src/lib/stripe/payment-method-sync", () => ({
  syncBillingAccountPaymentMethodByCustomerId,
}));

vi.mock("../../src/lib/app-data", () => ({
  insertAuditLog: vi.fn(),
}));

vi.mock("../../src/server/netlify-request", () => ({
  getHeaderValue,
  parseNetlifyRequestBody,
}));

import { handler } from "./stripe-webhook";

describe("stripe webhook", () => {
  beforeEach(() => {
    constructEventMock.mockReset();
    syncBillingAccountPaymentMethodByCustomerId.mockReset();
    getAdminSupabase.mockReset();
    getHeaderValue.mockReset();
    parseNetlifyRequestBody.mockReset();

    getAdminSupabase.mockReturnValue({});
    getHeaderValue.mockReturnValue("sig_test");
    parseNetlifyRequestBody.mockReturnValue("{}");
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("syncs payment method updates when Stripe reports a changed card", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_pm_updated",
      type: "payment_method.updated",
      data: {
        object: {
          customer: "cus_123",
        },
      },
    });

    const response = await handler({
      httpMethod: "POST",
      body: "{}",
      headers: {
        "stripe-signature": "sig_test",
      },
    });

    expect(syncBillingAccountPaymentMethodByCustomerId).toHaveBeenCalledWith({
      admin: {},
      stripe: expect.any(Object),
      customerId: "cus_123",
      auditAction: "billing.payment_method.updated",
      stripeEventId: "evt_pm_updated",
    });
    expect(response.statusCode).toBe(200);
  });

  it("marks the payment method as attention-required after invoice failures", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_invoice_failed",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_456",
        },
      },
    });

    const response = await handler({
      httpMethod: "POST",
      body: "{}",
      headers: {
        "stripe-signature": "sig_test",
      },
    });

    expect(syncBillingAccountPaymentMethodByCustomerId).toHaveBeenCalledWith({
      admin: {},
      stripe: expect.any(Object),
      customerId: "cus_456",
      preferredStatus: "attention",
      auditAction: "billing.payment_method.requires_attention",
      stripeEventId: "evt_invoice_failed",
    });
    expect(response.statusCode).toBe(200);
  });
});
