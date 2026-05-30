import { describe, expect, it } from "vitest";
import {
  buildAnalysisInstructions,
  callAnalysisSchema,
  deriveDispositionColumns,
  dispositionIntelligenceSchema,
  type CallAnalysisResult,
  type DispositionIntelligenceResult,
} from "./analyze-call";

/** A complete, valid disposition-intelligence block (schema v2). */
function dispositionFixture(overrides: Partial<DispositionIntelligenceResult> = {}): DispositionIntelligenceResult {
  return {
    finalDisposition: "qualified_no_conversion",
    journeyStageReached: "offer_presented",
    confidence: 0.84,
    qualification: {
      status: "qualified",
      confidence: 0.9,
      disqualificationReasons: [],
      criteria: [
        { key: "service_area", label: "In service area", status: "met", value: "Austin, TX", evidence: ["I'm in Austin"] },
        { key: "decision_maker", label: "Decision maker", status: "unclear", value: null, evidence: [] },
      ],
    },
    conversion: {
      status: "none",
      conversionType: "none",
      evidence: [],
      followUp: {
        required: true,
        type: "callback",
        dueDateOrTimeMentioned: "tomorrow morning",
        ownerMentioned: null,
        evidence: ["call me back tomorrow"],
      },
    },
    fraud: {
      riskLevel: "low",
      fraudLikely: false,
      confidence: 0.7,
      categories: [],
      indicators: [],
      recommendedAction: "none",
    },
    leadQuality: {
      status: "acceptable",
      billableRecommendation: "billable",
      payoutRecommendation: "pay_publisher",
      reasons: [{ type: "genuine_interest", summary: "Real need expressed", evidence: ["I need this fixed"] }],
    },
    ...overrides,
  };
}

/** A complete v3:v2 analysis payload. */
function analysisFixture(disposition: DispositionIntelligenceResult): CallAnalysisResult {
  return {
    summary: "Caller asked for pricing; agent qualified and offered a plan.",
    suggestedDisposition: "qualified",
    confidence: 0.84,
    callOutcome: "qualified",
    agentQuality: { score: 82, summary: "Clear and compliant." },
    customerIntent: {
      primaryIntent: "get_quote",
      summary: "Wants pricing before committing.",
      expressedInterest: { status: "yes", strength: "moderate" },
    },
    compliance: { status: "pass", summary: "No issues." },
    flags: [],
    evidenceSpans: [],
    redactionsNeeded: false,
    followUpRecommendation: "Send a quote.",
    scoring: { overall: 80, compliance: 100, communication: 82, outcomeAlignment: 70 },
    disposition,
  };
}

