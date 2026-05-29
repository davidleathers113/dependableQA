import Stripe from "stripe";
import { getAdminSupabase } from "../../src/lib/supabase/admin-client";
import { insertAuditLog } from "../../src/lib/app-data";
import { syncBillingAccountPaymentMethodByCustomerId } from "../../src/lib/stripe/payment-method-sync";
import { getDependableQAStripeMetadataContext } from "../../src/lib/stripe/metadata";
import { getHeaderValue, parseNetlifyRequestBody } from "../../src/server/netlify-request";

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function metadataValue(metadata: Record<string, string> | null | undefined, key: string) {
  return metadata?.[key] ?? "";
}

function getCustomerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if ("id" in value && typeof value.id === "string") {
    return value.id;
  }

  return "";
}

async function getBillingAccountByCustomerId(admin: ReturnType<typeof getAdminSupabase>, customerId: string) {
  const result = await admin
    .from("billing_accounts")
    .select("id, organization_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ?? null;
}

async function resolveDependableQAAttribution(input: {
  admin: ReturnType<typeof getAdminSupabase>;
  metadata: Record<string, string> | null | undefined;
  customerId?: string;
}) {
  const context = getDependableQAStripeMetadataContext(input.metadata);
  if (context.isDependableQA && context.organizationId && context.billingAccountId) {
    return {
      organizationId: context.organizationId,
      billingAccountId: context.billingAccountId,
      flow: context.flow,
      source: "metadata" as const,
    };
  }

  if (input.customerId) {
    const account = await getBillingAccountByCustomerId(input.admin, input.customerId);
    if (account) {
      return {
        organizationId: String(account.organization_id),
        billingAccountId: String(account.id),
        flow: context.flow,
        source: "customer" as const,
      };
    }
  }

  return {
    organizationId: "",
    billingAccountId: "",
    flow: context.flow,
    source: "none" as const,
  };
}

export async function handler(event: {
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
}) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return json(500, { error: "Stripe webhook configuration is missing." });
  }

  const stripe = new Stripe(secretKey);
  const signature = getHeaderValue(event.headers, "stripe-signature");
  if (!signature) {
    return json(400, { error: "Missing Stripe signature." });
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      parseNetlifyRequestBody(event.body, event.isBase64Encoded),
      signature,
      webhookSecret
    );
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Invalid Stripe payload." });
  }

  const admin = getAdminSupabase();

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object as Stripe.Checkout.Session;
    const amountCents = session.amount_total ?? 0;
    const customerId = getCustomerId(session.customer);
    const attribution = await resolveDependableQAAttribution({
      admin,
      metadata: session.metadata,
      customerId,
    });
    const organizationId = attribution.organizationId;
    const billingAccountId = attribution.billingAccountId;

    if (organizationId && billingAccountId && amountCents > 0) {
      // Apply the wallet credit through a single transactional, idempotent RPC.
      // The processed_stripe_events PK makes duplicate deliveries a no-op, and a
      // `for update` lock on the billing account serializes concurrent recharges,
      // so the read-compute-insert of the running balance cannot race.
      const rechargeResult = await admin.rpc("apply_stripe_recharge_event", {
        p_stripe_event_id: stripeEvent.id,
        p_event_type: stripeEvent.type,
        p_organization_id: organizationId,
        p_billing_account_id: billingAccountId,
        p_amount_cents: amountCents,
        p_customer_id: customerId || "",
        p_checkout_session_id: session.id,
      });

      if (rechargeResult.error) {
        // Surface a 5xx so Stripe retries; the idempotency guard makes retries safe.
        return json(500, { error: rechargeResult.error.message });
      }

      // `true` => newly applied; `false` => duplicate delivery already credited.
      if (rechargeResult.data === true) {
        await insertAuditLog(admin, {
          organizationId,
          actorUserId: null,
          entityType: "billing_account",
          entityId: billingAccountId,
          action: "billing.recharge.completed",
          metadata: {
            summary: `Applied ${amountCents} cents from Stripe checkout.`,
            stripeEventId: stripeEvent.id,
            stripeFlow: attribution.flow || metadataValue(session.metadata, "flow"),
          },
        });
      }
    }

    if (customerId) {
      await syncBillingAccountPaymentMethodByCustomerId({
        admin,
        stripe,
        customerId,
        auditAction: "billing.payment_method.updated",
        stripeEventId: stripeEvent.id,
      });
    }
  }

  if (stripeEvent.type === "payment_intent.succeeded") {
    const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
    const customerId = getCustomerId(paymentIntent.customer);
    const attribution = await resolveDependableQAAttribution({
      admin,
      metadata: paymentIntent.metadata,
      customerId,
    });

    if (attribution.organizationId && attribution.billingAccountId && attribution.flow === "payment_intent_auto_recharge") {
      await admin
        .from("billing_accounts")
        .update({
          last_successful_charge_at: new Date().toISOString(),
          stripe_customer_id: customerId || null,
        })
        .eq("id", attribution.billingAccountId);

      await insertAuditLog(admin, {
        organizationId: attribution.organizationId,
        actorUserId: null,
        entityType: "billing_account",
        entityId: attribution.billingAccountId,
        action: "billing.auto_recharge.succeeded",
        metadata: {
          summary: `Auto-recharge payment intent succeeded for ${paymentIntent.amount} cents.`,
          amountCents: paymentIntent.amount,
          stripeEventId: stripeEvent.id,
          stripePaymentIntentId: paymentIntent.id,
        },
      });
    }

    if (customerId) {
      await syncBillingAccountPaymentMethodByCustomerId({
        admin,
        stripe,
        customerId,
        auditAction: "billing.payment_method.updated",
        stripeEventId: stripeEvent.id,
      });
    }
  }

  if (stripeEvent.type === "payment_intent.payment_failed") {
    const paymentIntent = stripeEvent.data.object as Stripe.PaymentIntent;
    const customerId = getCustomerId(paymentIntent.customer);
    const attribution = await resolveDependableQAAttribution({
      admin,
      metadata: paymentIntent.metadata,
      customerId,
    });

    if (attribution.organizationId && attribution.billingAccountId && attribution.flow === "payment_intent_auto_recharge") {
      await insertAuditLog(admin, {
        organizationId: attribution.organizationId,
        actorUserId: null,
        entityType: "billing_account",
        entityId: attribution.billingAccountId,
        action: "billing.auto_recharge.failed",
        metadata: {
          summary: `Auto-recharge payment intent failed for ${paymentIntent.amount} cents.`,
          amountCents: paymentIntent.amount,
          stripeEventId: stripeEvent.id,
          stripePaymentIntentId: paymentIntent.id,
        },
      });
    }
  }

  if (stripeEvent.type === "customer.subscription.updated" || stripeEvent.type === "customer.subscription.created") {
    const subscription = stripeEvent.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

    await admin
      .from("billing_accounts")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
      })
      .eq("stripe_customer_id", customerId);

    await syncBillingAccountPaymentMethodByCustomerId({
      admin,
      stripe,
      customerId,
      stripeEventId: stripeEvent.id,
    });
  }

  if (stripeEvent.type === "payment_method.attached" || stripeEvent.type === "payment_method.updated") {
    const paymentMethod = stripeEvent.data.object as Stripe.PaymentMethod;
    const customerId = getCustomerId(paymentMethod.customer);
    if (customerId) {
      await syncBillingAccountPaymentMethodByCustomerId({
        admin,
        stripe,
        customerId,
        auditAction: "billing.payment_method.updated",
        stripeEventId: stripeEvent.id,
      });
    }
  }

  if (stripeEvent.type === "payment_method.detached") {
    const paymentMethod = stripeEvent.data.object as Stripe.PaymentMethod;
    const customerId = getCustomerId(paymentMethod.customer);
    if (customerId) {
      await syncBillingAccountPaymentMethodByCustomerId({
        admin,
        stripe,
        customerId,
        auditAction: "billing.payment_method.removed",
        stripeEventId: stripeEvent.id,
      });
    }
  }

  if (stripeEvent.type === "customer.updated") {
    const customer = stripeEvent.data.object as Stripe.Customer;
    if (!customer.deleted) {
      await syncBillingAccountPaymentMethodByCustomerId({
        admin,
        stripe,
        customerId: customer.id,
        auditAction: "billing.payment_method.updated",
        stripeEventId: stripeEvent.id,
      });
    }
  }

  if (stripeEvent.type === "setup_intent.succeeded") {
    const setupIntent = stripeEvent.data.object as Stripe.SetupIntent;
    const customerId = getCustomerId(setupIntent.customer);
    if (customerId) {
      await syncBillingAccountPaymentMethodByCustomerId({
        admin,
        stripe,
        customerId,
        auditAction: "billing.payment_method.updated",
        stripeEventId: stripeEvent.id,
      });
    }
  }

  if (stripeEvent.type === "invoice.payment_failed") {
    const invoice = stripeEvent.data.object as Stripe.Invoice;
    const customerId = getCustomerId(invoice.customer);
    if (customerId) {
      await syncBillingAccountPaymentMethodByCustomerId({
        admin,
        stripe,
        customerId,
        preferredStatus: "attention",
        auditAction: "billing.payment_method.requires_attention",
        stripeEventId: stripeEvent.id,
      });
    }
  }

  return json(200, { received: true });
}
