import * as React from "react";
import { Copy, Link2 } from "lucide-react";
import type { IntegrationCard } from "../../../lib/app-data";
import { getWebhookEndpointUrl } from "../helpers";

interface Props {
  integration: IntegrationCard;
}

async function copyText(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new Error("Clipboard access is unavailable in this browser.");
  }

  await navigator.clipboard.writeText(value);
}

export function IntegrationEndpointCard({ integration }: Props) {
  const [copiedField, setCopiedField] = React.useState<string | null>(null);
  const endpoint = React.useMemo(() => getWebhookEndpointUrl(), []);

  const handleCopy = React.useCallback(async (field: string, value: string) => {
    try {
      await copyText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1600);
    } catch {
      setCopiedField(null);
    }
  }, []);

  return (
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-slate-300">
          <Link2 className="h-4 w-4" />
          <h3 className="text-sm font-semibold text-white">Endpoint and headers</h3>
        </div>
        <p className="text-sm text-slate-400">
          Use these exact values in your provider configuration to reduce copy or signing mistakes.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Webhook endpoint</p>
              <p className="break-all text-sm text-slate-100">{endpoint}</p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy("endpoint", endpoint)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800"
            >
              <Copy className="h-4 w-4" />
              {copiedField === "endpoint" ? "Copied" : "Copy endpoint"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Header name</p>
                <p className="mt-1 text-sm text-slate-100">{integration.webhookAuth.headerName}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy("header", integration.webhookAuth.headerName)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedField === "header" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Prefix</p>
                <p className="mt-1 text-sm text-slate-100">{integration.webhookAuth.prefix || "No prefix required"}</p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy("prefix", integration.webhookAuth.prefix)}
                disabled={!integration.webhookAuth.prefix}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="h-3.5 w-3.5" />
                {copiedField === "prefix" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
