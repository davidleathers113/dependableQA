import * as React from 'react';

interface Props {
  organizationId: string;
}

export default function AiPage({ organizationId }: Props) {
  return (
    <section className="h-[calc(100vh-160px)] flex flex-col space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Ask AI</h1>
        <p className="text-sm text-slate-400">
          Operator assistant for operational insights and rapid data retrieval.
        </p>
      </header>

      <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 flex flex-col space-y-6 overflow-hidden shadow-xl">
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-sm">✨</div>
            <div className="p-4 rounded-2xl bg-slate-800 border border-slate-700 max-w-[80%]">
              <p className="text-sm text-slate-200">
                Hello! I can help you analyze call data, find specific batches, or summarize operational trends. What would you like to know?
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              'Show me all WhiteRock calls flagged for compliance in the last 7 days',
              'Summarize why disqualified calls rose yesterday',
              'Which publisher has the highest dead air rate this month?',
            ].map((prompt) => (
              <button key={prompt} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-400 hover:text-white hover:border-slate-600 transition-colors">
                {prompt}
              </button>
            ))}
          </div>
          <div className="relative">
            <input
              className="w-full h-14 rounded-2xl border border-slate-700 bg-slate-950 pl-4 pr-16 text-sm outline-none focus:ring-2 focus:ring-violet-500 transition-all shadow-2xl"
              placeholder="Ask a question about your call data..."
            />
            <button className="absolute right-3 top-2.5 h-8 w-10 rounded-xl bg-violet-600 text-white hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/20">
              ↵
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
