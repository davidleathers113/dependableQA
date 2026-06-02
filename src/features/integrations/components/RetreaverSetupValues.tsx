import { CopyField } from "./CopyField";

interface Props {
  endpoint: string;
  /** Empty until the integration is created (a catalog placeholder has no usable id). */
  integrationId: string;
  /** The configured (or default) signing header name — never the secret value. */
  headerName: string;
  secretConfigured: boolean;
}

/**
 * Copy-friendly reference for the concrete Retreaver setup values, reusing the
 * shared CopyField. Shown alongside the wizard steps so an operator can copy the
 * webhook URL, the x-integration-id value, and the signing header name directly.
 * The signing secret is never rendered — only whether one is configured.
 */
export function RetreaverSetupValues({ endpoint, integrationId, headerName, secretConfigured }: Props) {
  return (
    <section className="mt-6 space-y-3 border-t border-slate-800 pt-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Values to copy</p>

      <CopyField label="Webhook URL" value={endpoint} copyLabel="Copy URL" />

      <CopyField
        label="x-integration-id header"
        value={integrationId}
        emptyLabel="Create the integration first — its ID appears on the Security tab"
        copyLabel="Copy ID"
      />

      <CopyField label="Signing header name" value={headerName} copyLabel="Copy header" />

      <p className="text-xs text-slate-400">
        {secretConfigured
          ? "A signing secret is configured. Manage or rotate it on this integration's Security tab."
          : "No signing secret is configured yet — set one on this integration's Security tab before sending live traffic."}
      </p>
    </section>
  );
}
