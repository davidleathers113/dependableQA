import type { IntegrationProvider } from "../../../lib/app-data";
import { getImportProviderHint, getImportProviderLinks, type ImportMode } from "../helpers";

interface Props {
  mode: ImportMode;
  provider: IntegrationProvider;
  onOpenGuide: () => void;
}

export function ImportProviderHint({ mode, provider, onOpenGuide }: Props) {
  const hint = getImportProviderHint(mode, provider);
  const links = getImportProviderLinks(mode, provider);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-slate-200">{hint.label}</p>
        <p className="mt-1 text-sm text-slate-400">{hint.text}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {links.map((link) =>
          link.href === "#import-format-guide" ? (
            <button
              key={link.label}
              type="button"
              onClick={onOpenGuide}
              className="font-semibold text-violet-300 transition-colors hover:text-violet-200"
            >
              {link.label}
            </button>
          ) : (
            <a
              key={link.label}
              href={link.href}
              className="font-semibold text-violet-300 transition-colors hover:text-violet-200"
            >
              {link.label}
            </a>
          )
        )}
      </div>
    </div>
  );
}
