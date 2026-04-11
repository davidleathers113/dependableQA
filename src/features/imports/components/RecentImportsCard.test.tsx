import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ImportBatchSummary } from "../../../lib/app-data";
import { RecentImportsCard } from "./RecentImportsCard";

const SAMPLE_BATCH: ImportBatchSummary = {
  id: "batch_1",
  filename: "trackdrive-apr-10.csv",
  status: "partial",
  rowCountTotal: 12,
  rowCountAccepted: 10,
  rowCountRejected: 2,
  createdAt: "2026-04-10T18:33:00.000Z",
  sourceProvider: "trackdrive",
  uploadedById: "user_1",
  uploadedByName: "Alex Operator",
};

describe("RecentImportsCard", () => {
  it("renders the compact recent imports list", () => {
    const html = renderToStaticMarkup(
      <RecentImportsCard batches={[SAMPLE_BATCH]} onRetryBatch={() => undefined} retryingBatchId={null} />
    );

    expect(html.includes("Recent imports")).toBe(true);
    expect(html.includes("Open batch")).toBe(true);
    expect(html.includes("TrackDrive")).toBe(true);
    expect(html.includes("Uploaded by Alex Operator")).toBe(true);
  });
});
