import type { IntegrationProvider } from "../../../lib/app-data";
import { IMPORT_PROVIDER_OPTIONS } from "../helpers";

interface Props {
  provider: IntegrationProvider;
  onChange: (provider: IntegrationProvider) => void;
  disabled?: boolean;
}

export function ImportProviderSelector({ provider, onChange, disabled = false }: Props) {
  return (
    <div className="space-y-3 text-left">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Provider format</span>
      <div className="hidden flex-wrap gap-2 sm:flex">
        {IMPORT_PROVIDER_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              provider === option.value
                ? "border-violet-500/40 bg-violet-500/10 text-violet-200"
                : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <select
        value={provider}
        onChange={(event) => onChange(event.target.value as IntegrationProvider)}
        disabled={disabled}
        className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition-colors focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-70 sm:hidden"
      >
        {IMPORT_PROVIDER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
