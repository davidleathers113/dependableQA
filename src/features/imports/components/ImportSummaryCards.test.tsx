import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ImportBatchSummary } from "../../../lib/app-data";
import { ImportSummaryCards } from "./ImportSummaryCards";

const SAMPLE_BATCHES: ImportBatchSummary[] = [
  {
    id: "batch_1",
    filename: "trackdrive-apr-10.csv",
    status: "processing",
    rowCountTotal: 8,
    rowCountAccepted: 4,
    rowCountRejected: 1,
    createdAt: "2026-04-10T08:00:00.000Z",
    sourceProvider: "trackdrive",
    uploadedById: "user_1",
    uploadedByName: "Alex Operator",
  },
  {
    id: "batch_2",
    filename: "custom-apr-10.csv",
    status: "failed",
    rowCountTotal: 5,
    rowCountAccepted: 0,
    rowCountRejected: 5,
    createdAt: "2026-04-10T09:00:00.000Z",
    sourceProvider: "custom",
    uploadedById: "user_2",
    uploadedByName: "Taylor Analyst",
  },
];

describe("ImportSummaryCards", () => {
  it("renders the import snapshot cards", () => {
    const html = renderToStaticMarkup(<ImportSummaryCards batches={SAMPLE_BATCHES} />);

    expect(html.includes("Import Snapshot")).toBe(true);
    expect(html.includes("Recent Batches")).toBe(true);
    expect(html.includes("Processing")).toBe(true);
    expect(html.includes("Failed")).toBe(true);
  });
});
