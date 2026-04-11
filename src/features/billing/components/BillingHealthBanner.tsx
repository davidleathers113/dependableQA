import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import type { BillingHealthSummary } from "../../../lib/app-data";

interface Props {
  health: BillingHealthSummary;
  onAction?: () => void;
}

function getToneClasses(status: BillingHealthSummary["status"]) {
  if (status === "healthy") {
    return {
      container: "border-emerald-500/20 bg-emerald-500/10",
      icon: "bg-emerald-500/15 text-emerald-300",
      title: "text-emerald-100",
      description: "text-emerald-200/80",
      button: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20",
    };
  }

  if (status === "warning") {
    return {
      container: "border-amber-500/20 bg-amber-500/10",
      icon: "bg-amber-500/15 text-amber-300",
      title: "text-amber-100",
      description: "text-amber-200/80",
      button: "border-amber-400/20 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20",
    };
  }

  return {
    container: "border-rose-500/20 bg-rose-500/10",
    icon: "bg-rose-500/15 text-rose-300",
    title: "text-rose-100",
    description: "text-rose-200/80",
    button: "border-rose-400/20 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20",
  };
}

function HealthIcon({ status }: Pick<BillingHealthSummary, "status">) {
  if (status === "healthy") {
    return <CheckCircle2 className="h-5 w-5" />;
  }

  if (status === "warning") {
    return <AlertTriangle className="h-5 w-5" />;
  }

  return <CircleAlert className="h-5 w-5" />;
}

export function BillingHealthBanner({ health, onAction }: Props) {
  const tone = getToneClasses(health.status);

  return (
    <div className={`rounded-2xl border p-5 ${tone.container}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
            <HealthIcon status={health.status} />
          </div>
          <div className="space-y-1">
            <p className={`text-sm font-semibold ${tone.title}`}>{health.title}</p>
            <p className={`text-sm ${tone.description}`}>{health.description}</p>
          </div>
        </div>
        {health.actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className={`inline-flex shrink-0 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${tone.button}`}
          >
            {health.actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
