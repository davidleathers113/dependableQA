import type { IntegrationProvider } from "../../../lib/app-data";
import { IMPORT_PROVIDER_OPTIONS } from "../helpers";

interface Props {
  value: IntegrationProvider;
  onChange: (provider: IntegrationProvider) => void;
  disabled?: boolean;
}

export function ImportProviderSelector({ value, onChange, disabled = false }: Props) {
  return (
    <label className="space-y-2 text-left">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Provider</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as IntegrationProvider)}
        disabled={disabled}
        className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition-colors focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {IMPORT_PROVIDER_OPTIONS.map((provider) => (
          <option key={provider.value} value={provider.value}>
            {provider.label}
          </option>
        ))}
      </select>
    </label>
  );
}
