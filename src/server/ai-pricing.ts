import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase/types";

type SupabaseAny = SupabaseClient<Database>;

/**
 * Wallet metering for call processing. We bill the prepaid wallet per call we
 * transcribe, at the org's configured `billing_accounts.per_minute_rate_cents`
 * (the existing billing dimension — no separate AI/token pricing is invented).
 * The enqueue gate blocks work that would exceed the available balance; the
 * debit settles actual usage on completion and is idempotent per call.
 */

export interface BillingContext {
  billingAccountId: string;
  perMinuteRateCents: number;
}

/** A call always bills at least one minute; partial minutes round up. */
export function billableMinutes(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(durationSeconds / 60));
}

export function estimateCallProcessingCents(durationSeconds: number, perMinuteRateCents: number): number {
  return billableMinutes(durationSeconds) * Math.max(0, Math.floor(perMinuteRateCents));
}

/** Load the org's billing account + rate, or null when none is configured. */
export async function loadBillingContext(
  client: SupabaseAny,
  organizationId: string
): Promise<BillingContext | null> {
  const result = await client
    .from("billing_accounts")
    .select("id, per_minute_rate_cents")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (result.error || !result.data) {
    return null;
  }
  const row = result.data as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) {
    return null;
  }
  const rate = typeof row.per_minute_rate_cents === "number" ? row.per_minute_rate_cents : 0;
  return { billingAccountId: id, perMinuteRateCents: rate };
}

/** Current wallet balance = the most recent ledger entry's running balance, or 0. */
export async function loadWalletBalanceCents(client: SupabaseAny, organizationId: string): Promise<number> {
  const result = await client
    .from("wallet_ledger_entries")
    .select("balance_after_cents")
    .eq("organization_id", organizationId)
    // Order by the monotonic `seq` (insertion order) — deterministic even when
    // two ledger rows share a created_at. See migration 0017.
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error || !result.data) {
    return 0;
  }
  const balance = (result.data as Record<string, unknown>).balance_after_cents;
  return typeof balance === "number" ? balance : 0;
}

/**
 * Debit the wallet for processing one call. Best-effort and idempotent: returns
 * true if a debit was recorded, false if skipped (no billing account, zero cost,
 * or already debited for this call). Never throws for "no billing account".
 */
export async function debitCallProcessing(
  client: SupabaseAny,
  options: { organizationId: string; callId: string; durationSeconds: number }
): Promise<boolean> {
  const billing = await loadBillingContext(client, options.organizationId);
  if (!billing) {
    return false;
  }
  const amountCents = estimateCallProcessingCents(options.durationSeconds, billing.perMinuteRateCents);
  if (amountCents <= 0) {
    return false;
  }

  const result = await client.rpc("apply_call_processing_debit", {
    p_organization_id: options.organizationId,
    p_billing_account_id: billing.billingAccountId,
    p_call_id: options.callId,
    p_amount_cents: amountCents,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data === true;
}
