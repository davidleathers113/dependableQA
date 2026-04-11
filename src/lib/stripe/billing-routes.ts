import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database } from "../../../supabase/types";
import { ensureStripeCustomerForBillingAccount } from "./payment-method-sync";

type AdminClient = SupabaseClient<Database>;
type BillingAccountRow = Database["public"]["Tables"]["billing_accounts"]["Row"];

export interface BillingRouteSession {
  user: { id: string; email: string };
  organization: { id: string; name: string; role: string };
}

export function canManageBilling(role: string) {
  return role === "owner" || role === "admin" || role === "billing";
}

export async function getBillingAccountForOrganization(admin: AdminClient, organizationId: string) {
  const result = await admin
    .from("billing_accounts")
    .select("id, stripe_customer_id, billing_email, recharge_amount_cents, recharge_threshold_cents")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!result.data) {
    throw new Error("Billing account not found.");
  }

  return result.data as Pick<
    BillingAccountRow,
    "id" | "stripe_customer_id" | "billing_email" | "recharge_amount_cents" | "recharge_threshold_cents"
  >;
}

export async function ensureBillingRouteCustomer(input: {
  admin: AdminClient;
  stripe: Stripe;
  secretKey: string;
  session: BillingRouteSession;
}) {
  const account = await getBillingAccountForOrganization(input.admin, input.session.organization.id);
  const customerId = await ensureStripeCustomerForBillingAccount({
    admin: input.admin,
    stripe: input.stripe,
    secretKey: input.secretKey,
    billingAccount: account,
    organizationId: input.session.organization.id,
    organizationName: input.session.organization.name,
    fallbackEmail: input.session.user.email,
  });

  return {
    account,
    customerId,
  };
}

export function getBillingReturnUrl(requestUrl: string) {
  return `${new URL("/", requestUrl).origin}app/billing`;
}
