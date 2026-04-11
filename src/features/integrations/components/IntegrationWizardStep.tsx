import type { ReactNode } from "react";
import type { IntegrationWizardStepContent } from "../wizard-content";

interface Props extends IntegrationWizardStepContent {
  children?: ReactNode;
}

export function IntegrationWizardStep({ title, description, bullets, note, children }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm text-slate-300">{description}</p>
      </div>

      {bullets?.length ? (
        <ul className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300">
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      ) : null}

      {children}

      {note ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-400">
          {note}
        </div>
      ) : null}
    </div>
  );
}
