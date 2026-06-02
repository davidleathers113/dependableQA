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
import { summarizeAnalyzeResult, type AnalyzeSelectionSummary } from "./analyzeActions";
import { estimateBatchCostLabel } from "../billing/pricing";

interface Props {
  organizationId: string;
  userId: string;
  initialData: CallsPageData;
  /** Whether the current user's role may queue billable AI analysis. */
  canAnalyze: boolean;
  /** Org per-minute wallet rate (cents); 0 when analysis is not metered. */
  perMinuteRateCents: number;
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DEFAULT_VISIBLE_COLUMNS: CallsTableColumnKey[] = CALLS_TABLE_COLUMNS.map((column) => column.key);

function CallsPageInner({ organizationId, userId, initialData, canAnalyze, perMinuteRateCents }: Props) {
  const queryClient = useQueryClient();
  const [selectedCallId, setSelectedCallId] = React.useState<string | null>(null);
  const [analyzeSelection, setAnalyzeSelection] = React.useState<Set<string>>(new Set());
  const [analyzeNotice, setAnalyzeNotice] = React.useState("");
  const [analyzeError, setAnalyzeError] = React.useState("");
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

  const analyzeMutation = useMutation({
    mutationFn: async (callIds: string[]): Promise<AnalyzeSelectionSummary> => {
      const response = await fetch("/api/calls/analyze-selected", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callIds }),
      });
      const payload = (await response.json().catch(() => ({}))) as AnalyzeSelectionSummary & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to queue analysis.");
      }
      return payload;
    },
    onSuccess: async (payload) => {
      setAnalyzeError("");
      setAnalyzeNotice(summarizeAnalyzeResult(payload));
      setAnalyzeSelection(new Set());
      // New jobs change transcription/analysis state; refresh the queue.
      await queryClient.invalidateQueries({ queryKey: ["calls", organizationId] });
    },
    onError: (error) => {
      setAnalyzeNotice("");
      setAnalyzeError(error instanceof Error ? error.message : "Unable to queue analysis.");
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

  // The visible set changes with filters/sort, so a lingering selection of
  // off-view calls would be confusing — reset it (and any notices) on change.
  React.useEffect(() => {
    setAnalyzeSelection(new Set());
    setAnalyzeNotice("");
    setAnalyzeError("");
  }, [filters]);

  const rows = callsQuery.data.rows;
  const options = callsQuery.data.options;
  const summary = callsQuery.data.summary;
  const hasActiveFilters = Array.from(filtersToSearchParams(filters).keys()).length > 0;

  const selectedCount = analyzeSelection.size;
  const allRowsSelected = rows.length > 0 && rows.every((row) => analyzeSelection.has(row.id));
  // Estimate from the selected calls' actual durations × the org per-minute rate
  // (rounded up, 1-min minimum) — matches how the wallet actually settles.
  const selectedEstimateLabel = React.useMemo(
    () =>
      estimateBatchCostLabel(
        rows.filter((row) => analyzeSelection.has(row.id)).map((row) => row.durationSeconds),
        perMinuteRateCents
      ),
    [rows, analyzeSelection, perMinuteRateCents]
  );

  const toggleAnalyzeSelection = React.useCallback((callId: string) => {
    setAnalyzeSelection((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }
      return next;
    });
  }, []);

  const toggleAnalyzeSelectAll = React.useCallback(
    (checked: boolean) => {
      setAnalyzeSelection((prev) => {
        const next = new Set(prev);
        for (const row of rows) {
          if (checked) {
            next.add(row.id);
          } else {
            next.delete(row.id);
          }
        }
        return next;
      });
    },
    [rows]
  );

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

      {canAnalyze && selectedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/5 px-4 py-3">
          <div className="text-sm text-slate-200">
            <span className="font-semibold">{selectedCount}</span> call{selectedCount === 1 ? "" : "s"} selected
            <span className="ml-2 text-xs text-slate-400">
              {selectedEstimateLabel
                ? `Est. cost up to ${selectedEstimateLabel} — billed per minute of audio (rounded up); only calls still needing transcription are charged.`
                : "No per-minute rate configured — AI analysis isn't metered for this organization."}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAnalyzeSelection(new Set())}
              disabled={analyzeMutation.isPending}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-slate-400 disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => analyzeMutation.mutate(Array.from(analyzeSelection))}
              disabled={analyzeMutation.isPending}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analyzeMutation.isPending ? "Queueing…" : `Analyze ${selectedCount} selected`}
            </button>
          </div>
        </div>
      )}

      {analyzeNotice && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {analyzeNotice}
        </div>
      )}
      {analyzeError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {analyzeError}
        </div>
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
        selectable={canAnalyze}
        selectedIds={analyzeSelection}
        allSelected={allRowsSelected}
        onToggleSelect={toggleAnalyzeSelection}
        onToggleSelectAll={toggleAnalyzeSelectAll}
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
