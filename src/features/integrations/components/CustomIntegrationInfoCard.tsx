import { Webhook } from "lucide-react";

export function CustomIntegrationInfoCard() {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-100">
          <Webhook className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Custom webhook integrations</h2>
          <p className="text-sm text-slate-300">
            Need to send provider payloads from a custom system? Use the DependableQA webhook endpoint and configure
            request verification in the selected integration workspace.
          </p>
          <p className="text-sm text-slate-400">Custom sources should send signed requests whenever possible.</p>
        </div>
      </div>
    </section>
  );
}
