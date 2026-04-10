import * as React from 'react';

interface Props {
  organizationId: string;
}

export default function ProfileSettingsPage({ organizationId }: Props) {
  return (
    <section className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Profile Settings</h1>
        <p className="text-sm text-slate-400">Manage your personal information and security preferences.</p>
      </header>

      <div className="space-y-6">
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <h2 className="text-sm font-semibold text-white">Account Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">First Name</label>
              <input className="w-full h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500" placeholder="John" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Last Name</label>
              <input className="w-full h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500" placeholder="Doe" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Email Address</label>
            <input className="w-full h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500" placeholder="john@example.com" disabled />
            <p className="text-[10px] text-slate-500">Email cannot be changed directly. Contact support for assistance.</p>
          </div>
          <button className="px-4 py-2 rounded-lg bg-violet-600 text-sm font-bold text-white hover:bg-violet-500 transition-colors">
            Save Changes
          </button>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6 text-center py-12">
          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-xl mx-auto mb-4">🔐</div>
          <h2 className="text-sm font-semibold text-white">Security & Password</h2>
          <p className="text-sm text-slate-400 max-w-xs mx-auto">Update your password or enable multi-factor authentication.</p>
          <button className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm font-bold text-white hover:bg-slate-700 transition-colors">
            Manage Security
          </button>
        </div>
      </div>
    </section>
  );
}
