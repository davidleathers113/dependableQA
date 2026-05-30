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
 * Available balance = settled balance − funds held by open, non-expired
 * reservations (migration 0018). Used for the user-facing "insufficient
 * balance" message; the authoritative reserve/clamp decisions live in the RPCs.
 */
export async function loadAvailableBalanceCents(client: SupabaseAny, organizationId: string): Promise<number> {
  const settled = await loadWalletBalanceCents(client, organizationId);
  const holds = await client
    .from("wallet_processing_holds")
    .select("amount_cents")
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString());

  if (holds.error || !holds.data) {
    return settled;
  }
  const held = (holds.data as Array<Record<string, unknown>>).reduce((sum, row) => {
    const amount = row.amount_cents;
    return sum + (typeof amount === "number" ? amount : 0);
  }, 0);
  return settled - held;
}

/**
 * Reserve funds for a batch of calls at enqueue time. Atomic and race-safe (the
 * RPC locks the billing account). Returns true if every un-held call is now
 * reserved, false if the available balance can't cover the new reservations
 * (nothing is inserted). An empty list is a no-op success.
 */
export async function reserveCallsForProcessing(
  client: SupabaseAny,
  options: {
    organizationId: string;
    billingAccountId: string;
    calls: Array<{ callId: string; amountCents: number }>;
  }
): Promise<boolean> {
  if (options.calls.length === 0) {
    return true;
  }
  const payload = options.calls.map((call) => ({
    call_id: call.callId,
    amount_cents: Math.max(0, Math.floor(call.amountCents)),
  }));

  const result = await client.rpc("reserve_calls_for_processing", {
    p_organization_id: options.organizationId,
    p_billing_account_id: options.billingAccountId,
    p_calls: payload,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data === true;
}

/** Release a call's open reservation (terminal failure / skip). Idempotent. */
export async function releaseCallHold(
  client: SupabaseAny,
  options: { organizationId: string; callId: string }
): Promise<void> {
  const result = await client.rpc("release_call_processing_hold", {
    p_organization_id: options.organizationId,
    p_call_id: options.callId,
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
}

/** Release every expired open reservation. Returns the count released. */
export async function sweepExpiredProcessingHolds(client: SupabaseAny): Promise<number> {
  const result = await client.rpc("sweep_expired_processing_holds");
  if (result.error) {
    throw new Error(result.error.message);
  }
  return typeof result.data === "number" ? result.data : 0;
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
