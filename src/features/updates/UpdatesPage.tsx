interface UpdateEntry {
  id: string;
  title: string;
  version: string;
  date: string;
  tag: string;
  summary: string;
}

interface Props {
  initialEntries: UpdateEntry[];
}

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function UpdatesPage({ initialEntries }: Props) {
  return (
    <section className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Product Updates</h1>
        <p className="text-sm text-slate-400">
          New features, improvements, and system announcements sourced from the product changelog.
        </p>
      </header>

      <div className="relative space-y-12 before:absolute before:inset-0 before:left-4 before:w-0.5 before:bg-slate-800">
        {initialEntries.map((update) => (
          <div key={update.id} className="relative pl-12">
            <div className="absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full border-4 border-slate-950 bg-slate-900 text-[10px] font-bold text-slate-500 ring-2 ring-slate-800">
              {update.version[1]}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-white">{update.title}</h3>
                <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-400">
                  {update.tag}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500">
                {formatDateLabel(update.date)} / {update.version}
              </p>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
                <p className="text-sm leading-relaxed text-slate-300">{update.summary}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
