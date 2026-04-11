import {
  DEFAULT_CALL_FILTERS,
  type CallFilterOptions,
  type CallFilters,
  type CallTableDensity,
} from "../../../lib/app-data";
import { CALLS_TABLE_COLUMNS, type CallsTableColumnKey } from "./CallsTable";

interface Props {
  filters: CallFilters;
  options: CallFilterOptions;
  onChange: (filters: CallFilters) => void;
  visibleColumns: CallsTableColumnKey[];
  onVisibleColumnsChange: (columns: CallsTableColumnKey[]) => void;
  density: CallTableDensity;
  onDensityChange: (density: CallTableDensity) => void;
  onExport: () => void;
}

function formatFilterChipLabel(key: string, value: string) {
  if (key === "reviewStatus") return `Review: ${value}`;
  if (key === "publisherId") return `Publisher: ${value}`;
  if (key === "campaignId") return `Campaign: ${value}`;
  if (key === "disposition") return `Disposition: ${value}`;
  if (key === "dateFrom") return `From: ${value}`;
  if (key === "dateTo") return `To: ${value}`;
  if (key === "flagCategory") return `Flag type: ${value}`;
  return value;
}

export function CallsToolbar({
  filters,
  options,
  onChange,
  visibleColumns,
  onVisibleColumnsChange,
  density,
  onDensityChange,
  onExport,
}: Props) {
  const update = (key: keyof CallFilters, value: string) => {
    onChange({
      ...filters,
      [key]: value,
    });
  };

  const updateBoolean = (key: keyof CallFilters, value: boolean) => {
    onChange({
      ...filters,
      [key]: value,
    });
  };

  const toggleColumn = (column: CallsTableColumnKey) => {
    if (visibleColumns.includes(column)) {
      onVisibleColumnsChange(visibleColumns.filter((entry) => entry !== column));
      return;
    }

    onVisibleColumnsChange([...visibleColumns, column]);
  };

  const activeFilterEntries = Object.entries(filters).filter(([key, rawValue]) => {
    if (typeof rawValue === "boolean") {
      return rawValue;
    }

    if (key === "sortBy" || key === "sortDirection") {
      return false;
    }

    return typeof rawValue === "string" && rawValue.trim().length > 0;
  });

  const publisherNameById = new Map(options.publishers.map((publisher) => [publisher.id, publisher.name]));
  const campaignNameById = new Map(options.campaigns.map((campaign) => [campaign.id, campaign.name]));

  const resolveFilterChipValue = (key: string, rawValue: string) => {
    if (key === "publisherId") {
      return publisherNameById.get(rawValue) ?? rawValue;
    }

    if (key === "campaignId") {
      return campaignNameById.get(rawValue) ?? rawValue;
    }

    return rawValue;
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Queue Controls</p>
            <p className="mt-1 text-sm text-slate-400">
              Narrow the queue by time, review state, source quality, and operational metadata.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onExport}
              className="h-10 rounded-xl border border-slate-700 px-4 text-sm font-medium text-slate-300 hover:border-slate-600 hover:bg-slate-800 transition-colors"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => onChange(DEFAULT_CALL_FILTERS)}
              className="h-10 rounded-xl border border-slate-700 px-4 text-sm font-medium text-slate-300 hover:border-slate-600 hover:bg-slate-800 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)]">
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.8fr)_repeat(2,minmax(0,1fr))]">
              <label className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Search</span>
                <input
                  value={filters.search ?? ""}
                  onChange={(event) => update("search", event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                  placeholder="Search calls, transcripts, flags, campaigns..."
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">From</span>
                <input
                  type="date"
                  value={filters.dateFrom ?? ""}
                  onChange={(event) => update("dateFrom", event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">To</span>
                <input
                  type="date"
                  value={filters.dateTo ?? ""}
                  onChange={(event) => update("dateTo", event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Review State</span>
                <select
                  value={filters.reviewStatus ?? ""}
                  onChange={(event) => update("reviewStatus", event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">All review states</option>
                  <option value="unreviewed">Unreviewed</option>
                  <option value="in_review">In review</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="reopened">Reopened</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Publisher</span>
                <select
                  value={filters.publisherId ?? ""}
                  onChange={(event) => update("publisherId", event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">All publishers</option>
                  {options.publishers.map((publisher) => (
                    <option key={publisher.id} value={publisher.id}>
                      {publisher.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Campaign</span>
                <select
                  value={filters.campaignId ?? ""}
                  onChange={(event) => update("campaignId", event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">All campaigns</option>
                  {options.campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Disposition</span>
                <select
                  value={filters.disposition ?? ""}
                  onChange={(event) => update("disposition", event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="">All dispositions</option>
                  {options.dispositions.map((disposition) => (
                    <option key={disposition} value={disposition}>
                      {disposition}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Display And Queue Tools</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sort Field</span>
                <select
                  value={filters.sortBy ?? "startedAt"}
                  onChange={(event) => update("sortBy", event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="startedAt">Started</option>
                  <option value="updatedAt">Last updated</option>
                  <option value="durationSeconds">Duration</option>
                  <option value="flagCount">Open flags</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sort Direction</span>
                <select
                  value={filters.sortDirection ?? "desc"}
                  onChange={(event) => update("sortDirection", event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(filters.flaggedOnly)}
              onChange={(event) => updateBoolean("flaggedOnly", event.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950"
            />
            Flagged only
          </label>

              <select
                value={filters.flagCategory ?? ""}
                onChange={(event) => update("flagCategory", event.target.value)}
                className="h-10 min-w-40 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">All flag categories</option>
                <option value="compliance">Compliance</option>
              </select>

              <div className="inline-flex rounded-xl border border-slate-700 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => onDensityChange("comfortable")}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${density === "comfortable" ? "bg-violet-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
                >
                  Comfortable
                </button>
                <button
                  type="button"
                  onClick={() => onDensityChange("compact")}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${density === "compact" ? "bg-violet-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
                >
                  Compact
                </button>
              </div>

              <details className="relative">
                <summary className="flex h-10 cursor-pointer list-none items-center rounded-xl border border-slate-700 px-4 text-sm text-slate-300 hover:bg-slate-800">
                  Columns
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-slate-800 bg-slate-950 p-3 shadow-2xl">
                  <div className="space-y-2">
                    {CALLS_TABLE_COLUMNS.map((column) => (
                      <label key={column.key} className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(column.key)}
                          onChange={() => toggleColumn(column.key)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                        />
                        {column.label}
                      </label>
                    ))}
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>

      {activeFilterEntries.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
          {activeFilterEntries.map(([key, rawValue]) => {
            const resolvedValue =
              typeof rawValue === "boolean" ? "true" : resolveFilterChipValue(key, String(rawValue));
            const label =
              typeof rawValue === "boolean"
                ? "Flagged only"
                : formatFilterChipLabel(key, resolvedValue);

            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    [key]: typeof rawValue === "boolean" ? false : "",
                  })
                }
                className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600 hover:bg-slate-800"
              >
                {label} ×
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
