import Stripe from "stripe";
import { buildDependableQAStripeMetadata } from "./metadata";

export interface CreateDependableQAAutoRechargePaymentIntentInput {
  stripe: Stripe;
  secretKey: string;
  organizationId: string;
  billingAccountId: string;
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  currency?: string;
  confirm?: boolean;
  offSession?: boolean;
}

export async function createDependableQAAutoRechargePaymentIntent(
  input: CreateDependableQAAutoRechargePaymentIntentInput
) {
  return await input.stripe.paymentIntents.create({
    amount: input.amountCents,
    currency: input.currency ?? "usd",
    confirm: input.confirm ?? true,
    customer: input.customerId,
    payment_method: input.paymentMethodId,
    off_session: input.offSession ?? true,
    payment_method_types: ["card"],
    metadata: buildDependableQAStripeMetadata({
      secretKey: input.secretKey,
      organizationId: input.organizationId,
      billingAccountId: input.billingAccountId,
      flow: "payment_intent_auto_recharge",
    }),
  });
}
