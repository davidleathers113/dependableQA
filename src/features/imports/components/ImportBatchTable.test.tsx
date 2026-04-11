import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ImportBatchSummary } from "../../../lib/app-data";
import { ImportBatchTable } from "./ImportBatchTable";

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

describe("ImportBatchTable", () => {
  it("renders the first-run empty state", () => {
    const html = renderToStaticMarkup(
      <ImportBatchTable
        batches={[]}
        filteredBatches={[]}
        isRefreshing={false}
        search=""
        providerFilter="all"
        statusFilter="all"
        onSearchChange={() => undefined}
        onProviderFilterChange={() => undefined}
        onStatusFilterChange={() => undefined}
      />
    );

    expect(html.includes("No imports yet")).toBe(true);
    expect(html.includes("Upload your first CSV")).toBe(true);
  });

  it("renders operational columns for recent batches", () => {
    const html = renderToStaticMarkup(
      <ImportBatchTable
        batches={[SAMPLE_BATCH]}
        filteredBatches={[SAMPLE_BATCH]}
        isRefreshing={true}
        search=""
        providerFilter="all"
        statusFilter="all"
        onSearchChange={() => undefined}
        onProviderFilterChange={() => undefined}
        onStatusFilterChange={() => undefined}
        onRetryBatch={() => undefined}
      />
    );

    expect(html.includes("TrackDrive")).toBe(true);
    expect(html.includes("Alex Operator")).toBe(true);
    expect(html.includes("Partial")).toBe(true);
    expect(html.includes("Refreshing active imports")).toBe(true);
    expect(html.includes("Retry")).toBe(true);
  });

  it("renders a filtered empty state when no rows match", () => {
    const html = renderToStaticMarkup(
      <ImportBatchTable
        batches={[SAMPLE_BATCH]}
        filteredBatches={[]}
        isRefreshing={false}
        search="missing"
        providerFilter="all"
        statusFilter="all"
        onSearchChange={() => undefined}
        onProviderFilterChange={() => undefined}
        onStatusFilterChange={() => undefined}
      />
    );

    expect(html.includes("No batches match the current filters")).toBe(true);
  });
});
