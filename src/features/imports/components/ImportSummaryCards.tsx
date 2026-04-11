import type { ImportBatchSummary } from "../../../lib/app-data";
import { deriveImportSummarySnapshot } from "../helpers";

interface Props {
  batches: ImportBatchSummary[];
}

export function ImportSummaryCards({ batches }: Props) {
  const summary = deriveImportSummarySnapshot(batches);

  const cards = [
    {
      id: "total",
      label: "Recent Batches",
      value: summary.totalBatches.toLocaleString(),
      helper: "All batches in the current imports view.",
    },
    {
      id: "processing",
      label: "Processing",
      value: summary.processingBatches.toLocaleString(),
      helper: "Batches still moving through dispatch right now.",
    },
    {
      id: "failed",
      label: "Failed",
      value: summary.failedBatches.toLocaleString(),
      helper: "Batches that need operator review or retry.",
    },
    {
      id: "completed-today",
      label: "Completed Today",
      value: summary.completedToday.toLocaleString(),
      helper: "Completed batches created today in this recent queue.",
    },
  ];

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Import Snapshot</p>
        <p className="mt-1 text-sm text-slate-400">
          Operational totals across the recent imports queue shown below.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-white">{card.value}</p>
            <p className="mt-3 max-w-[24ch] text-xs leading-5 text-slate-400">{card.helper}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
