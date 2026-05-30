import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, DownloadCloud, Sparkles } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";

/** Hard cap mirrored from the server (RINGBA_MANUAL_IMPORT_MAX_RECORDS). */
const MAX_RECORDS = 2000;
/** Rough per-call OpenAI estimate (transcription + analysis) for the cost warning. */
const ESTIMATED_COST_PER_CALL_USD = 0.03;

type ImportBehavior = "import_only" | "review" | "analyze";

interface ImportedCall {
  callId: string;
  callerNumber: string;
  durationSeconds: number;
  hasRecording: boolean;
}

interface ImportResult {
  batchId: string;
  status: string;
  recordsSeen: number;
  recordsImported: number;
  recordingsImported: number;
  rejectedCount: number;
  callIds: string[];
  importedCalls: ImportedCall[];
  capped: boolean;
}

interface AnalyzeResult {
  requested: number;
  transcriptionQueued: number;
  analysisQueued: number;
  skipped: Array<{ callId: string; reason: string }>;
}

interface RecordingReadinessItem {
  callId: string;
  status: string;
}

function readinessLabel(status: string): string {
  return status.split("_").join(" ");
}

interface Props {
  integration: IntegrationCard;
  canManage: boolean;
}

function todayIso(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function estimateCostLabel(count: number): string {
  return `~$${(count * ESTIMATED_COST_PER_CALL_USD).toFixed(2)}`;
}

export function RingbaImportPanel({ integration, canManage }: Props) {
  const [dateStart, setDateStart] = React.useState(todayIso(-7));
  const [dateEnd, setDateEnd] = React.useState(todayIso(0));
  const [maxRecords, setMaxRecords] = React.useState(100);
  const [recordingOnly, setRecordingOnly] = React.useState(true);
  const [minDuration, setMinDuration] = React.useState(integration.ringba.minimumDurationSeconds);
  const [behavior, setBehavior] = React.useState<ImportBehavior>("import_only");
  const [formError, setFormError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [readiness, setReadiness] = React.useState<Record<string, number> | null>(null);

  const disabled = !canManage || !integration.isConfigured || !integration.ringba.apiTokenConfigured;

  const importMutation = useMutation({
    mutationFn: async (): Promise<ImportResult> => {
      const response = await fetch("/api/integrations/ringba/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          integrationId: integration.id,
          // Convert the date-only inputs into a full-day ISO window.
          dateStartIso: new Date(`${dateStart}T00:00:00.000Z`).toISOString(),
          dateEndIso: new Date(`${dateEnd}T23:59:59.999Z`).toISOString(),
          maxRecords,
          recordingOnly,
          minimumDurationSeconds: minDuration,
          importBehavior: behavior,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ImportResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Ringba import failed.");
      }
      return payload;
    },
    onSuccess: (payload) => {
      setResult(payload);
      setSelected(new Set(payload.importedCalls.filter((c) => c.hasRecording).map((c) => c.callId)));
      setNotice(
        `Imported ${payload.recordsImported} call(s) (${payload.recordingsImported} with recordings) from ${payload.recordsSeen} seen.` +
          (payload.capped ? " Requested max exceeded the 2000 cap and was clamped." : "")
      );
    },
    onError: (error) => {
      setResult(null);
      setNotice("");
      setFormError(error instanceof Error ? error.message : "Ringba import failed.");
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (callIds: string[]): Promise<AnalyzeResult> => {
      const response = await fetch("/api/calls/analyze-selected", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callIds, importBatchId: result?.batchId }),
      });
      const payload = (await response.json().catch(() => ({}))) as AnalyzeResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to queue analysis.");
      }
      return payload;
    },
    onSuccess: (payload) => {
      setFormError("");
      setNotice(
        `Queued ${payload.transcriptionQueued} transcription and ${payload.analysisQueued} analysis job(s).` +
          (payload.skipped.length > 0 ? ` Skipped ${payload.skipped.length}.` : "")
      );
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Unable to queue analysis.");
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (callIds: string[]): Promise<RecordingReadinessItem[]> => {
      const response = await fetch("/api/calls/verify-recording", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callIds }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        results?: RecordingReadinessItem[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to check recordings.");
      }
      return payload.results ?? [];
    },
    onSuccess: (results) => {
      const counts: Record<string, number> = {};
      for (const item of results) {
        counts[item.status] = (counts[item.status] ?? 0) + 1;
      }
      setReadiness(counts);
      setFormError("");
    },
    onError: (error) => {
      setReadiness(null);
      setFormError(error instanceof Error ? error.message : "Unable to check recordings.");
    },
  });

  const handleImport = React.useCallback(() => {
    setFormError("");
    if (!dateStart || !dateEnd) {
      setFormError("Choose a start and end date.");
      return;
    }
    if (dateStart > dateEnd) {
      setFormError("Start date must be on or before the end date.");
      return;
    }
    const n = Math.round(Number(maxRecords));
    if (!Number.isFinite(n) || n < 1) {
      setFormError("Max records must be at least 1.");
      return;
    }
    importMutation.mutate();
  }, [dateStart, dateEnd, maxRecords, importMutation]);

  const toggleSelected = (callId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }
      return next;
    });
  };

  const selectedIds = result ? result.callIds.filter((id) => selected.has(id)) : [];

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div>
        <div className="flex items-center gap-2 text-slate-300">
          <DownloadCloud className="h-4 w-4" />
          <h3 className="text-lg font-semibold text-white">Ringba full API import (controlled)</h3>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Pull a bounded set of Ringba call logs and recording links for a date range. Importing
          stores metadata only — <span className="text-slate-200">no transcription or analysis runs automatically</span>.
          Queue AI explicitly below after reviewing what was imported.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Start date</span>
          <input
            type="date"
            value={dateStart}
            max={dateEnd}
            onChange={(e) => setDateStart(e.target.value)}
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">End date</span>
          <input
            type="date"
            value={dateEnd}
            min={dateStart}
            onChange={(e) => setDateEnd(e.target.value)}
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Max records (cap {MAX_RECORDS})
          </span>
          <input
            type="number"
            min={1}
            max={MAX_RECORDS}
            value={maxRecords}
            onChange={(e) => setMaxRecords(Number(e.target.value))}
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
        </label>
        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Minimum duration (seconds)
          </span>
          <input
            type="number"
            min={0}
            value={minDuration}
            onChange={(e) => setMinDuration(Number(e.target.value))}
            disabled={disabled}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
        </label>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
        <input
          type="checkbox"
          checked={recordingOnly}
          onChange={(e) => setRecordingOnly(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-slate-600 text-violet-500 focus:ring-violet-500 disabled:opacity-50"
        />
        <span className="text-sm text-slate-200">
          Recordings only (uncheck to also import calls without a recording)
        </span>
      </label>

      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Import behavior</legend>
        {(
          [
            ["import_only", "Import only — store metadata, queue no AI"],
            ["review", "Import for review — store metadata, review before any AI"],
            ["analyze", "Import then analyze — you still confirm AI below"],
          ] as Array<[ImportBehavior, string]>
        ).map(([value, label]) => (
          <label key={value} className="flex cursor-pointer items-center gap-3 text-sm text-slate-200">
            <input
              type="radio"
              name="ringba-import-behavior"
              value={value}
              checked={behavior === value}
              onChange={() => setBehavior(value)}
              className="h-4 w-4 border-slate-600 text-violet-500 focus:ring-violet-500"
            />
            {label}
          </label>
        ))}
      </fieldset>

      {formError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {formError}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleImport}
          disabled={disabled || importMutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <DownloadCloud className="h-4 w-4" />
          {importMutation.isPending ? "Importing…" : "Run import"}
        </button>
      </div>

      {result ? (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="grid grid-cols-2 gap-2 text-sm text-slate-300 sm:grid-cols-4">
            <Stat label="Fetched" value={result.recordsSeen} />
            <Stat label="Imported" value={result.recordsImported} />
            <Stat label="With recordings" value={result.recordingsImported} />
            <Stat label="Rejected" value={result.rejectedCount} />
          </div>

          {result.importedCalls.length > 0 ? (
            <>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
                {result.importedCalls.slice(0, 200).map((call) => (
                  <label
                    key={call.callId}
                    className="flex items-center gap-3 rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-900"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(call.callId)}
                      onChange={() => toggleSelected(call.callId)}
                      className="h-3.5 w-3.5 rounded border-slate-600 text-violet-500 focus:ring-violet-500"
                    />
                    <span className="font-mono text-slate-200">{call.callerNumber || "(unknown)"}</span>
                    <span className="text-slate-500">{call.durationSeconds}s</span>
                    {call.hasRecording ? (
                      <span className="text-emerald-400">recording</span>
                    ) : (
                      <span className="text-slate-600">no recording</span>
                    )}
                  </label>
                ))}
                {result.importedCalls.length > 200 ? (
                  <p className="px-2 py-1 text-[11px] text-slate-500">
                    Showing first 200 of {result.importedCalls.length}. “Analyze all imported” still covers every call.
                  </p>
                ) : null}
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Queueing AI runs OpenAI transcription + analysis. Estimated cost — selected:{" "}
                  <span className="font-semibold">{estimateCostLabel(selectedIds.length)}</span>, all imported:{" "}
                  <span className="font-semibold">{estimateCostLabel(result.callIds.length)}</span>. Estimates only.
                </span>
              </div>

              {readiness ? (
                <p className="text-xs text-slate-300">
                  Recording readiness —{" "}
                  {Object.entries(readiness)
                    .map(([status, count]) => `${count} ${readinessLabel(status)}`)
                    .join(", ")}
                  .
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => verifyMutation.mutate(selectedIds.length > 0 ? selectedIds : result.callIds)}
                  disabled={!canManage || verifyMutation.isPending || result.callIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-sky-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DownloadCloud className="h-4 w-4" />
                  {verifyMutation.isPending ? "Checking…" : "Check recordings"}
                </button>
                <button
                  type="button"
                  onClick={() => analyzeMutation.mutate(selectedIds)}
                  disabled={!canManage || analyzeMutation.isPending || selectedIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  Analyze selected ({selectedIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => analyzeMutation.mutate(result.callIds)}
                  disabled={!canManage || analyzeMutation.isPending || result.callIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-violet-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  Analyze all imported ({result.callIds.length})
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
