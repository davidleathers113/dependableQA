import * as React from "react";
import { Copy } from "lucide-react";

interface Props {
  label: string;
  value: string;
  emptyLabel?: string;
  copyLabel: string;
  copiedLabel?: string;
  disabled?: boolean;
  onCopied?: (message: string) => void;
}

async function copyText(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new Error("Clipboard access is unavailable in this browser.");
  }

  await navigator.clipboard.writeText(value);
}

export function CopyField({
  label,
  value,
  emptyLabel = "—",
  copyLabel,
  copiedLabel = "Copied",
  disabled = false,
  onCopied,
}: Props) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    if (!value || disabled) {
      return;
    }

    try {
      await copyText(value);
      setCopied(true);
      onCopied?.(copyLabel);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [copyLabel, disabled, onCopied, value]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-1 break-all text-sm text-slate-100">{value || emptyLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void handleCopy();
          }}
          disabled={disabled || !value}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  );
}
