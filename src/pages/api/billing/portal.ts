import type { APIRoute } from "astro";
import Stripe from "stripe";
import { insertAuditLog } from "../../../lib/app-data";
import { requireApiSession } from "../../../lib/auth/request-session";
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

  const account = accountResult.data as Record<string, unknown>;
  let customerId = String(account.stripe_customer_id ?? "");

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: String(account.billing_email ?? session.user.email),
      metadata: {
        organizationId: session.organization.id,
      },
      name: session.organization.name,
    });

    customerId = customer.id;

    const updateAccount = await admin
      .from("billing_accounts")
      .update({
        stripe_customer_id: customerId,
      })
      .eq("id", String(account.id));

    if (updateAccount.error) {
      return new Response(updateAccount.error.message, { status: 500 });
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
