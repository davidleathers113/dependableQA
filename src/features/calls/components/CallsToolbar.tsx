import * as React from "react";
import type { CallFilterOptions, CallFilters } from "../../../lib/app-data";

interface Props {
  filters: CallFilters;
  options: CallFilterOptions;
  onChange: (filters: CallFilters) => void;
}

export function CallsToolbar({ filters, options, onChange }: Props) {
  const update = (key: keyof CallFilters, value: string) => {
    onChange({
      ...filters,
      [key]: value,
    });
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <input
          value={filters.search ?? ""}
          onChange={(event) => update("search", event.target.value)}
          className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 transition-all"
          placeholder="Search calls, transcripts, flags, campaigns..."
        />
        <select
          value={filters.reviewStatus ?? ""}
          onChange={(event) => update("reviewStatus", event.target.value)}
          className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All review states</option>
          <option value="unreviewed">Unreviewed</option>
          <option value="in_review">In review</option>
          <option value="reviewed">Reviewed</option>
          <option value="reopened">Reopened</option>
        </select>
        <select
          value={filters.publisherId ?? ""}
          onChange={(event) => update("publisherId", event.target.value)}
          className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All publishers</option>
          {options.publishers.map((publisher) => (
            <option key={publisher.id} value={publisher.id}>
              {publisher.name}
            </option>
          ))}
        </select>
        <select
          value={filters.campaignId ?? ""}
          onChange={(event) => update("campaignId", event.target.value)}
          className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All campaigns</option>
          {options.campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
        <select
          value={filters.disposition ?? ""}
          onChange={(event) => update("disposition", event.target.value)}
          className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All dispositions</option>
          {options.dispositions.map((disposition) => (
            <option key={disposition} value={disposition}>
              {disposition}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() =>
            onChange({
              search: "",
              reviewStatus: "",
              publisherId: "",
              campaignId: "",
              disposition: "",
              dateFrom: "",
              dateTo: "",
            })
          }
          className="h-10 rounded-xl border border-slate-700 px-4 text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
