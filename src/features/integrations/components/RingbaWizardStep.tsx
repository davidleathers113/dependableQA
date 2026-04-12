import type { ReactNode } from "react";
import type { RingbaWizardStepContent } from "../wizard-content";
import { CopyField } from "./CopyField";

interface Props {
  step: RingbaWizardStepContent;
  codeValue?: string;
  onCopied?: (message: string) => void;
  children?: ReactNode;
}

export function RingbaWizardStep({ step, codeValue = "", onCopied, children }: Props) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">{step.sectionLabel}</p>
        <div>
          <h3 className="text-xl font-semibold text-white">{step.title}</h3>
          {step.description ? <p className="mt-2 text-sm text-slate-300">{step.description}</p> : null}
        </div>
        {step.emphasis ? (
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100">
            {step.emphasis}
          </div>
        ) : null}
      </div>

      {children}

      {step.codeLabel ? (
        <CopyField
          label={step.codeLabel}
          value={codeValue}
          copyLabel={step.showCopyButton ? "Copy URL" : "Copy"}
          copiedLabel="Copied"
          onCopied={onCopied}
        />
      ) : null}

      {step.bullets?.length ? (
        <ul className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300">
          {step.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}

      {step.screenshotSrc ? (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
          <img src={step.screenshotSrc} alt={step.screenshotAlt ?? step.title} className="h-auto w-full object-cover" />
        </div>
      ) : null}

      {step.note ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-400">
          {step.note}
        </div>
      ) : null}
    </div>
  );
}
