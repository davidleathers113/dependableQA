import type { APIRoute } from "astro";
import Stripe from "stripe";
import { insertAuditLog } from "../../../lib/app-data";
import { requireApiSession } from "../../../lib/auth/request-session";
import { syncBillingAccountPaymentMethodByCustomerId } from "../../../lib/stripe/payment-method-sync";
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
  let account;
  let customerId: string;

  try {
    const billing = await ensureBillingRouteCustomer({
      admin,
      stripe,
      secretKey,
      session,
    });
    account = billing.account;
    customerId = billing.customerId;
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unable to prepare billing customer.", {
      status: 500,
    });
  }

  if (String(account.stripe_customer_id ?? "").trim().length > 0) {
    try {
      await syncBillingAccountPaymentMethodByCustomerId({
        admin,
        stripe,
        customerId,
      });
    } catch {
      // Best-effort sync only. The portal should still open even if this refresh fails.
    }
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: getBillingReturnUrl(context.request.url),
  });

  await insertAuditLog(admin, {
    organizationId: session.organization.id,
    actorUserId: session.user.id,
    entityType: "billing_account",
    entityId: String(account.id),
    action: "billing.portal.opened",
    metadata: {
      summary: "Opened Stripe customer portal.",
    },
  });

  return context.redirect(portal.url, 302);
};
