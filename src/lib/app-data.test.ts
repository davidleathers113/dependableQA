import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CALL_FILTERS,
  buildCallFilters,
  deriveBillingHealthSummary,
  deriveBillingRunwaySummary,
  filtersToSearchParams,
  getIntegrationsSummary,
  getBillingPaymentMethodSummaryFromAccount,
  normalizeCallFilters,
} from "./app-data";

describe("calls filter helpers", () => {
  it("normalizes incomplete filters with stable defaults", () => {
    expect(
      normalizeCallFilters({
        search: "  compliance  ",
        flaggedOnly: true,
      })
    ).toEqual({
      ...DEFAULT_CALL_FILTERS,
      search: "compliance",
      flaggedOnly: true,
    });
  });

  it("builds filters from URL state including flag and sort options", () => {
    const params = new URLSearchParams({
      search: "ivr",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-10",
      flaggedOnly: "true",
      flagCategory: "compliance",
      sortBy: "flagCount",
      sortDirection: "asc",
    });

    expect(buildCallFilters(params)).toEqual({
      ...DEFAULT_CALL_FILTERS,
      search: "ivr",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-10",
      flaggedOnly: true,
      flagCategory: "compliance",
      sortBy: "flagCount",
      sortDirection: "asc",
    });
  });

  it("serializes non-default filters into shareable URL params", () => {
    const params = filtersToSearchParams({
      ...DEFAULT_CALL_FILTERS,
      search: "sale",
      flaggedOnly: true,
      sortBy: "updatedAt",
      sortDirection: "asc",
    });

    expect(params.get("search")).toBe("sale");
    expect(params.get("flaggedOnly")).toBe("true");
    expect(params.get("sortBy")).toBe("updatedAt");
    expect(params.get("sortDirection")).toBe("asc");
    expect(params.get("dateFrom")).toBeNull();
  });
});

describe("billing summary helpers", () => {
  it("maps persisted payment method fields into the billing summary shape", () => {
    expect(
      getBillingPaymentMethodSummaryFromAccount({
        card_brand: "visa",
        card_last4: "4242",
        card_exp_month: 8,
        card_exp_year: 2028,
        payment_method_status: "ready",
        last_successful_charge_at: "2026-04-10T12:00:00.000Z",
      })
    ).toEqual({
      brand: "visa",
      last4: "4242",
      expMonth: 8,
      expYear: 2028,
      status: "ready",
      lastChargeAt: "2026-04-10T12:00:00.000Z",
    });
  });

  it("derives projected runway and next recharge timing from recent debits", () => {
    const runway = deriveBillingRunwaySummary({
      currentBalanceCents: 150000,
      rechargeThresholdCents: 50000,
      autopayEnabled: true,
      ledger: [
        {
          amountCents: -25000,
          createdAt: "2026-04-10T00:00:00.000Z",
          entryType: "usage",
          status: "applied",
        },
        {
          amountCents: -25000,
          createdAt: "2026-04-05T00:00:00.000Z",
          entryType: "usage",
          status: "applied",
        },
      ],
    });

    expect(runway.averageDailySpendCents).toBeGreaterThan(0);
    expect(runway.projectedDaysRemaining).toBeGreaterThan(0);
    expect(runway.estimatedNextRechargeAt).not.toBeNull();
  });

  it("surfaces failed recharge attempts as a critical billing state", () => {
    expect(
      deriveBillingHealthSummary({
        accountId: "acct_123",
        autopayEnabled: true,
        currentBalanceCents: 120000,
        rechargeThresholdCents: 50000,
        paymentMethodStatus: "ready",
        projectedDaysRemaining: 6.2,
        latestLedgerEntry: {
          entryType: "failed_recharge",
          status: "failed",
        },
      })
    ).toEqual({
      status: "critical",
      title: "Recent recharge failed",
      description:
        "Your last automatic recharge attempt was unsuccessful. Update your payment method to avoid interruption.",
      actionLabel: "Update payment method",
      actionKind: "update_card",
    });
  });

  it("returns an onboarding state when no billing account exists", () => {
    expect(
      deriveBillingHealthSummary({
        accountId: null,
        autopayEnabled: false,
        currentBalanceCents: 0,
        rechargeThresholdCents: 0,
        paymentMethodStatus: "missing",
        projectedDaysRemaining: null,
        latestLedgerEntry: null,
      })
    ).toEqual({
      status: "critical",
      title: "Set up billing to start processing calls",
      description: "Add a payment method and configure wallet funding to enable call processing.",
      actionLabel: "Set up billing",
      actionKind: "setup_billing",
    });
  });
});

describe("integrations summary helpers", () => {
  it("merges the supported provider catalog with configured rows", async () => {
    const integrationsRows = [
      {
        id: "integration_1",
        display_name: "Ringba Primary",
        provider: "ringba",
        status: "connected",
        mode: "webhook",
        last_success_at: null,
        last_error_at: null,
        config: {},
      },
    ];
    const eventsRows = [
      {
        id: "event_1",
        integration_id: "integration_1",
        event_type: "webhook.test.accepted",
        severity: "info",
        message: "Test event accepted.",
        created_at: "2026-04-10T00:00:00.000Z",
      },
    ];

    const integrationsQuery = {
      eq: vi.fn(),
      order: vi.fn().mockResolvedValue({
        data: integrationsRows,
        error: null,
      }),
    };
    integrationsQuery.eq.mockReturnValue(integrationsQuery);

    const eventsQuery = {
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({
        data: eventsRows,
        error: null,
      }),
    };
    eventsQuery.eq.mockReturnValue(eventsQuery);
    eventsQuery.order.mockReturnValue(eventsQuery);

    const client = {
      from: vi.fn((table: string) => {
        if (table === "integrations") {
          return {
            select: vi.fn(() => integrationsQuery),
          };
        }

        return {
          select: vi.fn(() => eventsQuery),
        };
      }),
    };

    const summary = await getIntegrationsSummary(client as never, "org_1");

    expect(summary.integrations.map((integration) => integration.provider)).toEqual([
      "ringba",
      "trackdrive",
      "retreaver",
    ]);
    expect(summary.integrations[0]).toMatchObject({
      id: "integration_1",
      isConfigured: true,
      isCatalogPlaceholder: false,
      ringba: {
        publicIngestKey: "",
        minimumDurationSeconds: 30,
      },
    });
    expect(summary.integrations[1]).toMatchObject({
      provider: "trackdrive",
      isConfigured: false,
      isCatalogPlaceholder: true,
      ringba: {
        publicIngestKey: "",
        minimumDurationSeconds: 30,
      },
    });
  });
});
