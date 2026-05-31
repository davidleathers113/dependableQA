import { PlugZap, Save } from "lucide-react";
import { LocalTime } from "../../../components/ui/LocalTime";
import { StatusMessage } from "../../../components/ui/StatusMessage";
import type {
  RingbaApiSyncForm,
  RingbaApiSyncFormInput,
  RingbaConnectionTestInput,
} from "../hooks/useRingbaApiSyncForm";

interface Props {
  form: RingbaApiSyncForm;
  canManage: boolean;
  isConfigured: boolean;
  isCreating: boolean;
  isSaving: boolean;
  isTesting: boolean;
  lastRingbaApiSyncAt: string | null;
  testNotice?: { type: "success" | "error"; text: string } | null;
  onCreate: () => void;
  onSave: (input: RingbaApiSyncFormInput) => void;
  onTestConnection: (input: RingbaConnectionTestInput) => void;
}

export function RingbaConnectionFields({
  form,
  canManage,
  isConfigured,
  isCreating,
  isSaving,
  isTesting,
  lastRingbaApiSyncAt,
  testNotice,
  onCreate,
  onSave,
  onTestConnection,
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
        <div className="flex items-center gap-2 text-slate-300">
          <PlugZap className="h-4 w-4" aria-hidden />
          <h3 className="text-lg font-semibold text-white">API connection</h3>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Connect with your Ringba Account ID and API token so DependableQA can read Call Logs and recordings.
        </p>
      </div>

      {!isConfigured ? (
        <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p>
            Create the Ringba integration first, then enter your Account ID and API token here to save settings and test
            the connection.
          </p>
          {canManage ? (
            <button
              type="button"
              onClick={onCreate}
              disabled={isCreating}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden />
              {isCreating ? "Creating…" : "Create Ringba integration"}
            </button>
          ) : (
            <p className="text-amber-200/80">Only owners and admins can create the integration.</p>
          )}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ringba Account ID</span>
          <input
            value={form.accountId}
            onChange={(event) => form.setAccountId(event.target.value)}
            placeholder="RA…"
            autoComplete="off"
            disabled={disabled}
            aria-describedby="ringba-account-id-help"
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
          <span id="ringba-account-id-help" className="text-xs text-slate-500">
            Find it in Ringba → Settings → API. Starts with “RA”.
          </span>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            API access token <span className="font-normal text-slate-500">(leave blank to keep existing)</span>
          </span>
          <input
            type="password"
            value={form.apiToken}
            onChange={(event) => form.setApiToken(event.target.value)}
            autoComplete="new-password"
            disabled={disabled}
            aria-describedby="ringba-api-token-help"
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
          <span id="ringba-api-token-help" className="text-xs text-slate-500">
            Use a token with Call Logs read access. Token configured: {form.apiTokenConfigured ? "yes" : "no"}.
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-400">
        Last successful sync:{" "}
        <span className="text-slate-200">
          <LocalTime value={lastRingbaApiSyncAt} fallback="Never" />
        </span>
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
          onClick={() => onTestConnection(form.testInput())}
          disabled={disabled || isTesting}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-violet-500/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlugZap className="h-4 w-4" aria-hidden />
          {isTesting ? "Testing…" : "Test connection"}
        </button>
      </div>

      {testNotice && !form.editedSinceTest ? (
        <StatusMessage tone={testNotice.type === "success" ? "success" : "error"}>{testNotice.text}</StatusMessage>
      ) : null}
    </section>
  );
}
