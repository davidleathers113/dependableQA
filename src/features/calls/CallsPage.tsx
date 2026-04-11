import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import {
  DEFAULT_CALL_FILTERS,
  buildCallFilters,
  createCallSavedView,
  deleteCallSavedView,
  filtersToSearchParams,
  getCallsPageData,
  getCallSavedViews,
  normalizeCallFilters,
  type CallFilters,
  type CallsPageData,
} from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";
import { CallsToolbar } from "./components/CallsToolbar";
import { CALLS_TABLE_COLUMNS, CallsTable, type CallsTableColumnKey } from "./components/CallsTable";
import { CallDetailDrawer } from "./components/CallDetailDrawer";
import { CallsSummaryRow } from "./components/CallsSummaryRow";
import { SavedViewsBar } from "./components/SavedViewsBar";

interface Props {
  organizationId: string;
  userId: string;
  initialData: CallsPageData;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DEFAULT_VISIBLE_COLUMNS: CallsTableColumnKey[] = CALLS_TABLE_COLUMNS.map((column) => column.key);

function CallsPageInner({ organizationId, userId, initialData }: Props) {
  const queryClient = useQueryClient();
  const [selectedCallId, setSelectedCallId] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState(normalizeCallFilters(initialData.filters));
  const [density, setDensity] = React.useState<"comfortable" | "compact">("comfortable");
  const [visibleColumns, setVisibleColumns] = React.useState<CallsTableColumnKey[]>(DEFAULT_VISIBLE_COLUMNS);
  const [activePresetId, setActivePresetId] = React.useState<string | null>("all");
  const [activeSavedViewId, setActiveSavedViewId] = React.useState<string | null>(null);

  const presets = React.useMemo(() => {
    const today = formatDateInput(new Date());
    const now = new Date();
    const monthStart = formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1));

    return [
      { id: "all", label: "All Calls", filters: DEFAULT_CALL_FILTERS },
      { id: "flagged", label: "Flagged", filters: { ...DEFAULT_CALL_FILTERS, flaggedOnly: true } },
      { id: "needs-review", label: "Needs Review", filters: { ...DEFAULT_CALL_FILTERS, reviewStatus: "unreviewed" as const } },
      { id: "today", label: "Today", filters: { ...DEFAULT_CALL_FILTERS, dateFrom: today, dateTo: today } },
      { id: "this-month", label: "This Month", filters: { ...DEFAULT_CALL_FILTERS, dateFrom: monthStart } },
      { id: "compliance", label: "Compliance", filters: { ...DEFAULT_CALL_FILTERS, flaggedOnly: true, flagCategory: "compliance" } },
    ];
  }, []);

  const callsQuery = useQuery({
    queryKey: ["calls", organizationId, filters],
    queryFn: () => getCallsPageData(getBrowserSupabase(), organizationId, filters),
    initialData,
  });

  const savedViewsQuery = useQuery({
    queryKey: ["saved-views", organizationId, userId],
    queryFn: () => getCallSavedViews(getBrowserSupabase(), organizationId, userId),
  });

  const saveViewMutation = useMutation({
    mutationFn: async (name: string) =>
      createCallSavedView(getBrowserSupabase(), {
        organizationId,
        userId,
        name,
        config: {
          filters,
          density,
          visibleColumns,
        },
      }),
    onSuccess: async (savedView) => {
      setActivePresetId(null);
      setActiveSavedViewId(savedView.id);
      await queryClient.invalidateQueries({ queryKey: ["saved-views", organizationId, userId] });
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: async (savedViewId: string) =>
      deleteCallSavedView(getBrowserSupabase(), organizationId, savedViewId),
    onSuccess: async (_, savedViewId) => {
      if (activeSavedViewId === savedViewId) {
        setActiveSavedViewId(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["saved-views", organizationId, userId] });
    },
  });

  const applyFilters = React.useCallback((nextFilters: CallFilters) => {
    setActivePresetId(null);
    setActiveSavedViewId(null);
    setFilters(normalizeCallFilters(nextFilters));
  }, []);

  React.useEffect(() => {
    const params = filtersToSearchParams(filters);
    const target = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, "", target);
  }, [filters]);

  React.useEffect(() => {
    const handlePopState = () => {
      setFilters(buildCallFilters(new URLSearchParams(window.location.search)));
      setActivePresetId(null);
      setActiveSavedViewId(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const rows = callsQuery.data.rows;
  const options = callsQuery.data.options;
  const summary = callsQuery.data.summary;
  const hasActiveFilters = Array.from(filtersToSearchParams(filters).keys()).length > 0;

  const exportCsv = () => {
    const orderedColumns = CALLS_TABLE_COLUMNS.filter((column) => visibleColumns.includes(column.key));
    const headerRow = orderedColumns.map((column) => column.label);
    const csvRows = rows.map((row) =>
      orderedColumns.map((column) => {
        let value = "";
        if (column.key === "dateTime") value = row.startedAt;
        if (column.key === "callerNumber") value = row.callerNumber;
        if (column.key === "campaign") value = row.campaignName ?? "";
        if (column.key === "publisher") value = row.publisherName ?? "";
        if (column.key === "duration") value = String(row.durationSeconds);
        if (column.key === "disposition") value = row.currentDisposition ?? "";
        if (column.key === "review") value = row.currentReviewStatus;
        if (column.key === "flags") value = String(row.flagCount);
        if (column.key === "topFlag") value = row.topFlag ?? "";
        if (column.key === "sourceProvider") value = row.sourceProvider;
        if (column.key === "importBatch") value = row.importBatchFilename ?? row.importBatchId ?? "";
        if (column.key === "reviewedBy") value = row.reviewedByName ?? "";
        if (column.key === "lastUpdated") value = row.lastUpdatedAt;

        return `"${value.split('"').join('""')}"`;
      }).join(",")
    );

    const csv = [headerRow.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "calls-export.csv";
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleSortChange = (sortBy: "startedAt" | "durationSeconds" | "flagCount" | "updatedAt") => {
    applyFilters({
      ...filters,
      sortBy,
      sortDirection: filters.sortBy === sortBy && filters.sortDirection === "desc" ? "asc" : "desc",
    });
  };

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
          <p className="text-sm text-slate-400">
            Search, review, and audit AI-classified calls.
          </p>
        </div>
      </header>

      <CallsSummaryRow
        summary={summary}
        onApplyFilters={(partialFilters) =>
          applyFilters({
            ...filters,
            ...partialFilters,
          })
        }
      />

      <SavedViewsBar
        presets={presets}
        savedViews={savedViewsQuery.data ?? []}
        activePresetId={activePresetId}
        activeSavedViewId={activeSavedViewId}
        isSaving={saveViewMutation.isPending}
        isDeleting={deleteViewMutation.isPending}
        density={density}
        onSelectPreset={(preset) => {
          setActivePresetId(preset.id);
          setActiveSavedViewId(null);
          setFilters(normalizeCallFilters(preset.filters));
        }}
        onSelectSavedView={(savedView) => {
          setActivePresetId(null);
          setActiveSavedViewId(savedView.id);
          setFilters(normalizeCallFilters(savedView.config.filters));
          setDensity(savedView.config.density ?? "comfortable");
          setVisibleColumns(
            savedView.config.visibleColumns && savedView.config.visibleColumns.length > 0
              ? (savedView.config.visibleColumns.filter((entry): entry is CallsTableColumnKey =>
                  CALLS_TABLE_COLUMNS.some((column) => column.key === entry)
                ) as CallsTableColumnKey[])
              : DEFAULT_VISIBLE_COLUMNS
          );
        }}
        onSaveView={(name) => saveViewMutation.mutate(name)}
        onDeleteView={(savedViewId) => deleteViewMutation.mutate(savedViewId)}
      />

      <CallsToolbar
        filters={filters}
        options={options}
        onChange={applyFilters}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={setVisibleColumns}
        density={density}
        onDensityChange={setDensity}
        onExport={exportCsv}
      />

      {callsQuery.isFetching && (
        <p className="text-sm text-slate-500">Refreshing calls...</p>
      )}

      <CallsTable
        rows={rows}
        visibleColumns={visibleColumns}
        density={density}
        isLoading={callsQuery.isLoading}
        emptyMessage={
          hasActiveFilters
            ? "No calls matched the current filters. Clear or adjust the filters to widen the queue."
            : "No calls found yet. Import a batch or connect an integration."
        }
        sortBy={filters.sortBy ?? "startedAt"}
        sortDirection={filters.sortDirection ?? "desc"}
        onSortChange={handleSortChange}
        onRowClick={(row) => setSelectedCallId(row.id)}
      />

      <CallDetailDrawer
        organizationId={organizationId}
        callId={selectedCallId}
        open={Boolean(selectedCallId)}
        onOpenChange={(open) => {
          if (!open) setSelectedCallId(null);
        }}
      />
    </section>
  );
}

export default function CallsPage(props: Props) {
  return (
    <QueryProvider>
      <CallsPageInner {...props} />
    </QueryProvider>
  );
}
