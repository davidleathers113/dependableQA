import * as React from 'react';

interface Props {
  organizationId: string;
}

export default function OrganizationSettingsPage({ organizationId }: Props) {
  return (
    <section className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Organization Settings</h1>
        <p className="text-sm text-slate-400">Configure global workspace settings and branding.</p>
      </header>

      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Organization Name</label>
            <input className="w-full h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500" placeholder="My Organization" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Organization Slug</label>
            <input className="w-full h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 font-mono" placeholder="my-organization" />
            <p className="text-[10px] text-slate-500">This is used in your organization's unique URL.</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Billing Contact Email</label>
            <input className="w-full h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-500" placeholder="billing@company.com" />
          </div>
        </div>
        <button className="px-4 py-2 rounded-lg bg-violet-600 text-sm font-bold text-white hover:bg-violet-500 transition-colors">
          Update Organization
        </button>
      </div>

      <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-4">
        <h3 className="text-sm font-semibold text-red-200">Danger Zone</h3>
        <p className="text-xs text-red-400/80">Permanently delete this organization and all associated call data, recordings, and audit logs. This action cannot be undone.</p>
        <button className="px-4 py-2 rounded-lg bg-red-900/20 border border-red-900/50 text-xs font-bold text-red-500 hover:bg-red-900/40 transition-colors uppercase tracking-widest">
          Delete Organization
        </button>
      </div>
    </section>
  );
}
