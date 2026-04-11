import type { IntegrationProvider } from "../../../lib/app-data";
import { getImportProviderHelp, getImportProviderLabel } from "../helpers";

interface Props {
  provider: IntegrationProvider;
}

export function ImportProviderHelp({ provider }: Props) {
  const isCustom = provider === "custom";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-left">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {getImportProviderLabel(provider)} Guidance
      </p>
      <p className="mt-2 text-sm text-slate-300">{getImportProviderHelp(provider)}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        <a
          href="/imports/custom-template.csv"
          className="font-semibold text-violet-300 transition-colors hover:text-violet-200"
        >
          {isCustom ? "Download template CSV" : "Download normalized template"}
        </a>
        <a
          href="/imports/custom-sample.csv"
          className="font-semibold text-violet-300 transition-colors hover:text-violet-200"
        >
          {isCustom ? "Download sample CSV" : "View sample normalized export"}
        </a>
      </div>
    </div>
  );
}
