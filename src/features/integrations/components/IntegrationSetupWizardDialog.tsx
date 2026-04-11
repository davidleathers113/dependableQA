import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { IntegrationProvider } from "../../../lib/app-data";
import { getIntegrationProviderLabel } from "../helpers";

interface Props {
  isOpen: boolean;
  provider: IntegrationProvider;
  title: string;
  currentStep: number;
  totalSteps: number;
  nextLabel: string;
  canGoBack: boolean;
  canGoNext: boolean;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  children: ReactNode;
}

export function IntegrationSetupWizardDialog({
  isOpen,
  provider,
  title,
  currentStep,
  totalSteps,
  nextLabel,
  canGoBack,
  canGoNext,
  onClose,
  onBack,
  onNext,
  secondaryActionLabel,
  onSecondaryAction,
  children,
}: Props) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-140 rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              {getIntegrationProviderLabel(provider)} guided setup
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm text-slate-400">
              Step {currentStep} of {totalSteps}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 p-2 text-slate-400 transition-colors hover:border-slate-600 hover:text-white"
            aria-label="Close guided setup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-6">
          <div className="mb-6 flex gap-2">
            {Array.from({ length: totalSteps }, (_, index) => {
              const isActive = index + 1 <= currentStep;
              return (
                <div
                  key={index}
                  className={`h-1.5 flex-1 rounded-full ${isActive ? "bg-violet-500" : "bg-slate-800"}`}
                />
              );
            })}
          </div>

          <div className="min-h-60">{children}</div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 px-6 py-5">
          <div className="flex flex-wrap items-center justify-end gap-3">
            {secondaryActionLabel && onSecondaryAction ? (
              <button
                type="button"
                onClick={onSecondaryAction}
                className="text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200"
              >
                {secondaryActionLabel}
              </button>
            ) : null}
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
              disabled={!canGoNext}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
            >
              {nextLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
