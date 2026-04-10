import * as React from 'react';

interface Props {
  organizationId: string;
  callId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CallDetailDrawer({ callId, open, onOpenChange }: Props) {
  if (!open || !callId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange(false)}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl border-l border-slate-800 bg-slate-950 shadow-2xl transition-transform transform translate-x-0">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900/50">
          <div>
            <h2 className="text-lg font-semibold text-white">Call Detail</h2>
            <p className="text-xs font-mono text-slate-500">ID: {callId}</p>
          </div>
          <button
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors"
            onClick={() => onOpenChange(false)}
          >
            ✕
          </button>
        </div>

        <div className="h-[calc(100vh-65px)] overflow-y-auto p-6 space-y-8">
          {/* Metadata Grid */}
          <section className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status</p>
              <p className="text-sm font-medium text-emerald-400">Received</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Source</p>
              <p className="text-sm font-medium text-slate-200 uppercase">Ringba</p>
            </div>
          </section>

          {/* Overview Section */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
              <span>📝</span>
              <span>AI Analysis Summary</span>
            </h3>
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <p className="text-sm text-slate-400 leading-relaxed">
                The caller expressed interest in solar panel installation for a residential property.
                They confirmed home ownership and a monthly electric bill over $100.
                Analysis suggests high intent. No compliance issues detected.
              </p>
            </div>
          </section>

          {/* Action Area */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Operational Actions</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <button className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-500 transition-all shadow-lg shadow-violet-600/10">
                Confirm Disposition
              </button>
              <button className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors">
                Override Disposition
              </button>
              <button className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors">
                Dismiss Flags
              </button>
              <button className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors">
                Re-run AI Analysis
              </button>
            </div>
          </section>

          {/* Audit Trail Placeholder */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-white">History</h3>
            <div className="space-y-4 relative before:absolute before:inset-0 before:left-2 before:w-0.5 before:bg-slate-800">
              <div className="relative pl-8">
                <div className="absolute left-0 top-1.5 w-4.5 h-4.5 rounded-full bg-slate-900 border-4 border-slate-950 ring-2 ring-slate-800"></div>
                <p className="text-xs text-slate-500 font-medium">Apr 10, 14:23</p>
                <p className="text-sm text-slate-300">Analysis completed by GPT-4o</p>
              </div>
              <div className="relative pl-8">
                <div className="absolute left-0 top-1.5 w-4.5 h-4.5 rounded-full bg-slate-900 border-4 border-slate-950 ring-2 ring-slate-800"></div>
                <p className="text-xs text-slate-500 font-medium">Apr 10, 14:22</p>
                <p className="text-sm text-slate-300">Call record ingested via Ringba</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
