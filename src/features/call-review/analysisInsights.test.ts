import { describe, expect, it } from "vitest";
import { formatConfidence, formatScore, humanizeToken, parseAnalysisInsights } from "./analysisInsights";

describe("parseAnalysisInsights", () => {
  it("returns null for null/undefined/non-object input", () => {
    expect(parseAnalysisInsights(null)).toBeNull();
    expect(parseAnalysisInsights(undefined)).toBeNull();
    expect(parseAnalysisInsights("nope")).toBeNull();
    expect(parseAnalysisInsights(42)).toBeNull();
  });

  it("extracts a full analysis payload", () => {
    const insights = parseAnalysisInsights({
      summary: "ignored extra field",
      callOutcome: "qualified",
      confidence: 0.82,
      agentQuality: { score: 88, summary: "Strong rapport." },
      customerIntent: { primaryIntent: "Medicare enrollment", summary: "Wants plan options." },
      compliance: { status: "pass", summary: "Disclosure read." },
      scoring: { overall: 90, compliance: 95, communication: 85, outcomeAlignment: 80 },
      followUpRecommendation: "Send plan PDF.",
      redactionsNeeded: false,
    });

    expect(insights).not.toBeNull();
    expect(insights?.callOutcome).toBe("qualified");
    expect(insights?.confidence).toBe(0.82);
    expect(insights?.agentQuality?.score).toBe(88);
    expect(insights?.scoring?.overall).toBe(90);
    expect(insights?.followUpRecommendation).toBe("Send plan PDF.");
  });

  it("tolerates partial payloads", () => {
    const insights = parseAnalysisInsights({ compliance: { status: "review" } });
    expect(insights).not.toBeNull();
    expect(insights?.compliance?.status).toBe("review");
    expect(insights?.scoring).toBeUndefined();
  });

  it("rejects out-of-range scores without throwing", () => {
    // confidence > 1 is invalid; safeParse fails -> null rather than crash
    const insights = parseAnalysisInsights({ confidence: 5 });
    expect(insights).toBeNull();
  });

  it("parses the disposition-intelligence block and expressedInterest", () => {
    const insights = parseAnalysisInsights({
      customerIntent: { primaryIntent: "buy", expressedInterest: { status: "yes", strength: "strong" } },
      disposition: {
        finalDisposition: "qualified_no_conversion",
        journeyStageReached: "offer_presented",
        confidence: 0.84,
        qualification: { status: "qualified", criteria: [{ key: "service_area", status: "met" }] },
        conversion: { status: "none", conversionType: "none" },
        fraud: { riskLevel: "low", fraudLikely: false, categories: [], indicators: [] },
        leadQuality: { status: "acceptable", billableRecommendation: "billable" },
      },
    });

    expect(insights?.customerIntent?.expressedInterest?.strength).toBe("strong");
    expect(insights?.disposition?.finalDisposition).toBe("qualified_no_conversion");
    expect(insights?.disposition?.fraud?.riskLevel).toBe("low");
    expect(insights?.disposition?.qualification?.criteria?.[0]?.key).toBe("service_area");
  });

  it("keeps the disposition block undefined for pre-v3 payloads", () => {
    const insights = parseAnalysisInsights({ callOutcome: "qualified" });
    expect(insights?.disposition).toBeUndefined();
  });
});

describe("humanizeToken", () => {
  it("turns snake_case enum tokens into readable labels", () => {
    expect(humanizeToken("qualified_no_conversion")).toBe("Qualified no conversion");
    expect(humanizeToken("sale_completed")).toBe("Sale completed");
    expect(humanizeToken("high")).toBe("High");
  });

  it("returns null for empty/nullish input", () => {
    expect(humanizeToken(null)).toBeNull();
    expect(humanizeToken(undefined)).toBeNull();
    expect(humanizeToken("")).toBeNull();
  });
});

describe("formatScore / formatConfidence", () => {
  it("formats scores and rounds", () => {
    expect(formatScore(90)).toBe("90/100");
    expect(formatScore(88.6)).toBe("89/100");
    expect(formatScore(undefined)).toBeNull();
  });

  it("formats confidence as a percentage", () => {
    expect(formatConfidence(0.82)).toBe("82%");
    expect(formatConfidence(1)).toBe("100%");
    expect(formatConfidence(null)).toBeNull();
    expect(formatConfidence(undefined)).toBeNull();
  });
});
