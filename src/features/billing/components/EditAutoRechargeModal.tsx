import * as React from "react";
import { useMutation } from "@tanstack/react-query";

interface Props {
  isOpen: boolean;
  organizationId: string;
  initialValues: {
    autopayEnabled: boolean;
    rechargeAmountCents: number;
    rechargeThresholdCents: number;
  };
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function centsToInputValue(value: number) {
  return (value / 100).toFixed(2);
}

function dollarsToCents(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

export function EditAutoRechargeModal({
  isOpen,
  organizationId,
  initialValues,
  onClose,
  onSaved,
}: Props) {
  const [autopayEnabled, setAutopayEnabled] = React.useState(initialValues.autopayEnabled);
  const [rechargeAmount, setRechargeAmount] = React.useState(centsToInputValue(initialValues.rechargeAmountCents));
  const [rechargeThreshold, setRechargeThreshold] = React.useState(
    centsToInputValue(initialValues.rechargeThresholdCents)
  );
  const [errorMessage, setErrorMessage] = React.useState("");

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    setAutopayEnabled(initialValues.autopayEnabled);
    setRechargeAmount(centsToInputValue(initialValues.rechargeAmountCents));
    setRechargeThreshold(centsToInputValue(initialValues.rechargeThresholdCents));
    setErrorMessage("");
  }, [
    initialValues.autopayEnabled,
    initialValues.rechargeAmountCents,
    initialValues.rechargeThresholdCents,
    isOpen,
  ]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rechargeAmountCents = dollarsToCents(rechargeAmount);
      const rechargeThresholdCents = dollarsToCents(rechargeThreshold);

      if (rechargeAmountCents === null || rechargeAmountCents <= 0) {
        throw new Error("Recharge amount must be greater than $0.00.");
      }

      if (rechargeThresholdCents === null) {
        throw new Error("Recharge threshold must be $0.00 or higher.");
      }

      const response = await fetch("/api/billing/recharge-settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          organizationId,
          autopayEnabled,
          rechargeAmountCents,
          rechargeThresholdCents,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update auto-recharge settings.");
      }
    },
    onSuccess: async () => {
      setErrorMessage("");
      await onSaved();
      onClose();
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update auto-recharge settings.");
    },
  });

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold text-white">Edit auto-recharge</h2>
            <p className="mt-2 text-sm text-slate-400">
              When your balance falls below the threshold, we&apos;ll automatically charge the recharge amount to your
              default payment method.
            </p>
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {errorMessage}
            </div>
          ) : null}

          <div className="space-y-4">
            <label className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
              <div className="space-y-1">
                <span className="text-sm font-semibold text-white">Auto-recharge enabled</span>
                <p className="text-xs text-slate-500">Turn automatic wallet replenishment on or off.</p>
              </div>
              <button
                type="button"
                onClick={() => setAutopayEnabled((current) => !current)}
                className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition-colors ${
                  autopayEnabled ? "bg-violet-600" : "bg-slate-700"
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-white transition-transform ${
                    autopayEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Recharge amount
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rechargeAmount}
                  onChange={(event) => setRechargeAmount(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="1000.00"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Recharge threshold
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rechargeThreshold}
                  onChange={(event) => setRechargeThreshold(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="500.00"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saveMutation.isPending}
              className="inline-flex rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
            >
              {saveMutation.isPending ? "Saving..." : "Save settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
