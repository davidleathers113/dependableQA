import Stripe from "stripe";
import { getAdminSupabase } from "../../src/lib/supabase/admin-client";
import { insertAuditLog } from "../../src/lib/app-data";

function json(statusCode: number, body: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function parseBody(body: string | null | undefined, isBase64Encoded?: boolean) {
  if (!body) {
    return "";
  }

  if (isBase64Encoded) {
    return Buffer.from(body, "base64").toString("utf8");
  }

  return body;
}

function metadataValue(metadata: Record<string, string> | null | undefined, key: string) {
  return metadata?.[key] ?? "";
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
  const signature = event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"];
  if (!signature) {
    return json(400, { error: "Missing Stripe signature." });
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(parseBody(event.body, event.isBase64Encoded), signature, webhookSecret);
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Invalid Stripe payload." });
  }

  const admin = getAdminSupabase();

  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object as Stripe.Checkout.Session;
    const organizationId = metadataValue(session.metadata, "organizationId");
    const billingAccountId = metadataValue(session.metadata, "billingAccountId");
    const amountCents = session.amount_total ?? 0;

    if (organizationId && billingAccountId && amountCents > 0) {
      const balanceResult = await admin
        .from("wallet_ledger_entries")
        .select("balance_after_cents")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const currentBalance = Number((balanceResult.data as Record<string, unknown> | null)?.balance_after_cents ?? 0);
      const balanceAfter = currentBalance + amountCents;

      await admin.from("wallet_ledger_entries").insert({
        organization_id: organizationId,
        billing_account_id: billingAccountId,
        entry_type: "recharge",
        amount_cents: amountCents,
        balance_after_cents: balanceAfter,
        reference_type: "stripe_checkout_session",
        description: `Stripe checkout session ${session.id}`,
      });

      await insertAuditLog(admin, {
        organizationId,
        actorUserId: null,
        entityType: "billing_account",
        entityId: billingAccountId,
        action: "billing.recharge.completed",
        metadata: {
          summary: `Applied ${amountCents} cents from Stripe checkout.`,
          stripeEventId: stripeEvent.id,
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
  }

  return json(200, { received: true });
}
