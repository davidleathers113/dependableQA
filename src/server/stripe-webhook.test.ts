import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  constructEventMock,
  syncBillingAccountPaymentMethodByCustomerId,
  getAdminSupabase,
  getHeaderValue,
  parseNetlifyRequestBody,
  insertAuditLog,
} = vi.hoisted(() => ({
  constructEventMock: vi.fn(),
  syncBillingAccountPaymentMethodByCustomerId: vi.fn(),
  getAdminSupabase: vi.fn(),
  getHeaderValue: vi.fn(),
  parseNetlifyRequestBody: vi.fn(),
  insertAuditLog: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    webhooks = {
      constructEvent: constructEventMock,
    };
  },
}));

vi.mock("../lib/supabase/admin-client", () => ({
  getAdminSupabase,
}));

vi.mock("../lib/stripe/payment-method-sync", () => ({
  syncBillingAccountPaymentMethodByCustomerId,
}));

vi.mock("../lib/app-data", () => ({
  insertAuditLog,
}));

vi.mock("./netlify-request", () => ({
  getHeaderValue,
  parseNetlifyRequestBody,
}));

import { handler } from "../../netlify/functions/stripe-webhook";

describe("stripe webhook", () => {
  beforeEach(() => {
    constructEventMock.mockReset();
    syncBillingAccountPaymentMethodByCustomerId.mockReset();
    getAdminSupabase.mockReset();
    getHeaderValue.mockReset();
    parseNetlifyRequestBody.mockReset();
    insertAuditLog.mockReset();

    getAdminSupabase.mockReturnValue({
      rpc: vi.fn(async () => ({ data: true, error: null })),
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
        insert: vi.fn(async () => ({ error: null })),
      })),
    });
    getHeaderValue.mockReturnValue("sig_test");
    parseNetlifyRequestBody.mockReturnValue("{}");
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  });

  it("syncs payment method updates when Stripe reports a changed card", async () => {
    const admin = getAdminSupabase();
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
      admin,
      stripe: expect.any(Object),
      customerId: "cus_123",
      auditAction: "billing.payment_method.updated",
      stripeEventId: "evt_pm_updated",
    });
    expect(response.statusCode).toBe(200);
  });

  it("marks the payment method as attention-required after invoice failures", async () => {
    const admin = getAdminSupabase();
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
      admin,
      stripe: expect.any(Object),
      customerId: "cus_456",
      preferredStatus: "attention",
      auditAction: "billing.payment_method.requires_attention",
      stripeEventId: "evt_invoice_failed",
    });
    expect(response.statusCode).toBe(200);
  });

  it("records DependableQA auto-recharge payment intent successes from metadata", async () => {
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "billing_accounts") {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(async () => ({ error: null })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        };
      }),
    };
    getAdminSupabase.mockReturnValue(admin);
    constructEventMock.mockReturnValue({
      id: "evt_pi_succeeded",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_123",
          amount: 5000,
          customer: "cus_789",
          metadata: {
            app: "dependableQA",
            source: "dependableQA",
            environment: "test",
            organizationId: "org_789",
            billingAccountId: "bill_789",
            flow: "payment_intent_auto_recharge",
          },
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

    expect(insertAuditLog).toHaveBeenCalledWith(admin, {
      organizationId: "org_789",
      actorUserId: null,
      entityType: "billing_account",
      entityId: "bill_789",
      action: "billing.auto_recharge.succeeded",
      metadata: {
        summary: "Auto-recharge payment intent succeeded for 5000 cents.",
        amountCents: 5000,
        stripeEventId: "evt_pi_succeeded",
        stripePaymentIntentId: "pi_123",
      },
    });
    expect(syncBillingAccountPaymentMethodByCustomerId).toHaveBeenCalledWith({
      admin,
      stripe: expect.any(Object),
      customerId: "cus_789",
      auditAction: "billing.payment_method.updated",
      stripeEventId: "evt_pi_succeeded",
    });
    expect(response.statusCode).toBe(200);
  });

  function checkoutSessionEvent() {
    return {
      id: "evt_checkout_completed",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          amount_total: 5000,
          customer: "cus_chk",
          metadata: {
            app: "dependableQA",
            source: "dependableQA",
            environment: "test",
            organizationId: "org_chk",
            billingAccountId: "bill_chk",
            flow: "checkout_funding",
          },
        },
      },
    };
  }

  it("applies a wallet credit once via the idempotent RPC and audits the first delivery", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const admin = { rpc, from: vi.fn(() => ({})) };
    getAdminSupabase.mockReturnValue(admin);
    constructEventMock.mockReturnValue(checkoutSessionEvent());

    const response = await handler({
      httpMethod: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig_test" },
    });

    expect(rpc).toHaveBeenCalledWith("apply_stripe_recharge_event", {
      p_stripe_event_id: "evt_checkout_completed",
      p_event_type: "checkout.session.completed",
      p_organization_id: "org_chk",
      p_billing_account_id: "bill_chk",
      p_amount_cents: 5000,
      p_customer_id: "cus_chk",
      p_checkout_session_id: "cs_test_123",
    });
    expect(insertAuditLog).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: "billing.recharge.completed", entityId: "bill_chk" })
    );
    expect(response.statusCode).toBe(200);
  });

  it("does not re-credit or re-audit a duplicate checkout.session.completed delivery", async () => {
    // RPC returns false => the event was already processed (duplicate delivery).
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    const admin = { rpc, from: vi.fn(() => ({})) };
    getAdminSupabase.mockReturnValue(admin);
    constructEventMock.mockReturnValue(checkoutSessionEvent());

    const response = await handler({
      httpMethod: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig_test" },
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(insertAuditLog).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
  });

  it("returns 500 and writes no audit when the recharge RPC errors", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "deadlock detected" } }));
    const admin = { rpc, from: vi.fn(() => ({})) };
    getAdminSupabase.mockReturnValue(admin);
    constructEventMock.mockReturnValue(checkoutSessionEvent());

    const response = await handler({
      httpMethod: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig_test" },
    });

    expect(response.statusCode).toBe(500);
    expect(insertAuditLog).not.toHaveBeenCalled();
  });

  it("rejects an invalid Stripe signature with 400 and applies nothing", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const admin = { rpc, from: vi.fn(() => ({})) };
    getAdminSupabase.mockReturnValue(admin);
    constructEventMock.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload.");
    });

    const response = await handler({
      httpMethod: "POST",
      body: "{}",
      headers: { "stripe-signature": "bad_sig" },
    });

    expect(response.statusCode).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(insertAuditLog).not.toHaveBeenCalled();
  });
});
