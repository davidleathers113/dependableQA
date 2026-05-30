import { describe, expect, it, vi } from "vitest";
import { billableMinutes, debitCallProcessing, estimateCallProcessingCents } from "./ai-pricing";

describe("billableMinutes", () => {
  it("bills at least one minute, rounding partial minutes up", () => {
    expect(billableMinutes(0)).toBe(1);
    expect(billableMinutes(-5)).toBe(1);
    expect(billableMinutes(1)).toBe(1);
    expect(billableMinutes(60)).toBe(1);
    expect(billableMinutes(61)).toBe(2);
    expect(billableMinutes(150)).toBe(3);
  });
});

describe("estimateCallProcessingCents", () => {
  it("multiplies billable minutes by the per-minute rate", () => {
    expect(estimateCallProcessingCents(60, 2)).toBe(2);
    expect(estimateCallProcessingCents(61, 2)).toBe(4);
    expect(estimateCallProcessingCents(600, 5)).toBe(50);
  });

  it("never returns negative cents", () => {
    expect(estimateCallProcessingCents(60, -10)).toBe(0);
  });
});

function fakeClient(billing: { id: string; per_minute_rate_cents: number } | null, rpcResult: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => rpcResult);
  const client = {
    from(table: string) {
      if (table !== "billing_accounts") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: billing, error: null }),
          }),
        }),
      };
    },
    rpc,
  };
  return { client, rpc };
}

describe("debitCallProcessing", () => {
  it("calls the debit RPC with the computed cents when a billing account exists", async () => {
    const { client, rpc } = fakeClient({ id: "ba_1", per_minute_rate_cents: 100 }, { data: true, error: null });

    const applied = await debitCallProcessing(client as never, {
      organizationId: "org_1",
      callId: "call_1",
      durationSeconds: 90, // 2 billable minutes * 100c = 200c
    });

    expect(applied).toBe(true);
    expect(rpc).toHaveBeenCalledWith("apply_call_processing_debit", {
      p_organization_id: "org_1",
      p_billing_account_id: "ba_1",
      p_call_id: "call_1",
      p_amount_cents: 200,
    });
  });

  it("skips (no RPC) when the org has no billing account", async () => {
    const { client, rpc } = fakeClient(null, { data: false, error: null });
    const applied = await debitCallProcessing(client as never, {
      organizationId: "org_1",
      callId: "call_1",
      durationSeconds: 90,
    });
    expect(applied).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns false when the RPC reports an already-applied (idempotent) debit", async () => {
    const { client } = fakeClient({ id: "ba_1", per_minute_rate_cents: 100 }, { data: false, error: null });
    const applied = await debitCallProcessing(client as never, {
      organizationId: "org_1",
      callId: "call_1",
      durationSeconds: 60,
    });
    expect(applied).toBe(false);
  });

  it("throws when the RPC errors (caller decides how to handle)", async () => {
    const { client } = fakeClient({ id: "ba_1", per_minute_rate_cents: 100 }, { data: null, error: { message: "boom" } });
    await expect(
      debitCallProcessing(client as never, { organizationId: "org_1", callId: "call_1", durationSeconds: 60 })
    ).rejects.toThrow("boom");
  });
});
