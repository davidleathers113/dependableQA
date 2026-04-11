import { PhoneCall, RadioTower, Route, Webhook } from "lucide-react";
import type { IntegrationProvider } from "../../../lib/app-data";

interface Props {
  provider: IntegrationProvider;
  sizeClassName?: string;
  containerClassName?: string;
}

function getProviderTone(provider: IntegrationProvider) {
  if (provider === "ringba") {
    return {
      container: "bg-sky-500/10 text-sky-200",
      icon: RadioTower,
    };
  }

  if (provider === "trackdrive") {
    return {
      container: "bg-violet-500/10 text-violet-200",
      icon: Route,
    };
  }

  if (provider === "retreaver") {
    return {
      container: "bg-emerald-500/10 text-emerald-200",
      icon: PhoneCall,
    };
  }

  return {
    container: "bg-slate-800 text-slate-100",
    icon: Webhook,
  };
}

export function IntegrationProviderIcon({
  provider,
  sizeClassName = "h-5 w-5",
  containerClassName = "flex h-10 w-10 items-center justify-center rounded-xl",
}: Props) {
  const tone = getProviderTone(provider);
  const Icon = tone.icon;

  return (
    <div className={`${containerClassName} ${tone.container}`}>
      <Icon className={sizeClassName} />
    </div>
  );
}
