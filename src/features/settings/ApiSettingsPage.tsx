import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import { getApiKeysData, type ApiKeysData } from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";

interface Props {
  organizationId: string;
  currentUserRole: string;
  initialData: ApiKeysData;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ApiSettingsPageInner({ organizationId, currentUserRole, initialData }: Props) {
  const queryClient = useQueryClient();
  const apiKeysQuery = useQuery({
    queryKey: ["api-keys", organizationId],
    queryFn: () => getApiKeysData(getBrowserSupabase(), organizationId),
    initialData,
  });
  const [label, setLabel] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");
  const [generatedSecret, setGeneratedSecret] = React.useState("");
  const canManage = currentUserRole === "owner" || currentUserRole === "admin";

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "create", label }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string; secret?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to generate API key.");
      }

      return payload.secret ?? "";
    },
    onSuccess: async (secret) => {
      setErrorMessage("");
      setSuccessMessage("API key generated. Copy the secret now; it will not be shown again.");
      setGeneratedSecret(secret);
      setLabel("");
      await queryClient.invalidateQueries({ queryKey: ["api-keys", organizationId] });
    },
    onError: (error) => {
      setSuccessMessage("");
      setGeneratedSecret("");
      setErrorMessage(error instanceof Error ? error.message : "Unable to generate API key.");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "revoke", keyId }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to revoke API key.");
      }
    },
    onSuccess: async () => {
      setErrorMessage("");
      setSuccessMessage("API key revoked.");
      await queryClient.invalidateQueries({ queryKey: ["api-keys", organizationId] });
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Unable to revoke API key.");
    },
  });

  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">API Keys</h1>
          <p className="text-sm text-slate-400">Manage API keys for programmatic access to ingestion and reporting workflows.</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-xs text-slate-400">
          Current role: <span className="text-slate-200">{currentUserRole}</span>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">Generate New Key</h2>
        {errorMessage && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {successMessage}
          </div>
        )}
        {generatedSecret && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">New Secret</p>
            <p className="mt-2 break-all font-mono text-sm text-amber-100">{generatedSecret}</p>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={!canManage || createMutation.isPending}
            className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
            placeholder="Billing integration"
          />
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!canManage || createMutation.isPending || label.trim().length === 0}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
          >
            {createMutation.isPending ? "Generating..." : "Generate New Key"}
          </button>
        </div>
        {!canManage && (
          <p className="text-xs text-slate-500">Only owners and admins can generate or revoke API keys.</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-500">
              <tr>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Label</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Key Prefix</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Last Used</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {apiKeysQuery.data.keys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No API keys found for this organization.
                  </td>
                </tr>
              ) : (
                apiKeysQuery.data.keys.map((key) => (
                  <tr key={key.id}>
                    <td className="px-6 py-4 text-slate-200">{key.label}</td>
                    <td className="px-6 py-4 font-mono text-slate-300">{key.tokenPrefix}</td>
                    <td className="px-6 py-4 text-slate-400">{formatDateTime(key.lastUsedAt)}</td>
                    <td className="px-6 py-4 text-slate-400">{formatDateTime(key.createdAt)}</td>
                    <td className="px-6 py-4 text-slate-300">{key.revokedAt ? "Revoked" : "Active"}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        disabled={!canManage || revokeMutation.isPending || Boolean(key.revokedAt)}
                        onClick={() => revokeMutation.mutate(key.id)}
                        className="text-xs font-semibold uppercase tracking-wider text-violet-400 transition-colors hover:text-violet-300 disabled:opacity-40"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-3">
        <h3 className="text-sm font-semibold text-white">Integration Guide</h3>
        <p className="text-sm text-slate-400">
          Use generated keys for server-to-server ingestion or reporting automation. Treat secrets like passwords and rotate them if exposed.
        </p>
      </div>
    </section>
  );
}

export default function ApiSettingsPage(props: Props) {
  return (
    <QueryProvider>
      <ApiSettingsPageInner {...props} />
    </QueryProvider>
  );
}
