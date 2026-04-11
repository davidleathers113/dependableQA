import type { APIRoute } from "astro";
import Stripe from "stripe";
import { insertAuditLog } from "../../../lib/app-data";
import { requireApiSession } from "../../../lib/auth/request-session";
import { buildDependableQAStripeMetadata } from "../../../lib/stripe/metadata";
import {
  canManageBilling,
  ensureBillingRouteCustomer,
  getBillingReturnUrl,
} from "../../../lib/stripe/billing-routes";
import { getAdminSupabase } from "../../../lib/supabase/admin-client";

export const prerender = false;

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
    const returnUrl = getBillingReturnUrl(context.request.url);
    const checkout = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      success_url: `${returnUrl}?setup=success`,
      cancel_url: `${returnUrl}?setup=cancelled`,
      payment_method_types: ["card"],
      metadata: buildDependableQAStripeMetadata({
        secretKey,
        organizationId: session.organization.id,
        billingAccountId: account.id,
        flow: "checkout_setup",
      }),
      setup_intent_data: {
        metadata: buildDependableQAStripeMetadata({
          secretKey,
          organizationId: session.organization.id,
          billingAccountId: account.id,
          flow: "checkout_setup",
        }),
      },
    });

    await insertAuditLog(admin, {
      organizationId: session.organization.id,
      actorUserId: session.user.id,
      entityType: "billing_account",
      entityId: String(account.id),
      action: "billing.checkout_setup.created",
      metadata: {
        summary: "Created hosted payment method setup session.",
        stripeCheckoutSessionId: checkout.id,
      },
    });

    return context.redirect(checkout.url ?? returnUrl, 302);
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unable to create setup session.", {
      status: 500,
    });
  }
};
