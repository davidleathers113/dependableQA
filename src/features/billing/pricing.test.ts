import { describe, expect, it } from "vitest";
import {
  billableMinutes,
  describePricing,
  estimateBatchCostCents,
  estimateBatchCostLabel,
  estimateCallCostCents,
} from "./pricing";

describe("billableMinutes", () => {
  it("rounds partial minutes up and enforces a 1-minute minimum", () => {
    expect(billableMinutes(0)).toBe(1);
    expect(billableMinutes(1)).toBe(1);
    expect(billableMinutes(60)).toBe(1);
    expect(billableMinutes(61)).toBe(2);
    expect(billableMinutes(210)).toBe(4);
  });

  it("treats invalid durations as a single billable minute", () => {
    expect(billableMinutes(-30)).toBe(1);
    expect(billableMinutes(Number.NaN)).toBe(1);
  });
});

describe("estimateCallCostCents", () => {
  it("multiplies billable minutes by the per-minute rate", () => {
    expect(estimateCallCostCents(210, 15)).toBe(60); // 4 min * 15c
    expect(estimateCallCostCents(30, 15)).toBe(15); // min 1 min
  });

  it("never returns a negative cost for a negative rate", () => {
    expect(estimateCallCostCents(120, -10)).toBe(0);
  });
});

describe("estimateBatchCostCents", () => {
  it("sums per-call billable estimates across durations", () => {
    // 90s -> 2 min, 200s -> 4 min; (2 + 4) * 15c = 90c.
    expect(estimateBatchCostCents([90, 200], 15)).toBe(90);
  });

  it("bills the one-minute minimum for missing/zero durations", () => {
    // 0s and NaN each bill 1 min; (1 + 1) * 15c = 30c.
    expect(estimateBatchCostCents([0, Number.NaN], 15)).toBe(30);
  });

  it("is zero for an empty selection", () => {
    expect(estimateBatchCostCents([], 15)).toBe(0);
  });
});

describe("estimateBatchCostLabel", () => {
  it("formats a tilde-prefixed currency estimate at the org rate", () => {
    expect(estimateBatchCostLabel([90, 200], 15)).toBe("~$0.90");
    expect(estimateBatchCostLabel([30], 15)).toBe("~$0.15"); // min 1 min
  });

  it("returns null when the org has no per-minute rate (not metered)", () => {
    expect(estimateBatchCostLabel([90, 200], 0)).toBeNull();
    expect(estimateBatchCostLabel([90], -5)).toBeNull();
  });
});

describe("describePricing", () => {
  it("marks the rate configured and formats labels for a positive rate", () => {
    const pricing = describePricing(15);
    expect(pricing.configured).toBe(true);
    expect(pricing.rateLabel).toBe("$0.15");
    expect(pricing.exampleSecondsLabel).toBe("3m 30s");
    expect(pricing.exampleMinutes).toBe(4);
    expect(pricing.exampleCostLabel).toBe("$0.60");
  });

  it("reports an unconfigured (zero) rate", () => {
    const pricing = describePricing(0);
    expect(pricing.configured).toBe(false);
    expect(pricing.rateLabel).toBe("$0.00");
  });
});
