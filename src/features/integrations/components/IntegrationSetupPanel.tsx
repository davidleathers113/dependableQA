import * as React from "react";
import { BookOpenText, Play, WandSparkles } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";
import {
  getIntegrationSetupDescription,
  getIntegrationSetupHeading,
  getPublicAppOrigin,
  getRingbaPixelUrl,
  getWebhookEndpointUrl,
} from "../helpers";
import { CopyField } from "./CopyField";

interface Props {
  integration: IntegrationCard;
  canManage: boolean;
  isTesting: boolean;
  isCreating: boolean;
  onSendTestEvent: () => void;
  onLaunchWizard: () => void;
}

export function IntegrationSetupPanel({
  integration,
  canManage,
  isTesting,
  isCreating,
  onSendTestEvent,
  onLaunchWizard,
}: Props) {
  const endpoint = React.useMemo(() => {
    if (integration.provider === "ringba") {
      return getRingbaPixelUrl({
        origin: getPublicAppOrigin(),
        publicIngestKey: integration.ringba.publicIngestKey,
        includePublisher: true,
        includeBuyer: false,
      });
    }

    return getWebhookEndpointUrl();
  }, [integration.provider, integration.ringba.publicIngestKey]);
  const [toastMessage, setToastMessage] = React.useState("");
  const wizardActionLabel = integration.isConfigured ? "Resume guided setup" : "Launch guided setup";
  const supportsWizard = integration.provider !== "custom";
  const showWebhookSecurityFields = integration.provider !== "ringba";
  const supportsManualTest = integration.provider !== "ringba";

  const handleCopied = React.useCallback((label: string) => {
    if (label === "Copy endpoint") {
      setToastMessage(integration.provider === "ringba" ? "Pixel URL copied" : "Endpoint copied");
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
            Start with the quick setup values below, then launch the guided provider flow when you need a step-by-step checklist.
          </p>
        </div>
      </div>

      <CopyField
        label={integration.provider === "ringba" ? "Ringba pixel URL" : "Webhook endpoint"}
        value={endpoint}
        copyLabel="Copy endpoint"
        onCopied={handleCopied}
      />

      {showWebhookSecurityFields ? (
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
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4 text-sm text-slate-300">
          Ringba uses the public pixel URL above. Custom signature headers and prefixes do not apply to this ingest
          path.
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-slate-300">
            <WandSparkles className="h-4 w-4" />
            <p className="text-sm font-semibold">
              {supportsWizard ? wizardActionLabel : "Manual provider setup"}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {supportsWizard ? (
              <button
                type="button"
                onClick={onLaunchWizard}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-200 transition-colors hover:border-violet-400/40 hover:bg-violet-500/20"
              >
                <WandSparkles className="h-4 w-4" />
                {wizardActionLabel}
              </button>
            ) : null}
            {supportsManualTest ? (
              <button
                type="button"
                onClick={onSendTestEvent}
                disabled={!canManage || isTesting || isCreating || !integration.webhookAuth.secretConfigured}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
              >
                <Play className="h-4 w-4" />
                {isTesting ? "Sending test..." : "Send test event"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-slate-300">
          <BookOpenText className="h-4 w-4" />
          <p className="text-sm font-semibold">{getIntegrationSetupHeading(integration)}</p>
        </div>
        <p className="mt-3 text-sm text-slate-300">{getIntegrationSetupDescription(integration)}</p>
        {!integration.isConfigured ? (
          <p className="mt-3 text-sm text-slate-400">
            {integration.provider === "ringba"
              ? "Create this integration first so DependableQA can generate the Ringba pixel URL."
              : "Create this integration first, then send a test event after your provider settings are saved."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
