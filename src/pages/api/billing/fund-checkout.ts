import type { APIRoute } from "astro";
import Stripe from "stripe";
import { formatCurrency, insertAuditLog } from "../../../lib/app-data";
import { requireApiSession } from "../../../lib/auth/request-session";
import { buildDependableQAStripeMetadata } from "../../../lib/stripe/metadata";
import {
  canManageBilling,
  ensureBillingRouteCustomer,
  getBillingReturnUrl,
} from "../../../lib/stripe/billing-routes";
import { getAdminSupabase } from "../../../lib/supabase/admin-client";

export const prerender = false;

function toFundingAmountCents(value: string | null, fallbackAmountCents: number) {
  if (!value) {
    return fallbackAmountCents;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

export const GET: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!canManageBilling(session.organization.role)) {
    return new Response("Only owners, admins, and billing users can manage billing.", { status: 403 });
  }

  const secretKey = import.meta.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return new Response("Missing Stripe secret key", { status: 500 });
  }

  const stripe = new Stripe(secretKey);
  const admin = getAdminSupabase();

  try {
    const { account, customerId } = await ensureBillingRouteCustomer({
      admin,
      stripe,
      secretKey,
      session,
    });
    const requestedAmount = context.url.searchParams.get("amount");
    const defaultAmountCents = Math.max(Number(account.recharge_amount_cents ?? 0), 500);
    const amountCents = toFundingAmountCents(requestedAmount, defaultAmountCents);

    if (amountCents === null) {
      return new Response("Funding amount must be greater than 0.", { status: 400 });
    }

    const returnUrl = getBillingReturnUrl(context.request.url);
    const metadata = buildDependableQAStripeMetadata({
      secretKey,
      organizationId: session.organization.id,
      billingAccountId: account.id,
      flow: "checkout_funding",
    });
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      success_url: `${returnUrl}?funding=success`,
      cancel_url: `${returnUrl}?funding=cancelled`,
      payment_method_types: ["card"],
      metadata,
      payment_intent_data: {
        metadata,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            product_data: {
              name: "DependableQA wallet funding",
              description: `Add ${formatCurrency(amountCents)} to your wallet balance.`,
            },
            unit_amount: amountCents,
          },
        },
      ],
    });

    await insertAuditLog(admin, {
      organizationId: session.organization.id,
      actorUserId: session.user.id,
      entityType: "billing_account",
      entityId: String(account.id),
      action: "billing.checkout_funding.created",
      metadata: {
        summary: `Created hosted funding session for ${formatCurrency(amountCents)}.`,
        amountCents,
        stripeCheckoutSessionId: checkout.id,
      },
    });

    return context.redirect(checkout.url ?? returnUrl, 302);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unable to create funding session.", {
      status: 500,
    });
  }
};
