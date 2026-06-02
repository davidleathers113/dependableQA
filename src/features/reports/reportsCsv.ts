import type { ReportsSummary } from "../../lib/app-data";

/**
 * Client-side CSV export of the already-loaded Reports data. Pure + unit-tested so
 * the escaping and section layout are verifiable without a browser. No regex
 * (project rule): quoting uses plain string `includes`/`split`/`join`.
 */

/** RFC-4180-style cell escaping: wrap in quotes and double embedded quotes when needed. */
export function escapeCsvCell(value: string | number): string {
  const text = String(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n") || text.includes("\r")) {
    return `"${text.split('"').join('""')}"`;
  }
  return text;
}

function serializeRows(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

/**
 * Build the full Reports CSV from a ReportsSummary. Each major section gets a title
 * row + column header; empty sections emit a single placeholder row so the file is
 * never silently missing a section (and never crashes on empty data).
 */
export function buildReportsCsv(summary: ReportsSummary): string {
  const rows: Array<Array<string | number>> = [];

  rows.push(["Summary"]);
  rows.push(["Metric", "Value", "Trend", "Description"]);
  if (summary.cards.length === 0) {
    rows.push(["No summary metrics available"]);
  } else {
    for (const card of summary.cards) {
      rows.push([card.title, card.value, card.trend, card.description]);
    }
  }

  rows.push([]);
  rows.push(["Publisher Risk Breakdown"]);
  rows.push(["Publisher", "Calls", "Flagged", "Flag Rate %"]);
  if (summary.publisherBreakdown.length === 0) {
    rows.push(["No publisher-attributed calls this month"]);
  } else {
    for (const publisher of summary.publisherBreakdown) {
      rows.push([publisher.publisherName, publisher.totalCalls, publisher.flaggedCalls, publisher.flagRate]);
    }
  }

  rows.push([]);
  rows.push(["Review Velocity"]);
  rows.push(["Metric", "Value"]);
  rows.push(["Reviews This Month", summary.reviewVelocity.reviewsThisMonth]);
  rows.push(["Reviews Previous Month", summary.reviewVelocity.reviewsPreviousMonth]);
  rows.push(["Daily Average", summary.reviewVelocity.averagePerDay]);

  rows.push([]);
  rows.push(["Recent Imports"]);
  rows.push(["Filename", "Status", "Total Rows", "Rejected Rows", "Created At"]);
  if (summary.recentImports.length === 0) {
    rows.push(["No batches created this month"]);
  } else {
    for (const batch of summary.recentImports) {
      rows.push([batch.filename, batch.status, batch.rowCountTotal, batch.rowCountRejected, batch.createdAt]);
    }
  }

  return serializeRows(rows);
}

/** Stable, date-stamped export filename (date injectable for deterministic tests). */
export function buildReportsCsvFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `reports-${year}-${month}-${day}.csv`;
}
