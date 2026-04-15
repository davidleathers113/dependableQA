import * as React from "react";
import { CloudDownload, Play, Save } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";
import {
  DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE,
  RINGBA_API_LOOKBACK_DEFAULT_HOURS,
  RINGBA_API_POLL_INTERVAL_DEFAULT_MINUTES,
  RINGBA_API_POLL_INTERVAL_MAX_MINUTES,
  RINGBA_API_POLL_INTERVAL_MIN_MINUTES,
} from "../../../lib/integration-config";

export interface RingbaApiSyncFormInput {
  ringbaApiSyncEnabled: boolean;
  ringbaAccountId: string;
  apiAccessToken: string;
  callLogsTimeZone: string;
  pollIntervalMinutes: number;
  lookbackHours: number;
}

interface Props {
  integration: IntegrationCard;
  canManage: boolean;
  isSaving: boolean;
  isCreating: boolean;
  isSyncing: boolean;
  onSave: (input: RingbaApiSyncFormInput) => void;
  onSyncNow: () => void;
}

export function RingbaApiSyncPanel({
  integration,
  canManage,
  isSaving,
  isCreating,
  isSyncing,
  onSave,
  onSyncNow,
}: Props) {
  const rb = integration.ringba;
  const [enabled, setEnabled] = React.useState(rb.ringbaApiSyncEnabled);
  const [accountId, setAccountId] = React.useState(rb.ringbaAccountId);
  const [apiToken, setApiToken] = React.useState("");
  const [timeZone, setTimeZone] = React.useState(
    rb.callLogsTimeZone || DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE
  );
  const [pollMinutes, setPollMinutes] = React.useState(rb.pollIntervalMinutes);
  const [lookback, setLookback] = React.useState(rb.lookbackHours);
  const [validationMessage, setValidationMessage] = React.useState("");

  React.useEffect(() => {
    setEnabled(integration.ringba.ringbaApiSyncEnabled);
    setAccountId(integration.ringba.ringbaAccountId);
    setApiToken("");
    setTimeZone(integration.ringba.callLogsTimeZone || DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE);
    setPollMinutes(integration.ringba.pollIntervalMinutes);
    setLookback(integration.ringba.lookbackHours);
    setValidationMessage("");
  }, [
    integration.id,
    integration.ringba.ringbaApiSyncEnabled,
    integration.ringba.ringbaAccountId,
    integration.ringba.callLogsTimeZone,
    integration.ringba.pollIntervalMinutes,
    integration.ringba.lookbackHours,
  ]);

  const lastSyncLabel = integration.ringba.lastRingbaApiSyncAt
    ? new Date(integration.ringba.lastRingbaApiSyncAt).toLocaleString()
    : "Never";

  const handleSave = React.useCallback(() => {
    const nextAccount = accountId.trim();
    const nextTz = timeZone.trim() || DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE;
    const nextPoll = Math.round(Number(pollMinutes));
    const nextLookback = Math.round(Number(lookback));

    if (enabled) {
      if (!nextAccount) {
        setValidationMessage("Ringba account id is required when API sync is enabled.");
        return;
      }
      if (!integration.ringba.apiTokenConfigured && !apiToken.trim()) {
        setValidationMessage("API access token is required when enabling sync (paste the token from Ringba).");
        return;
      }
    }

    if (!Number.isFinite(nextPoll) || nextPoll < RINGBA_API_POLL_INTERVAL_MIN_MINUTES) {
      setValidationMessage(
        `Poll interval must be between ${RINGBA_API_POLL_INTERVAL_MIN_MINUTES} and ${RINGBA_API_POLL_INTERVAL_MAX_MINUTES} minutes.`
      );
      return;
    }

    if (!Number.isFinite(nextLookback) || nextLookback < 1) {
      setValidationMessage("Lookback hours must be at least 1.");
      return;
    }

    setValidationMessage("");
    onSave({
      ringbaApiSyncEnabled: enabled,
      ringbaAccountId: nextAccount,
      apiAccessToken: apiToken.trim(),
      callLogsTimeZone: nextTz,
      pollIntervalMinutes: nextPoll,
      lookbackHours: nextLookback,
    });
  }, [
    accountId,
    apiToken,
    enabled,
    integration.ringba.apiTokenConfigured,
    lookback,
    onSave,
    pollMinutes,
    timeZone,
  ]);

  const disabled = !canManage || isSaving || !integration.isConfigured || isCreating;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div>
        <div className="flex items-center gap-2 text-slate-300">
          <CloudDownload className="h-4 w-4" />
          <h3 className="text-lg font-semibold text-white">Ringba API sync (recordings)</h3>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Pull completed calls that have recordings from Ringba Call Logs on a schedule. This complements the real-time
          pixel: the platform checks at most every five minutes, while your poll interval controls how often a sync is
          allowed to call Ringba (respect Ringba rate limits—defaults are conservative).
        </p>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-slate-600 text-violet-500 focus:ring-violet-500 disabled:opacity-50"
        />
        <span className="text-sm text-slate-200">Enable scheduled Call Logs sync</span>
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ringba account id</span>
          <input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="RA…"
            autoComplete="off"
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            API access token (leave blank to keep existing)
          </span>
          <input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            autoComplete="new-password"
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
          <span className="text-xs text-slate-500">
            Token configured: {integration.ringba.apiTokenConfigured ? "yes" : "no"}
          </span>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Call logs time zone (IANA)
          </span>
          <input
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            placeholder={DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE}
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Minimum minutes between syncs
          </span>
          <input
            type="number"
            min={RINGBA_API_POLL_INTERVAL_MIN_MINUTES}
            max={RINGBA_API_POLL_INTERVAL_MAX_MINUTES}
            value={pollMinutes}
            onChange={(e) => setPollMinutes(Number(e.target.value))}
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
          <span className="text-xs text-slate-500">
            Default {RINGBA_API_POLL_INTERVAL_DEFAULT_MINUTES}. Netlify runs a check every 5 minutes; effective spacing is
            the larger of that and this value.
          </span>
        </label>
      </div>

      <label className="space-y-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Lookback window (hours)
        </span>
        <input
          type="number"
          min={1}
          max={168}
          value={lookback}
          onChange={(e) => setLookback(Number(e.target.value))}
          disabled={disabled}
          className="h-10 w-full max-w-xs rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
        />
        <span className="text-xs text-slate-500">
          Default {RINGBA_API_LOOKBACK_DEFAULT_HOURS} hours of call log range per request (smaller windows reduce load).
        </span>
      </label>

      <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-400">
        Last successful sync watermark: <span className="text-slate-200">{lastSyncLabel}</span>
      </div>

      {validationMessage ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {validationMessage}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving…" : "Save API settings"}
        </button>
        <button
          type="button"
          onClick={onSyncNow}
          disabled={disabled || isSyncing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-violet-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {isSyncing ? "Syncing…" : "Run sync now"}
        </button>
      </div>
    </section>
  );
}
