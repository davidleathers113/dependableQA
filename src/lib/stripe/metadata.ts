export type DependableQAStripeEnvironment = "live" | "test";
export type DependableQAStripeFlow =
  | "customer"
  | "checkout_setup"
  | "checkout_funding"
  | "payment_intent_auto_recharge";

export interface DependableQAStripeMetadataInput {
  secretKey: string;
  organizationId: string;
  billingAccountId: string;
  flow: DependableQAStripeFlow;
}

export interface DependableQAStripeMetadataContext {
  isDependableQA: boolean;
  app: string;
  source: string;
  environment: string;
  organizationId: string;
  billingAccountId: string;
  flow: string;
}

export function getDependableQAStripeEnvironment(secretKey: string): DependableQAStripeEnvironment {
  return secretKey.startsWith("sk_live_") ? "live" : "test";
}

export function buildDependableQAStripeMetadata(
  input: DependableQAStripeMetadataInput
): Record<string, string> {
  return {
    app: "dependableQA",
    source: "dependableQA",
    environment: getDependableQAStripeEnvironment(input.secretKey),
    organizationId: input.organizationId,
    billingAccountId: input.billingAccountId,
    flow: input.flow,
  };
}

export function getDependableQAStripeMetadataContext(
  metadata: Record<string, string> | null | undefined
): DependableQAStripeMetadataContext {
  const app = metadata?.app ?? "";
  const source = metadata?.source ?? "";
  const organizationId = metadata?.organizationId ?? "";
  const billingAccountId = metadata?.billingAccountId ?? "";
  const environment = metadata?.environment ?? "";
  const flow = metadata?.flow ?? "";
  const isDependableQA = app === "dependableQA" || source === "dependableQA";

  return {
    isDependableQA,
    app,
    source,
    environment,
    organizationId,
    billingAccountId,
    flow,
  };
}
