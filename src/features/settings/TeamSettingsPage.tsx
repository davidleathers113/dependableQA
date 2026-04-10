import * as React from 'react';

interface Props {
  organizationId: string;
}

export default function TeamSettingsPage({ organizationId }: Props) {
  return (
    <section className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Team Management</h1>
          <p className="text-sm text-slate-400">Manage members and their roles within your organization.</p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-violet-600 text-sm font-bold text-white hover:bg-violet-500 transition-colors">
          Invite Member
        </button>
      </header>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-950/60 text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Member</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Role</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">Status</th>
                <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center font-bold text-xs text-white">JD</div>
                    <div>
                      <p className="text-sm font-medium text-white">John Doe</p>
                      <p className="text-xs text-slate-500">john@example.com</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Owner
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-emerald-500 text-xs font-medium flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>Active</span>
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="text-slate-500 hover:text-white transition-colors">•••</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
