import type { APIRoute } from "astro";
import Stripe from "stripe";
import { insertAuditLog } from "../../../lib/app-data";
import { requireApiSession } from "../../../lib/auth/request-session";
import {
  ensureStripeCustomerForBillingAccount,
  syncBillingAccountPaymentMethodByCustomerId,
} from "../../../lib/stripe/payment-method-sync";
import { getAdminSupabase } from "../../../lib/supabase/admin-client";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const session = await requireApiSession(context);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const secretKey = import.meta.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return new Response("Missing Stripe secret key", { status: 500 });
  }

  const stripe = new Stripe(secretKey);
  const admin = getAdminSupabase();
  const accountResult = await admin
    .from("billing_accounts")
    .select("id, stripe_customer_id, billing_email")
    .eq("organization_id", session.organization.id)
    .single();

  if (accountResult.error || !accountResult.data) {
    return new Response(accountResult.error?.message ?? "Billing account not found", { status: 404 });
  }

  const account = accountResult.data;
  let customerId: string;

  try {
    customerId = await ensureStripeCustomerForBillingAccount({
      admin,
      stripe,
      billingAccount: account,
      organizationId: session.organization.id,
      organizationName: session.organization.name,
      fallbackEmail: session.user.email,
    });
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

  const appUrl = import.meta.env.APP_URL || new URL("/", context.request.url).origin;
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/app/billing`,
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
