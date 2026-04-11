import * as React from "react";
import { BookOpenText, Play } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";
import { getWebhookEndpointUrl, getIntegrationSetupDescription, getIntegrationSetupHeading } from "../helpers";
import { CopyField } from "./CopyField";

interface Props {
  integration: IntegrationCard;
  canManage: boolean;
  isTesting: boolean;
  onSendTestEvent: () => void;
}

export function IntegrationSetupPanel({ integration, canManage, isTesting, onSendTestEvent }: Props) {
  const endpoint = React.useMemo(() => getWebhookEndpointUrl(), []);
  const [toastMessage, setToastMessage] = React.useState("");

  const handleCopied = React.useCallback((label: string) => {
    if (label === "Copy endpoint") {
      setToastMessage("Endpoint copied");
    } else if (label === "Copy header") {
      setToastMessage("Header copied");
    } else {
      setToastMessage("Prefix copied");
    }

    window.setTimeout(() => setToastMessage(""), 1800);
  }, []);

  return (
    <section className="relative space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      {toastMessage ? (
        <div className="absolute right-5 top-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">
          {toastMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Setup</h3>
          <p className="mt-1 text-sm text-slate-400">
            Use these values in your provider to send webhook events to DependableQA.
          </p>
        </div>
        <button
          type="button"
          onClick={onSendTestEvent}
          disabled={!canManage || isTesting || !integration.webhookAuth.secretConfigured}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
        >
          <Play className="h-4 w-4" />
          {isTesting ? "Sending test..." : "Send test event"}
        </button>
      </div>

      <CopyField label="Webhook endpoint" value={endpoint} copyLabel="Copy endpoint" onCopied={handleCopied} />

      <div className="grid gap-3 md:grid-cols-2">
        <CopyField
          label="Signature header"
          value={integration.webhookAuth.headerName}
          copyLabel="Copy header"
          onCopied={handleCopied}
        />
        <CopyField
          label="Signature prefix"
          value={integration.webhookAuth.prefix}
          emptyLabel="No prefix required"
          copyLabel="Copy prefix"
          disabled={!integration.webhookAuth.prefix}
          onCopied={handleCopied}
        />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4">
        <div className="flex items-center gap-2 text-slate-300">
          <BookOpenText className="h-4 w-4" />
          <p className="text-sm font-semibold">{getIntegrationSetupHeading(integration)}</p>
        </div>
        <p className="mt-3 text-sm text-slate-300">{getIntegrationSetupDescription(integration)}</p>
        {!integration.isConfigured ? (
          <p className="mt-3 text-sm text-slate-400">
            Create this integration first, then send a test event after your provider settings are saved.
          </p>
        ) : null}
      </div>
    </section>
  );
}
