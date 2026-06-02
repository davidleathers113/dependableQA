import { describe, expect, it } from "vitest";
import type { ReportsSummary } from "../../lib/app-data";
import { buildReportsCsv, buildReportsCsvFilename, escapeCsvCell } from "./reportsCsv";

describe("escapeCsvCell", () => {
  it("leaves plain values untouched", () => {
    expect(escapeCsvCell("Acme")).toBe("Acme");
    expect(escapeCsvCell(42)).toBe("42");
  });

  it("quotes and doubles embedded quotes", () => {
    expect(escapeCsvCell('Say "hi"')).toBe('"Say ""hi"""');
  });

  it("quotes values containing commas, newlines, or carriage returns", () => {
    expect(escapeCsvCell("Smith, Jane")).toBe('"Smith, Jane"');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
  });
});

const FULL_SUMMARY: ReportsSummary = {
  cards: [{ id: "c1", title: "Calls", value: "120", trend: "+5%", description: "Total this month" }],
  publisherBreakdown: [
    { publisherId: "p1", publisherName: "Acme, Inc", totalCalls: 50, flaggedCalls: 5, flagRate: 10 },
  ],
  recentImports: [
    { id: "b1", filename: "april.csv", status: "completed", rowCountTotal: 100, rowCountRejected: 2, createdAt: "2026-06-01T00:00:00.000Z" },
  ],
  reviewVelocity: { reviewsThisMonth: 30, reviewsPreviousMonth: 20, averagePerDay: 1.5 },
};

const EMPTY_SUMMARY: ReportsSummary = {
  cards: [],
  publisherBreakdown: [],
  recentImports: [],
  reviewVelocity: { reviewsThisMonth: 0, reviewsPreviousMonth: 0, averagePerDay: 0 },
};

describe("buildReportsCsv", () => {
  it("includes every major section with its header and data rows", () => {
    const csv = buildReportsCsv(FULL_SUMMARY);
    const lines = csv.split("\n");

    expect(lines).toContain("Summary");
    expect(lines).toContain("Metric,Value,Trend,Description");
    expect(lines).toContain("Calls,120,+5%,Total this month");

    expect(lines).toContain("Publisher Risk Breakdown");
    expect(lines).toContain("Publisher,Calls,Flagged,Flag Rate %");
    // Publisher name with a comma must be quoted.
    expect(lines).toContain('"Acme, Inc",50,5,10');

    expect(lines).toContain("Review Velocity");
    expect(lines).toContain("Reviews This Month,30");
    expect(lines).toContain("Daily Average,1.5");

    expect(lines).toContain("Recent Imports");
    expect(lines).toContain("Filename,Status,Total Rows,Rejected Rows,Created At");
    expect(lines).toContain("april.csv,completed,100,2,2026-06-01T00:00:00.000Z");
  });

  it("emits placeholder rows for empty sections without crashing", () => {
    const csv = buildReportsCsv(EMPTY_SUMMARY);
    const lines = csv.split("\n");

    expect(lines).toContain("No summary metrics available");
    expect(lines).toContain("No publisher-attributed calls this month");
    expect(lines).toContain("No batches created this month");
    // Review velocity always has its three rows even at zero.
    expect(lines).toContain("Reviews This Month,0");
    // Section headers are still present.
    expect(lines).toContain("Publisher Risk Breakdown");
  });
});

describe("buildReportsCsvFilename", () => {
  it("builds a stable, date-stamped filename", () => {
    // Construct a local date so the assertion is timezone-independent.
    expect(buildReportsCsvFilename(new Date(2026, 5, 1, 12, 0, 0))).toBe("reports-2026-06-01.csv");
  });
});
