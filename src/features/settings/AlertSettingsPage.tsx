import * as React from 'react';

interface Props {
  organizationId: string;
}

export default function AlertSettingsPage({ organizationId }: Props) {
  return (
    <section className="space-y-8 max-w-4xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Alert Rules</h1>
          <p className="text-sm text-slate-400">Configure automated notifications for specific call events and flags.</p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-violet-600 text-sm font-bold text-white hover:bg-violet-500 transition-colors">
          Create Rule
        </button>
      </header>

      <div className="space-y-4">
        {[
          { name: 'Compliance Breach', trigger: 'Any compliance flag', destination: 'Email, Slack', status: 'Enabled' },
          { name: 'Low Balance', trigger: 'Balance < $500', destination: 'Email', status: 'Enabled' },
        ].map((rule) => (
          <div key={rule.name} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between group hover:border-slate-700 transition-colors">
            <div className="space-y-1">
              <h3 className="font-bold text-white">{rule.name}</h3>
              <div className="flex items-center space-x-4 text-xs text-slate-500">
                <span>Trigger: <span className="text-slate-300">{rule.trigger}</span></span>
                <span>Notify: <span className="text-slate-300">{rule.destination}</span></span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">{rule.status}</span>
              <button className="text-slate-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">Edit</button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800 border-dashed text-center">
        <p className="text-sm text-slate-500">More rule templates available soon.</p>
      </div>
    </section>
  );
}
