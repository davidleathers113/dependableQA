import { Play, Save } from "lucide-react";
import { StatusMessage } from "../../../components/ui/StatusMessage";
import {
  DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE,
  DEFAULT_RINGBA_MINIMUM_DURATION_SECONDS,
  RINGBA_API_LOOKBACK_DEFAULT_HOURS,
  RINGBA_API_POLL_INTERVAL_DEFAULT_MINUTES,
  RINGBA_API_POLL_INTERVAL_MAX_MINUTES,
  RINGBA_API_POLL_INTERVAL_MIN_MINUTES,
} from "../../../lib/integration-config";
import type { RingbaApiSyncForm, RingbaApiSyncFormInput } from "../hooks/useRingbaApiSyncForm";

interface Props {
  form: RingbaApiSyncForm;
  canManage: boolean;
  isConfigured: boolean;
  isCreating: boolean;
  isSaving: boolean;
  isSyncing: boolean;
  onSave: (input: RingbaApiSyncFormInput) => void;
  onSyncNow: () => void;
}

export function RingbaAdvancedSyncFields({
  form,
  canManage,
  isConfigured,
  isCreating,
  isSaving,
  isSyncing,
  onSave,
  onSyncNow,
}: Props) {
  const disabled = !canManage || isSaving || !isConfigured || isCreating;

  function handleSave() {
    const input = form.buildSaveInput();
    if (input) {
      onSave(input);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div>
        <h3 className="text-lg font-semibold text-white">Advanced sync settings</h3>
        <p className="mt-1 text-sm text-slate-400">
          Schedule automatic Call Logs syncs and tune how DependableQA polls Ringba. Defaults are conservative — raise
          the frequency only if you respect Ringba’s rate limits.
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(event) => form.setEnabled(event.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-slate-600 text-violet-500 focus:ring-violet-500 disabled:opacity-50"
        />
        <span className="text-sm text-slate-200">Enable scheduled Call Logs sync</span>
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Call logs time zone (IANA)</span>
          <select
            value={form.timeZone || DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE}
            onChange={(event) => form.setTimeZone(event.target.value)}
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          >
            {form.timeZoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Minimum minutes between syncs</span>
          <input
            type="number"
            min={RINGBA_API_POLL_INTERVAL_MIN_MINUTES}
            max={RINGBA_API_POLL_INTERVAL_MAX_MINUTES}
            value={form.pollMinutes}
            onChange={(event) => form.setPollMinutes(Number(event.target.value))}
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
          <span className="text-xs text-slate-500">
            Default {RINGBA_API_POLL_INTERVAL_DEFAULT_MINUTES}. The platform checks every few minutes; effective spacing
            is the larger of that and this value.
          </span>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Lookback window (hours)</span>
          <input
            type="number"
            min={1}
            max={168}
            value={form.lookback}
            onChange={(event) => form.setLookback(Number(event.target.value))}
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
          <span className="text-xs text-slate-500">
            Default {RINGBA_API_LOOKBACK_DEFAULT_HOURS} hours of call log range per request (smaller windows reduce load).
          </span>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Minimum call duration (seconds)</span>
          <input
            type="number"
            min={0}
            value={form.minDuration}
            onChange={(event) => form.setMinDuration(Number(event.target.value))}
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
          <span className="text-xs text-slate-500">
            Default {DEFAULT_RINGBA_MINIMUM_DURATION_SECONDS}s. Calls shorter than this are skipped on sync and import.
          </span>
        </label>
      </div>

      {form.validationMessage ? <StatusMessage tone="error">{form.validationMessage}</StatusMessage> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" aria-hidden />
          {isSaving ? "Saving…" : "Save settings"}
        </button>
        <button
          type="button"
          onClick={onSyncNow}
          disabled={disabled || isSyncing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-violet-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-4 w-4" aria-hidden />
          {isSyncing ? "Syncing…" : "Run sync now"}
        </button>
      </div>
    </section>
  );
}
