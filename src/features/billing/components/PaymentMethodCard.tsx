import { CreditCard } from "lucide-react";
import type { BillingPaymentMethodSummary } from "../../../lib/app-data";

interface Props {
  paymentMethod: BillingPaymentMethodSummary | null;
  isRefreshing: boolean;
  setupHref: string;
  portalHref: string;
}

function getStatusCopy(paymentMethod: BillingPaymentMethodSummary | null) {
  if (!paymentMethod || paymentMethod.status === "missing") {
    return {
      primary: "No payment method on file",
      secondary: "Add a card to enable auto-recharge",
      status: "Needs attention",
      statusClassName: "text-amber-300",
      cta: "Add payment method",
    };
  }

  if (paymentMethod.status === "attention") {
    return {
      primary: "Card needs attention",
      secondary: "The saved payment method needs review before the next automatic charge",
      status: "Needs attention",
      statusClassName: "text-amber-300",
      cta: "Update card",
    };
  }

  if (paymentMethod.status === "expired") {
    return {
      primary: "Card needs attention",
      secondary: "The saved payment method is expired or unavailable",
      status: "Expired",
      statusClassName: "text-rose-300",
      cta: "Update card",
    };
  }

  if (paymentMethod.brand && paymentMethod.last4) {
    const brand = paymentMethod.brand[0]?.toUpperCase() + paymentMethod.brand.slice(1);
    const expires =
      paymentMethod.expMonth && paymentMethod.expYear
        ? `Expires ${String(paymentMethod.expMonth).padStart(2, "0")}/${paymentMethod.expYear}`
        : "Manage in Stripe";

    return {
      primary: `${brand} ending in ${paymentMethod.last4}`,
      secondary: expires,
      status: "Ready for auto-recharge",
      statusClassName: "text-emerald-300",
      cta: "Update card",
    };
  }

  return {
    primary: paymentMethod.status === "ready" ? "Default payment method ready" : "Payment method managed in Stripe",
    secondary:
      paymentMethod.status === "ready"
        ? "Managed in Stripe and ready for future auto-recharge attempts"
        : "Card details will appear here once available in app data",
    status: paymentMethod.status === "ready" ? "Ready for auto-recharge" : "Needs attention",
    statusClassName: paymentMethod.status === "ready" ? "text-emerald-300" : "text-amber-300",
    cta: "Update card",
  };
}

export function PaymentMethodCard({ paymentMethod, isRefreshing, setupHref, portalHref }: Props) {
  const copy = getStatusCopy(paymentMethod);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className={`${isRefreshing ? "animate-pulse" : ""} space-y-5`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Default Payment Method</p>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-slate-300">
            <CreditCard className="h-5 w-5" />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-white">{copy.primary}</p>
          <p className="text-sm text-slate-400">{copy.secondary}</p>
          <p className={`text-sm ${copy.statusClassName}`}>{copy.status}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href={setupHref}
            className="inline-flex rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800"
          >
            {copy.cta}
          </a>
          <a
            href={portalHref}
            className="inline-flex rounded-lg px-1 py-2 text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200"
          >
            Manage in Stripe
          </a>
        </div>
      </div>
    </div>
  );
}
