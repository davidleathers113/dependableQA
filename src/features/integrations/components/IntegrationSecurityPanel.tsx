import * as React from "react";
import { KeyRound, Save } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";
import { getSecretSourceLabel, getSecretStateLabel } from "../helpers";

interface Props {
  canManage: boolean;
  integration: IntegrationCard;
  isSaving: boolean;
  onSave: (input: {
    authType: IntegrationCard["webhookAuth"]["authType"];
    headerName: string;
    prefix: string;
    secret: string;
  }) => void;
}

export function IntegrationSecurityPanel({ canManage, integration, isSaving, onSave }: Props) {
  const [authType, setAuthType] = React.useState(integration.webhookAuth.authType);
  const [headerName, setHeaderName] = React.useState(integration.webhookAuth.headerName);
  const [prefix, setPrefix] = React.useState(integration.webhookAuth.prefix);
  const [secret, setSecret] = React.useState("");
  const [validationMessage, setValidationMessage] = React.useState("");

  React.useEffect(() => {
    setAuthType(integration.webhookAuth.authType);
    setHeaderName(integration.webhookAuth.headerName);
    setPrefix(integration.webhookAuth.prefix);
    setSecret("");
    setValidationMessage("");
  }, [
    integration.id,
    integration.webhookAuth.authType,
    integration.webhookAuth.headerName,
    integration.webhookAuth.prefix,
  ]);

  const isSharedSecret = authType === "shared-secret";

  const handleSave = React.useCallback(() => {
    const nextHeaderName = headerName.trim();
    const nextPrefix = isSharedSecret ? "" : prefix.trim();

    if (!nextHeaderName) {
      setValidationMessage("We couldn’t save these settings. Check the values and try again.");
      return;
    }

    if (nextHeaderName.includes(" ")) {
      setValidationMessage("We couldn’t save these settings. Check the values and try again.");
      return;
    }

    if (!isSharedSecret && !nextPrefix) {
      setValidationMessage("We couldn’t save these settings. Check the values and try again.");
      return;
    }

    if (!secret.trim() && integration.webhookAuth.secretSource === "none") {
      setValidationMessage("We couldn’t save these settings. Check the values and try again.");
      return;
    }

    setValidationMessage("");
    onSave({
      authType,
      headerName: nextHeaderName,
      prefix: nextPrefix,
      secret: secret.trim(),
    });
  }, [authType, headerName, integration.webhookAuth.secretSource, isSharedSecret, onSave, prefix, secret]);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div>
        <div className="flex items-center gap-2 text-slate-300">
          <KeyRound className="h-4 w-4" />
          <h3 className="text-lg font-semibold text-white">Webhook security</h3>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Control how DependableQA verifies incoming provider requests.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Auth type</span>
          <select
            value={authType}
            onChange={(event) => {
              const nextType = event.target.value as typeof authType;
              setAuthType(nextType);
              if (nextType === "shared-secret") {
                setPrefix("");
              } else if (!prefix.trim()) {
                setPrefix("sha256=");
              }
            }}
            disabled={!canManage || isSaving}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          >
            <option value="hmac-sha256">HMAC SHA-256</option>
            <option value="shared-secret">Shared secret</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Header name</span>
          <input
            value={headerName}
            onChange={(event) => setHeaderName(event.target.value)}
            disabled={!canManage || isSaving}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
        </label>

        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Prefix</span>
          <input
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            disabled={!canManage || isSaving || isSharedSecret}
            placeholder={isSharedSecret ? "Prefix is not used for shared-secret validation." : "sha256="}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
        </label>

        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Secret</span>
          <input
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            disabled={!canManage || isSaving}
            type="password"
            placeholder="Enter a new secret to rotate it"
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Secret state</p>
          <p className="mt-2 text-sm text-slate-100">{getSecretStateLabel(integration)}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Secret source</p>
          <p className="mt-2 text-sm text-slate-100">{getSecretSourceLabel(integration.webhookAuth.secretSource)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
        {isSharedSecret
          ? "DependableQA will validate the shared secret provided by the sender."
          : "DependableQA will verify the request signature in the configured header using the secret below."}
      </div>

      {validationMessage ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {validationMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-xs text-slate-500">
          {canManage
            ? "Security settings saved here apply to inbound provider requests."
            : "Only owners and admins can edit integration settings."}
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canManage || isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save security settings"}
        </button>
      </div>
    </section>
  );
}
