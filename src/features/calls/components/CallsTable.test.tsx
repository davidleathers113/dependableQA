import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CallListItem } from "../../../types/domain";
import { CALLS_TABLE_COLUMNS, CallsTable, type CallsTableColumnKey } from "./CallsTable";

const ALL_COLUMNS: CallsTableColumnKey[] = CALLS_TABLE_COLUMNS.map((column) => column.key);

const ROW: CallListItem = {
  id: "call_1",
  callerNumber: "+15551230000",
  startedAt: "2026-06-01T12:00:00.000Z",
  durationSeconds: 90,
  campaignName: "Alpha",
  publisherName: "Pub",
  currentDisposition: null,
  currentReviewStatus: "unreviewed",
  flagCount: 0,
  topFlag: null,
  sourceProvider: "ringba",
  importBatchId: null,
  importBatchFilename: null,
  reviewedByName: null,
  lastUpdatedAt: "2026-06-01T12:05:00.000Z",
};

function render(props: Partial<Parameters<typeof CallsTable>[0]>) {
  return renderToStaticMarkup(
    <CallsTable
      rows={[ROW]}
      visibleColumns={ALL_COLUMNS}
      density="comfortable"
      isLoading={false}
      emptyMessage="empty"
      sortBy="startedAt"
      sortDirection="desc"
      onSortChange={() => {}}
      onRowClick={() => {}}
      {...props}
    />
  );
}

describe("CallsTable selection column", () => {
  it("omits checkboxes when selection is disabled", () => {
    const html = render({ selectable: false });
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("Select all calls for analysis");
  });

  it("renders a select-all header and a per-row checkbox when selectable", () => {
    const html = render({ selectable: true, selectedIds: new Set<string>(), allSelected: false });
    expect(html).toContain("Select all calls for analysis");
    expect(html).toContain("Select call +15551230000 for analysis");
  });

  it("reflects the selected and select-all state as checked", () => {
    const checkedAll = render({
      selectable: true,
      selectedIds: new Set<string>(["call_1"]),
      allSelected: true,
    });
    // Two checked inputs: the header (all selected) and the row.
    expect(checkedAll.split("checked=").length - 1).toBe(2);

    const noneChecked = render({
      selectable: true,
      selectedIds: new Set<string>(),
      allSelected: false,
    });
    expect(noneChecked).not.toContain("checked=");
  });
});