describe("dispositionIntelligenceSchema", () => {
  it("accepts a complete valid block", () => {
    const result = dispositionIntelligenceSchema.safeParse(dispositionFixture());
    expect(result.success).toBe(true);
  });

  it("rejects an unknown finalDisposition enum value", () => {
    const result = dispositionIntelligenceSchema.safeParse(dispositionFixture({ finalDisposition: "definitely_sold" as never }));
    expect(result.success).toBe(false);
  });

  it("rejects an unknown fraud riskLevel", () => {
    const bad = dispositionFixture();
    bad.fraud.riskLevel = "extreme" as never;
    expect(dispositionIntelligenceSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a confidence outside 0..1", () => {
    const result = dispositionIntelligenceSchema.safeParse(dispositionFixture({ confidence: 1.5 }));
    expect(result.success).toBe(false);
  });
});

describe("callAnalysisSchema (v3:v2)", () => {
  it("accepts a full payload with the disposition block and expressedInterest", () => {
    const result = callAnalysisSchema.safeParse(analysisFixture(dispositionFixture()));
    expect(result.success).toBe(true);
  });

  it("rejects a payload missing the disposition block", () => {
    const payload = analysisFixture(dispositionFixture()) as Record<string, unknown>;
    delete payload.disposition;
    expect(callAnalysisSchema.safeParse(payload).success).toBe(false);
  });
});

describe("deriveDispositionColumns", () => {
  it("maps the disposition block onto the denormalized calls columns", () => {
    const columns = deriveDispositionColumns(analysisFixture(dispositionFixture()));
    expect(columns).toEqual({
      ai_final_disposition: "qualified_no_conversion",
      ai_journey_stage: "offer_presented",
      ai_qualification_status: "qualified",
      ai_conversion_status: "none",
      ai_conversion_type: "none",
      ai_fraud_risk: "low",
      ai_fraud_likely: false,
      ai_lead_quality: "acceptable",
      ai_billable_recommendation: "billable",
    });
  });

  it("returns all-null columns when the disposition block is absent (pre-v3 / partial)", () => {
    const legacy = analysisFixture(dispositionFixture()) as Record<string, unknown>;
    delete legacy.disposition;
    const columns = deriveDispositionColumns(legacy as never);
    expect(columns).toEqual({
      ai_final_disposition: null,
      ai_journey_stage: null,
      ai_qualification_status: null,
      ai_conversion_status: null,
      ai_conversion_type: null,
      ai_fraud_risk: null,
      ai_fraud_likely: null,
      ai_lead_quality: null,
      ai_billable_recommendation: null,
    });
  });

  // Representative golden-shaped cases across verticals/outcomes. Each must
  // validate against the schema and derive the expected headline axes.
  const goldenCases: Array<{
    name: string;
    disposition: DispositionIntelligenceResult;
    expect: { ai_final_disposition: string; ai_conversion_status: string; ai_fraud_risk: string };
  }> = [
    {
      name: "dead air",
      disposition: dispositionFixture({
        finalDisposition: "dead_air",
        journeyStageReached: "no_meaningful_contact",
        conversion: { status: "none", conversionType: "none", evidence: [], followUp: { required: false, type: "none", dueDateOrTimeMentioned: null, ownerMentioned: null, evidence: [] } },
      }),
      expect: { ai_final_disposition: "dead_air", ai_conversion_status: "none", ai_fraud_risk: "low" },
    },
    {
      name: "callback requested (not scheduled)",
      disposition: dispositionFixture({
        finalDisposition: "callback_requested",
        journeyStageReached: "callback_or_appointment_set",
        conversion: { status: "callback_requested", conversionType: "callback", evidence: ["call me later"], followUp: { required: true, type: "callback", dueDateOrTimeMentioned: null, ownerMentioned: null, evidence: ["call me later"] } },
      }),
      expect: { ai_final_disposition: "callback_requested", ai_conversion_status: "callback_requested", ai_fraud_risk: "low" },
    },
    {
      name: "sale completed",
      disposition: dispositionFixture({
        finalDisposition: "sale_completed",
        journeyStageReached: "sale_or_enrollment_completed",
        conversion: { status: "sale_completed", conversionType: "sale", evidence: ["I'll take it"], followUp: { required: false, type: "none", dueDateOrTimeMentioned: null, ownerMentioned: null, evidence: [] } },
      }),
      expect: { ai_final_disposition: "sale_completed", ai_conversion_status: "sale_completed", ai_fraud_risk: "low" },
    },
    {
      name: "incentivized lead / suspected fraud",
      disposition: dispositionFixture({
        finalDisposition: "suspected_fraud",
        journeyStageReached: "opening",
        fraud: {
          riskLevel: "high",
          fraudLikely: true,
          confidence: 0.86,
          categories: ["incentivized_or_non_genuine_interest"],
          indicators: [
            { type: "incentivized_caller", severity: "high", description: "Caller said they were told to call to get a gift card.", evidence: ["I was told I'd get a gift card"] },
          ],
          recommendedAction: "do_not_pay_publisher",
        },
        leadQuality: { status: "suspected_fraud", billableRecommendation: "not_billable", payoutRecommendation: "do_not_pay_publisher", reasons: [{ type: "incentivized", summary: "No genuine interest", evidence: ["gift card"] }] },
      }),
      expect: { ai_final_disposition: "suspected_fraud", ai_conversion_status: "none", ai_fraud_risk: "high" },
    },
  ];

  for (const c of goldenCases) {
    it(`validates and derives: ${c.name}`, () => {
      const payload = analysisFixture(c.disposition);
      expect(callAnalysisSchema.safeParse(payload).success).toBe(true);
      const columns = deriveDispositionColumns(payload);
      expect(columns.ai_final_disposition).toBe(c.expect.ai_final_disposition);
      expect(columns.ai_conversion_status).toBe(c.expect.ai_conversion_status);
      expect(columns.ai_fraud_risk).toBe(c.expect.ai_fraud_risk);
    });
  }
});

describe("buildAnalysisInstructions (v3)", () => {
  const text = buildAnalysisInstructions("v3");

  it("keeps the v2 role-inference guidance", () => {
    expect(text).toContain("AGENT represents the business");
  });

  it("instructs the four-axis disposition read", () => {
    expect(text).toContain("disposition.finalDisposition");
    expect(text).toContain("disposition.journeyStageReached");
    expect(text).toContain("disposition.qualification.status");
    expect(text).toContain("disposition.conversion.status");
  });

  it("separates interest from qualification from conversion", () => {
    expect(text).toContain("express INTEREST without being QUALIFIED");
  });

  it("encodes the fraud rubric and the caller-ID caveat", () => {
    expect(text).toContain("Universal fraud red flags");
    expect(text).toContain("spoofable");
    expect(text).toContain("never base a fraud judgment on caller ID alone");
  });

  it("forbids reporting conversions without evidence", () => {
    expect(text).toContain("Never report a sale, enrollment, application, or transfer as completed without explicit transcript evidence");
  });
});
