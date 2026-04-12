import { X } from "lucide-react";
import type { ReactNode } from "react";

interface RingbaStage {
  label: string;
}

interface Props {
  isOpen: boolean;
  title: string;
  subtitle: string;
  currentStep: number;
  totalSteps: number;
  stages: RingbaStage[];
  currentStageIndex: number;
  nextLabel: string;
  canGoBack: boolean;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
  children: ReactNode;
}

export function RingbaSetupWizardLayout({
  isOpen,
  title,
  subtitle,
  currentStep,
  totalSteps,
  stages,
  currentStageIndex,
  nextLabel,
  canGoBack,
  onClose,
  onBack,
  onNext,
  children,
}: Props) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-175 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
          <div className="space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Integrations</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
              <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {stages.map((stage, index) => {
                const isActive = index === currentStageIndex;
                const isComplete = index < currentStageIndex;
                return (
                  <div
                    key={stage.label}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      isActive || isComplete
                        ? "border-violet-500/40 bg-violet-500/10 text-violet-100"
                        : "border-slate-700 bg-slate-950 text-slate-400"
                    }`}
                  >
                    {stage.label}
                  </div>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 p-2 text-slate-400 transition-colors hover:border-slate-600 hover:text-white"
            aria-label="Close Ringba setup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-h-90 rounded-3xl border border-slate-800 bg-slate-950/70 p-6">{children}</div>
          <aside className="space-y-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Progress</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {currentStep} <span className="text-slate-500">of {totalSteps}</span>
              </p>
            </div>
            <div className="space-y-2">
              {Array.from({ length: totalSteps }, (_, index) => {
                const isActive = index + 1 <= currentStep;
                return (
                  <div
                    key={index}
                    className={`h-1.5 rounded-full ${isActive ? "bg-violet-500" : "bg-slate-800"}`}
                  />
                );
              })}
            </div>
            <p className="text-sm text-slate-400">
              This guided flow matches the Ringba recording pixel setup path, including campaign assignment and the
              real-call verification step.
            </p>
          </aside>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-800 px-6 py-5">
          <button
            type="button"
            onClick={onBack}
            disabled={!canGoBack}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
