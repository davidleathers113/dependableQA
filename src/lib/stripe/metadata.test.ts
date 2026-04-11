import { describe, expect, it } from "vitest";
import {
  buildDependableQAStripeMetadata,
  getDependableQAStripeEnvironment,
  getDependableQAStripeMetadataContext,
} from "./metadata";

describe("DependableQA Stripe metadata", () => {
  it("builds the standardized metadata contract for live mode objects", () => {
    const metadata = buildDependableQAStripeMetadata({
      secretKey: "sk_live_123",
      organizationId: "org_123",
      billingAccountId: "bill_123",
      flow: "checkout_funding",
    });

    expect(metadata).toEqual({
      app: "dependableQA",
      source: "dependableQA",
      environment: "live",
      organizationId: "org_123",
      billingAccountId: "bill_123",
      flow: "checkout_funding",
    });
  });

  it("recognizes DependableQA-owned metadata in webhook payloads", () => {
    const context = getDependableQAStripeMetadataContext({
      app: "dependableQA",
      source: "dependableQA",
      environment: "test",
      organizationId: "org_456",
      billingAccountId: "bill_456",
      flow: "payment_intent_auto_recharge",
    });

    expect(context.isDependableQA).toBe(true);
    expect(context.organizationId).toBe("org_456");
    expect(context.billingAccountId).toBe("bill_456");
    expect(context.flow).toBe("payment_intent_auto_recharge");
  });

  it("derives test mode from non-live secret keys", () => {
    expect(getDependableQAStripeEnvironment("sk_test_123")).toBe("test");
  });
});
