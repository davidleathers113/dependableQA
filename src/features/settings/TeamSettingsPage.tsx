import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import {
  getTeamSettings,
  inviteTeamMember,
  type OrganizationRole,
  type TeamSettingsData,
  updateTeamMemberRole,
} from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";

interface Props {
  organizationId: string;
  currentUserId: string;
  currentUserRole: string;
  initialData: TeamSettingsData;
}

const teamRoles: OrganizationRole[] = ["owner", "admin", "reviewer", "analyst", "billing"];

function formatStatusLabel(value: string) {
  return value === "accepted" ? "Active" : value[0]?.toUpperCase() + value.slice(1);
}

function TeamSettingsPageInner({ organizationId, currentUserId, currentUserRole, initialData }: Props) {
  const queryClient = useQueryClient();
  const teamQuery = useQuery({
    queryKey: ["team-settings", organizationId],
    queryFn: () => getTeamSettings(getBrowserSupabase(), organizationId),
    initialData,
  });
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<OrganizationRole>("reviewer");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");
  const canManage = currentUserRole === "owner" || currentUserRole === "admin";

  const inviteMutation = useMutation({
    mutationFn: async () =>
      inviteTeamMember(getBrowserSupabase(), {
        organizationId,
        inviteEmail,
        role: inviteRole,
        invitedBy: currentUserId,
      }),
    onSuccess: async () => {
      setErrorMessage("");
      setSuccessMessage("Invite created.");
      setInviteEmail("");
      setInviteRole("reviewer");
      await queryClient.invalidateQueries({ queryKey: ["team-settings", organizationId] });
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Unable to invite member.");
    },
  });

  const roleMutation = useMutation({
    mutationFn: async (input: { memberId: string; role: OrganizationRole }) =>
      updateTeamMemberRole(getBrowserSupabase(), {
        organizationId,
        memberId: input.memberId,
        role: input.role,
      }),
    onSuccess: async () => {
      setErrorMessage("");
      setSuccessMessage("Team role updated.");
      await queryClient.invalidateQueries({ queryKey: ["team-settings", organizationId] });
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Unable to update team role.");
    },
  });

  return (
    <section className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Team Management</h1>
          <p className="text-sm text-slate-400">Manage members, pending invites, and organization roles.</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-xs text-slate-400">
          Current role: <span className="text-slate-200">{currentUserRole}</span>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-white">Invite Member</h2>
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
        <div className="grid gap-3 md:grid-cols-[1.2fr_180px_auto]">
          <input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            disabled={!canManage || inviteMutation.isPending}
            className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
            placeholder="teammate@example.com"
          />
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as OrganizationRole)}
            disabled={!canManage || inviteMutation.isPending}
            className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
          >
            {teamRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => inviteMutation.mutate()}
            disabled={!canManage || inviteMutation.isPending || inviteEmail.trim().length === 0}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
          >
            {inviteMutation.isPending ? "Inviting..." : "Invite"}
          </button>
        </div>
        {!canManage && (
          <p className="text-xs text-slate-500">Only owners and admins can invite or change team members.</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-500">
              <tr>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Member</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-wider">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {teamQuery.data.members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No members found for this organization.
                  </td>
                </tr>
              ) : (
                teamQuery.data.members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                          {member.initials}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{member.name}</p>
                          <p className="text-xs text-slate-500">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={member.role}
                        disabled={!canManage || roleMutation.isPending || member.userId === currentUserId}
                        onChange={(event) =>
                          roleMutation.mutate({
                            memberId: member.id,
                            role: event.target.value as OrganizationRole,
                          })
                        }
                        className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs uppercase tracking-wider text-slate-300 outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
                      >
                        {teamRoles.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-300">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            member.inviteStatus === "accepted" ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                        />
                        {formatStatusLabel(member.inviteStatus)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {new Date(member.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default function TeamSettingsPage(props: Props) {
  return (
    <QueryProvider>
      <TeamSettingsPageInner {...props} />
    </QueryProvider>
  );
}
