import type { SetupChecklist, SetupStepKey } from "../../lib/app-data";

interface StepCopy {
  title: string;
  description: string;
  cta: string;
  href: string;
}

// Display copy + deep links for each setup step. Kept here (not in app-data) so
// the data layer stays presentation-free; the order follows the checklist's
// `steps` array, which app-data guarantees.
const STEP_COPY: Record<SetupStepKey, StepCopy> = {
  funds: {
    title: "Add funds to your wallet",
    description: "AI transcription and analysis draw from a prepaid balance. Add funds so calls can be analyzed.",
    cta: "Go to billing",
    href: "/app/billing",
  },
  source: {
    title: "Connect a provider or import calls",
    description: "Connect Ringba, Retreaver, or TrackDrive for live calls, or upload a CSV export to get started fast.",
    cta: "Connect a provider",
    href: "/app/integrations",
  },
  analyze: {
    title: "Run AI analysis on your calls",
    description: "Imported calls carry recordings and metadata. Analyze them to generate transcripts, summaries, and flags.",
    cta: "Open calls",
    href: "/app/calls",
  },
  review: {
    title: "Complete your first review",
    description: "Open a call, listen, flag key moments, and confirm a disposition to finish the QA loop.",
    cta: "Review a call",
    href: "/app/calls",
  },
};

interface Props {
  setup: SetupChecklist;
}

/**
 * First-run "Getting started" checklist shown at the top of the Overview page.
 * Renders nothing once every step is done, so established orgs see the normal
 * dashboard. Done-state is derived server-side (see `deriveSetupChecklist`);
 * this component is purely presentational.
 */
export default function GettingStartedChecklist({ setup }: Props) {
  if (setup.complete) {
    return null;
  }

  return (
    <section
      aria-labelledby="getting-started-heading"
      className="p-6 rounded-2xl bg-slate-900 border border-violet-500/30 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="getting-started-heading" className="text-lg font-semibold text-white">
            Getting started
          </h2>
          <p className="text-sm text-slate-400">Finish setting up your workspace to start reviewing calls.</p>
        </div>
        <span className="text-sm font-medium text-violet-300">
          {setup.completedCount} of {setup.totalCount} complete
        </span>
      </div>

      <ol className="space-y-3">
        {setup.steps.map((step, index) => {
          const copy = STEP_COPY[step.key];
          return (
            <li
              key={step.key}
              className={`flex items-start gap-4 p-4 rounded-xl border ${
                step.done ? "border-slate-800 bg-slate-900/40" : "border-slate-700 bg-slate-800/40"
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  step.done ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"
                }`}
              >
                {step.done ? "✓" : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${step.done ? "text-slate-400 line-through" : "text-white"}`}>
                  {copy.title}
                </p>
                {!step.done && <p className="mt-1 text-xs text-slate-400">{copy.description}</p>}
              </div>
              {step.done ? (
                <span className="shrink-0 self-center text-xs font-medium text-emerald-300">Done</span>
              ) : (
                <a
                  href={copy.href}
                  className="shrink-0 self-center rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500"
                >
                  {copy.cta}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
