import { AlertTriangle, CheckCircle2, CircleAlert, Clock3, Settings2 } from "lucide-react";
import type { IntegrationHealthState } from "../helpers";

interface Props {
  state: IntegrationHealthState;
  label: string;
}

function getTone(state: IntegrationHealthState) {
  if (state === "healthy") {
    return {
      container: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      icon: CheckCircle2,
    };
  }

  if (state === "needs-configuration") {
    return {
      container: "border-amber-500/30 bg-amber-500/10 text-amber-200",
      icon: Settings2,
    };
  }

  if (state === "awaiting-first-event") {
    return {
      container: "border-sky-500/30 bg-sky-500/10 text-sky-200",
      icon: Clock3,
    };
  }

  if (state === "degraded") {
    return {
      container: "border-amber-500/30 bg-amber-500/10 text-amber-200",
      icon: AlertTriangle,
    };
  }

  return {
    container: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    icon: CircleAlert,
  };
}

export function IntegrationStatusBadge({ state, label }: Props) {
  const tone = getTone(state);
  const Icon = tone.icon;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${tone.container}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
