import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import {
  getProfileSettings,
  type ProfileSettingsData,
  updateProfileSettings,
} from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";

interface Props {
  organizationId: string;
  userId: string;
  initialData: ProfileSettingsData;
}

function ProfileSettingsPageInner({ userId, initialData }: Props) {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ["profile-settings", userId],
    queryFn: () => getProfileSettings(getBrowserSupabase(), userId),
    initialData,
  });
  const [firstName, setFirstName] = React.useState(initialData.firstName);
  const [lastName, setLastName] = React.useState(initialData.lastName);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");

  React.useEffect(() => {
    setFirstName(profileQuery.data.firstName);
    setLastName(profileQuery.data.lastName);
  }, [profileQuery.data.firstName, profileQuery.data.lastName]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      updateProfileSettings(getBrowserSupabase(), userId, {
        firstName,
        lastName,
      }),
    onSuccess: async (data) => {
      setErrorMessage("");
      setSuccessMessage("Profile saved.");
      await queryClient.setQueryData(["profile-settings", userId], data);
    },
    onError: (error) => {
      setSuccessMessage("");
      setErrorMessage(error instanceof Error ? error.message : "Unable to update profile.");
    },
  });

  return (
    <section className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Profile Settings</h1>
        <p className="text-sm text-slate-400">Manage your personal information and security preferences.</p>
      </header>

      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6">
          <h2 className="text-sm font-semibold text-white">Account Details</h2>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">First Name</label>
              <input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Last Name</label>
              <input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="Doe"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Email Address</label>
            <input
              value={profileQuery.data.email}
              className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none"
              disabled
            />
            <p className="text-[10px] text-slate-500">Email is managed by authentication and shown here for reference.</p>
          </div>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
          >
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 py-12 text-center space-y-6 p-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-xl">S</div>
          <h2 className="text-sm font-semibold text-white">Security And Password</h2>
          <p className="mx-auto max-w-xs text-sm text-slate-400">
            Password resets and MFA are handled by the connected auth provider.
          </p>
          <a
            href="/login"
            className="inline-flex rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-700"
          >
            Open Auth Flow
          </a>
        </div>
      </div>
    </section>
  );
}

export default function ProfileSettingsPage(props: Props) {
  return (
    <QueryProvider>
      <ProfileSettingsPageInner {...props} />
    </QueryProvider>
  );
}
