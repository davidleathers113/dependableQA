import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import {
  createAlertRule,
  getAlertRulesData,
  setAlertRuleEnabled,
  type AlertRuleInput,
  type AlertRulesData,
  updateAlertRule,
} from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";

interface Props {
  organizationId: string;
  currentUserId: string;
  currentUserRole: string;
  initialData: AlertRulesData;
}

const emptyForm: AlertRuleInput = {
  name: "",
  triggerSummary: "",
  destinationSummary: "",
  cooldownMinutes: 15,
  isEnabled: true,
};

function AlertSettingsPageInner({ organizationId, currentUserId, currentUserRole, initialData }: Props) {
  const queryClient = useQueryClient();
  const alertsQuery = useQuery({
    queryKey: ["alert-rules", organizationId],
    queryFn: () => getAlertRulesData(getBrowserSupabase(), organizationId),
    initialData,
  });
  const [formState, setFormState] = React.useState<AlertRuleInput>(emptyForm);
  const [editingRuleId, setEditingRuleId] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");
  const canManage = currentUserRole === "owner" || currentUserRole === "admin";

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["alert-rules", organizationId] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingRuleId) {
        await updateAlertRule(getBrowserSupabase(), {
          organizationId,
          ruleId: editingRuleId,
          ...formState,
        });
        return "updated";
      }

      await createAlertRule(getBrowserSupabase(), {
        organizationId,
        createdBy: currentUserId,
        ...formState,
      });
      return "created";
    },
    onSuccess: async (result) => {
      setErrorMessage("");
      setSuccessMessage(result === "updated" ? "Alert rule updated." : "Alert rule created.");
      setFormState(emptyForm);
      setEditingRuleId(null);
      await invalidate();
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Unable to save alert rule.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (input: { ruleId: string; isEnabled: boolean }) =>
      setAlertRuleEnabled(getBrowserSupabase(), {
        organizationId,
        ruleId: input.ruleId,
        isEnabled: input.isEnabled,
      }),
    onSuccess: async () => {
      setErrorMessage("");
      setSuccessMessage("Alert status updated.");
      await invalidate();
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Unable to update alert status.");
    },
  });

  return (
    <section className="max-w-4xl space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Alert Rules</h1>
          <p className="text-sm text-slate-400">Configure automated notifications for call-health and billing events.</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-xs text-slate-400">
          Current role: <span className="text-slate-200">{currentUserRole}</span>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">
          {editingRuleId ? "Edit Rule" : "Create Rule"}
        </h2>
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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Rule Name</label>
            <input
              value={formState.name}
              onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
              disabled={!canManage || saveMutation.isPending}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
              placeholder="Compliance breach"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Cooldown Minutes</label>
            <input
              value={String(formState.cooldownMinutes)}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  cooldownMinutes: Number(event.target.value || 0),
                }))
              }
              disabled={!canManage || saveMutation.isPending}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
              placeholder="15"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Trigger Summary</label>
          <input
            value={formState.triggerSummary}
            onChange={(event) => setFormState((current) => ({ ...current, triggerSummary: event.target.value }))}
            disabled={!canManage || saveMutation.isPending}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
            placeholder="Any compliance flag or low wallet balance"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Destination Summary</label>
          <input
            value={formState.destinationSummary}
            onChange={(event) => setFormState((current) => ({ ...current, destinationSummary: event.target.value }))}
            disabled={!canManage || saveMutation.isPending}
            className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
            placeholder="Email to ops@company.com"
          />
        </div>
        <label className="flex items-center gap-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={formState.isEnabled}
            onChange={(event) => setFormState((current) => ({ ...current, isEnabled: event.target.checked }))}
            disabled={!canManage || saveMutation.isPending}
          />
          Rule enabled
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!canManage || saveMutation.isPending || formState.name.trim().length === 0}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
          >
            {saveMutation.isPending ? "Saving..." : editingRuleId ? "Update Rule" : "Create Rule"}
          </button>
          {editingRuleId && (
            <button
              type="button"
              onClick={() => {
                setEditingRuleId(null);
                setFormState(emptyForm);
              }}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
            >
              Cancel Edit
            </button>
          )}
        </div>
        {!canManage && (
          <p className="text-xs text-slate-500">Only owners and admins can create or change alert rules.</p>
        )}
      </div>

      <div className="space-y-4">
        {alertsQuery.data.rules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-500">
            No alert rules configured yet.
          </div>
        ) : (
          alertsQuery.data.rules.map((rule) => (
            <div key={rule.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <h3 className="font-bold text-white">{rule.name}</h3>
                <div className="text-xs text-slate-500">
                  Trigger: <span className="text-slate-300">{rule.triggerSummary}</span>
                </div>
                <div className="text-xs text-slate-500">
                  Notify: <span className="text-slate-300">{rule.destinationSummary}</span>
                </div>
                <div className="text-xs text-slate-500">
                  Cooldown: <span className="text-slate-300">{rule.cooldownMinutes} minutes</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!canManage || toggleMutation.isPending}
                  onClick={() =>
                    toggleMutation.mutate({
                      ruleId: rule.id,
                      isEnabled: !rule.isEnabled,
                    })
                  }
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-60"
                >
                  {rule.isEnabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => {
                    setEditingRuleId(rule.id);
                    setFormState({
                      name: rule.name,
                      triggerSummary: rule.triggerSummary,
                      destinationSummary: rule.destinationSummary,
                      cooldownMinutes: rule.cooldownMinutes,
                      isEnabled: rule.isEnabled,
                    });
                  }}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-violet-400 transition-colors hover:bg-slate-800 disabled:opacity-60"
                >
                  Edit
                </button>
                <span className={`text-xs font-bold uppercase tracking-widest ${rule.isEnabled ? "text-emerald-500" : "text-slate-500"}`}>
                  {rule.isEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default function AlertSettingsPage(props: Props) {
  return (
    <QueryProvider>
      <AlertSettingsPageInner {...props} />
    </QueryProvider>
  );
}
