import * as React from "react";
import { KeyRound, Play, Save } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";

interface Props {
  canManage: boolean;
  integration: IntegrationCard;
  isSaving: boolean;
  isTesting: boolean;
  onSave: (input: {
    authType: IntegrationCard["webhookAuth"]["authType"];
    headerName: string;
    prefix: string;
    secret: string;
  }) => void;
  onSendTestEvent: () => void;
}

export function IntegrationAuthForm({ canManage, integration, isSaving, isTesting, onSave, onSendTestEvent }: Props) {
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

  const isHmac = authType === "hmac-sha256";

  const handleSubmit = React.useCallback(() => {
    const nextHeaderName = headerName.trim();
    const nextPrefix = prefix.trim();

    if (!nextHeaderName) {
      setValidationMessage("Header name is required.");
      return;
    }

    if (nextHeaderName.includes(" ")) {
      setValidationMessage("Header name cannot contain spaces.");
      return;
    }

    if (isHmac && !nextPrefix) {
      setValidationMessage("Prefix is required for HMAC SHA-256 signatures.");
      return;
    }

    if (!secret.trim() && integration.webhookAuth.secretSource === "none") {
      setValidationMessage("Add a secret or configure an environment fallback before saving.");
      return;
    }

    setValidationMessage("");
    onSave({
      authType,
      headerName: nextHeaderName,
      prefix: nextPrefix,
      secret: secret.trim(),
    });
  }, [authType, headerName, integration.webhookAuth.secretSource, isHmac, onSave, prefix, secret]);

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-slate-300">
          <KeyRound className="h-4 w-4" />
          <h3 className="text-sm font-semibold text-white">Webhook security</h3>
        </div>
        <p className="text-sm text-slate-400">
          Add your provider&apos;s webhook verification settings here. Secrets are never shown after they are saved.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Auth type</span>
          <select
            value={authType}
            onChange={(event) => {
              const nextType = event.target.value as typeof authType;
              setAuthType(nextType);
              if (nextType === "shared-secret") {
                setPrefix("");
              }
              if (nextType === "hmac-sha256" && !prefix.trim()) {
                setPrefix("sha256=");
              }
            }}
            disabled={!canManage || isSaving}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
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
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
        </label>

        <label className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Prefix</span>
          <input
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            disabled={!canManage || isSaving || !isHmac}
            placeholder={isHmac ? "sha256=" : "Not used for shared secret"}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Secret</span>
        <input
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          disabled={!canManage || isSaving}
          type="password"
          className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          placeholder="Enter a new secret to rotate it"
        />
      </label>

      <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">
        {isHmac ? (
          <p>
            DependableQA expects the provider to compute an HMAC SHA-256 signature for the raw request body and send it
            in <span className="text-slate-100">{headerName || "your signature header"}</span>.
          </p>
        ) : (
          <p>
            DependableQA expects the provider to send the shared secret directly in
            <span className="text-slate-100"> {headerName || "your secret header"}</span>.
          </p>
        )}
      </div>

      {validationMessage ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {validationMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-slate-500">
          {canManage
            ? "Save changes here before updating your provider so the expected signing values stay in sync."
            : "Only owners and admins can edit integration security settings."}
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canManage || isSaving || isTesting}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {isSaving ? "Saving..." : "Save webhook settings"}
        </button>
        <button
          type="button"
          onClick={onSendTestEvent}
          disabled={!canManage || isSaving || isTesting || !integration.webhookAuth.secretConfigured}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          <Play className="h-4 w-4" />
          {isTesting ? "Sending test..." : "Send test event"}
        </button>
      </div>
    </section>
  );
}
