import type { CallsSummary, CallFilters } from "../../../lib/app-data";

interface SummaryCard {
  id: string;
  label: string;
  value: string;
  helper: string;
  onClick: () => void;
}

interface Props {
  summary: CallsSummary;
  onApplyFilters: (filters: Partial<CallFilters>) => void;
}

export function CallsSummaryRow({ summary, onApplyFilters }: Props) {
  const cards: SummaryCard[] = [
    {
      id: "total",
      label: "All Calls",
      value: summary.totalCalls.toLocaleString(),
      helper: "Reset to the full calls queue.",
      onClick: () => onApplyFilters({ flaggedOnly: false, flagCategory: "", reviewStatus: undefined, publisherId: "" }),
    },
    {
      id: "needs-review",
      label: "Needs Review",
      value: summary.needsReviewCount.toLocaleString(),
      helper: "Jump to calls not yet fully reviewed.",
      onClick: () => onApplyFilters({ reviewStatus: "unreviewed", flaggedOnly: false, flagCategory: "" }),
    },
    {
      id: "flagged",
      label: "Flagged Calls",
      value: summary.flaggedCalls.toLocaleString(),
      helper: "Open-flag calls only.",
      onClick: () => onApplyFilters({ flaggedOnly: true, flagCategory: "" }),
    },
    {
      id: "compliance",
      label: "Compliance Flags",
      value: summary.complianceFlagCount.toLocaleString(),
      helper: "Calls with open compliance flags.",
      onClick: () => onApplyFilters({ flaggedOnly: true, flagCategory: "compliance" }),
    },
    {
      id: "publisher",
      label: "Top Flagged Publisher",
      value: summary.topFlaggedPublisher ? summary.topFlaggedPublisher.publisherName : "No publisher data",
      helper: summary.topFlaggedPublisher
        ? `${summary.topFlaggedPublisher.flaggedCalls} flagged / ${summary.topFlaggedPublisher.totalCalls} total`
        : "No flagged publisher outlier yet.",
      onClick: () =>
        onApplyFilters({
          flaggedOnly: true,
          flagCategory: "",
          publisherId: summary.topFlaggedPublisher?.publisherId ?? "",
        }),
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Queue Snapshot</p>
          <p className="mt-1 text-sm text-slate-400">
            Jump into the highest-value slices of the calls queue with one click.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={card.onClick}
          className="group rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-slate-700 hover:bg-slate-900"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-500 transition-colors group-hover:border-violet-500/40 group-hover:text-violet-300">
              Filter
            </span>
          </div>
          <p className="mt-4 text-2xl font-semibold tracking-tight text-white">{card.value}</p>
          <p className="mt-3 max-w-[24ch] text-xs leading-5 text-slate-400">{card.helper}</p>
        </button>
      ))}
      </div>
    </section>
  );
}
