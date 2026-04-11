import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import type { Database } from "../../../supabase/types";
import type { BillingPaymentMethodStatus } from "../app-data";
import { insertAuditLog } from "../app-data";
import { buildDependableQAStripeMetadata } from "./metadata";

type AdminClient = SupabaseClient<Database>;
type BillingAccountRow = Database["public"]["Tables"]["billing_accounts"]["Row"];
type BillingAccountUpdate = Database["public"]["Tables"]["billing_accounts"]["Update"];

interface EnsureStripeCustomerInput {
  admin: AdminClient;
  stripe: Stripe;
  secretKey: string;
  billingAccount: Pick<BillingAccountRow, "id" | "billing_email" | "stripe_customer_id">;
  organizationId: string;
  organizationName: string;
  fallbackEmail: string;
}

interface SyncBillingPaymentMethodInput {
  admin: AdminClient;
  stripe: Stripe;
  customerId: string;
  preferredStatus?: BillingPaymentMethodStatus | null;
  auditAction?: string | null;
  stripeEventId?: string | null;
}

export function isStripeCardExpired(expMonth: number | null, expYear: number | null, referenceDate = new Date()) {
  if (!expMonth || !expYear) {
    return false;
  }

  const currentYear = referenceDate.getUTCFullYear();
  const currentMonth = referenceDate.getUTCMonth() + 1;
  if (expYear < currentYear) {
    return true;
  }

  if (expYear === currentYear && expMonth < currentMonth) {
    return true;
  }

  return false;
}

function toNullableString(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function formatCardLabel(brand: string | null, last4: string | null) {
  const normalizedBrand = toNullableString(brand);
  const normalizedLast4 = toNullableString(last4);
  if (!normalizedBrand || !normalizedLast4) {
    return "default payment method";
  }

  return `${normalizedBrand[0]?.toUpperCase() + normalizedBrand.slice(1)} ending in ${normalizedLast4}`;
}

function getStatusFromPaymentMethod(
  paymentMethod: Stripe.PaymentMethod | null,
  preferredStatus?: BillingPaymentMethodStatus | null
): BillingPaymentMethodStatus {
  if (!paymentMethod) {
    return "missing";
  }

  if (preferredStatus === "attention") {
    return "attention";
  }

  if (paymentMethod.type !== "card" || !paymentMethod.card) {
    return "attention";
  }

  if (isStripeCardExpired(paymentMethod.card.exp_month, paymentMethod.card.exp_year)) {
    return "expired";
  }

  return preferredStatus ?? "ready";
}

export function buildBillingAccountPaymentMethodUpdate(
  paymentMethod: Stripe.PaymentMethod | null,
  preferredStatus?: BillingPaymentMethodStatus | null
): BillingAccountUpdate {
  const status = getStatusFromPaymentMethod(paymentMethod, preferredStatus);
  if (!paymentMethod || paymentMethod.type !== "card" || !paymentMethod.card) {
    return {
      stripe_default_payment_method_id: paymentMethod?.id ?? null,
      card_brand: null,
      card_last4: null,
      card_exp_month: null,
      card_exp_year: null,
      card_funding: null,
      card_country: null,
      payment_method_status: status,
    };
  }

  return {
    stripe_default_payment_method_id: paymentMethod.id,
    card_brand: toNullableString(paymentMethod.card.brand),
    card_last4: toNullableString(paymentMethod.card.last4),
    card_exp_month: paymentMethod.card.exp_month ?? null,
    card_exp_year: paymentMethod.card.exp_year ?? null,
    card_funding: toNullableString(paymentMethod.card.funding),
    card_country: toNullableString(paymentMethod.card.country),
    payment_method_status: status,
  };
}

async function getDefaultPaymentMethodForCustomer(stripe: Stripe, customerId: string) {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });

  if (customer.deleted) {
    return null;
  }

  const defaultPaymentMethod = customer.invoice_settings.default_payment_method;
  if (!defaultPaymentMethod) {
    return null;
  }

  if (typeof defaultPaymentMethod === "string") {
    return await stripe.paymentMethods.retrieve(defaultPaymentMethod);
  }

  return defaultPaymentMethod;
}

function buildPaymentMethodAuditSummary(update: BillingAccountUpdate) {
  const brand = toNullableString(update.card_brand ?? null);
  const last4 = toNullableString(update.card_last4 ?? null);
  const status = toNullableString(update.payment_method_status ?? null);

  if (status === "missing") {
    return "Default payment method removed";
  }

  if (status === "expired") {
    return `${formatCardLabel(brand, last4)} is expired`;
  }

  if (status === "attention") {
    return `${formatCardLabel(brand, last4)} requires attention`;
  }

  return `Default payment method updated to ${formatCardLabel(brand, last4)}`;
}

export async function ensureStripeCustomerForBillingAccount({
  admin,
  stripe,
  secretKey,
  billingAccount,
  organizationId,
  organizationName,
  fallbackEmail,
}: EnsureStripeCustomerInput) {
  const existingCustomerId = toNullableString(billingAccount.stripe_customer_id);
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const customer = await stripe.customers.create({
    email: billingAccount.billing_email ?? fallbackEmail,
    metadata: buildDependableQAStripeMetadata({
      secretKey,
      organizationId,
      billingAccountId: billingAccount.id,
      flow: "customer",
    }),
    name: organizationName,
  });

  const updateResult = await admin
    .from("billing_accounts")
    .update({
      stripe_customer_id: customer.id,
    })
    .eq("id", billingAccount.id);

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }

  return customer.id;
}

export async function syncBillingAccountPaymentMethodByCustomerId({
  admin,
  stripe,
  customerId,
  preferredStatus = null,
  auditAction = null,
  stripeEventId = null,
}: SyncBillingPaymentMethodInput) {
  const accountResult = await admin
    .from("billing_accounts")
    .select("id, organization_id, stripe_customer_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (accountResult.error) {
    throw new Error(accountResult.error.message);
  }

  if (!accountResult.data) {
    return null;
  }

  const paymentMethod = await getDefaultPaymentMethodForCustomer(stripe, customerId);
  const update = buildBillingAccountPaymentMethodUpdate(paymentMethod, preferredStatus);
  const updateResult = await admin
    .from("billing_accounts")
    .update({
      stripe_customer_id: customerId,
      ...update,
    })
    .eq("id", accountResult.data.id);

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }

  if (auditAction) {
    await insertAuditLog(admin, {
      organizationId: accountResult.data.organization_id,
      actorUserId: null,
      entityType: "billing_account",
      entityId: accountResult.data.id,
      action: auditAction,
      metadata: {
        summary: buildPaymentMethodAuditSummary(update),
        stripeCustomerId: customerId,
        stripeDefaultPaymentMethodId: update.stripe_default_payment_method_id ?? null,
        stripeEventId,
      },
    });
  }

  return {
    billingAccountId: accountResult.data.id,
    organizationId: accountResult.data.organization_id,
    paymentMethod,
    update,
  };
}
