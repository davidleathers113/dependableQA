import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import { getBillingSummary, type BillingSummary } from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";
import { AddFundsModal } from "./components/AddFundsModal";
import { AutoRechargeCard } from "./components/AutoRechargeCard";
import { BalanceCard } from "./components/BalanceCard";
import { BillingEventList } from "./components/BillingEventList";
import { BillingHealthBanner } from "./components/BillingHealthBanner";
import { EditAutoRechargeModal } from "./components/EditAutoRechargeModal";
import { PaymentMethodCard } from "./components/PaymentMethodCard";
import { RunwayCard } from "./components/RunwayCard";
import { WalletLedgerTable } from "./components/WalletLedgerTable";

interface Props {
  organizationId: string;
  initialData: BillingSummary;
}

function BillingPageInner({ organizationId, initialData }: Props) {
  const queryClient = useQueryClient();
  const billingQuery = useQuery({
    queryKey: ["billing", organizationId],
    queryFn: () => getBillingSummary(getBrowserSupabase(), organizationId),
    initialData,
  });
  const [isAddFundsOpen, setIsAddFundsOpen] = React.useState(false);
  const [isEditRechargeOpen, setIsEditRechargeOpen] = React.useState(false);
  const data = billingQuery.data;
  const portalHref = "/api/billing/portal";
  const setupHref = "/api/billing/setup-checkout";
  const fundHref = `/api/billing/fund-checkout?amount=${(data.rechargeAmountCents / 100).toFixed(2)}`;
  const canEditRecharge = Boolean(data.accountId);

  const handlePortalOpen = React.useCallback(() => {
    window.location.assign(portalHref);
  }, [portalHref]);

  const handleSetupOpen = React.useCallback(() => {
    window.location.assign(setupHref);
  }, [setupHref]);

  const handleHealthAction = React.useCallback(() => {
    if (data.health.actionKind === "edit_recharge") {
      setIsEditRechargeOpen(true);
      return;
    }

    if (data.health.actionKind === "add_funds") {
      setIsAddFundsOpen(true);
      return;
    }

    if (data.health.actionKind === "update_card" || data.health.actionKind === "setup_billing") {
      handleSetupOpen();
      return;
    }

    handlePortalOpen();
  }, [data.health.actionKind, handlePortalOpen, handleSetupOpen]);

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Billing</h1>
          <p className="text-sm text-slate-400">
            Manage wallet balance, auto-recharge settings, payment methods, and billing history.
          </p>
        </div>
        {billingQuery.error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {billingQuery.error instanceof Error ? billingQuery.error.message : "Unable to refresh billing data."}
          </div>
        ) : null}
      </header>

      <BillingHealthBanner health={data.health} onAction={handleHealthAction} />

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setIsAddFundsOpen(true)}
          className="inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
        >
          Add funds
        </button>
        <button
          type="button"
          onClick={() => setIsEditRechargeOpen(true)}
          disabled={!canEditRecharge}
          className="inline-flex rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          Edit auto-recharge
        </button>
        <a
          href={setupHref}
          className="inline-flex rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800"
        >
          Update payment method
        </a>
        <a
          href={portalHref}
          className="inline-flex rounded-lg px-4 py-2 text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200"
        >
          Open Stripe billing portal
        </a>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <BalanceCard
          currentBalanceCents={data.currentBalanceCents}
          rechargeThresholdCents={data.rechargeThresholdCents}
          isRefreshing={billingQuery.isFetching}
          onAddFunds={() => setIsAddFundsOpen(true)}
        />
        <AutoRechargeCard
          autopayEnabled={data.autopayEnabled}
          rechargeAmountCents={data.rechargeAmountCents}
          rechargeThresholdCents={data.rechargeThresholdCents}
          isRefreshing={billingQuery.isFetching}
          onEdit={() => setIsEditRechargeOpen(true)}
        />
        <PaymentMethodCard
          paymentMethod={data.paymentMethod}
          isRefreshing={billingQuery.isFetching}
          setupHref={setupHref}
          portalHref={portalHref}
        />
        <RunwayCard runway={data.runway} isRefreshing={billingQuery.isFetching} />
      </div>

      <WalletLedgerTable ledger={data.ledger} isRefreshing={billingQuery.isFetching} />
      <BillingEventList events={data.events} isRefreshing={billingQuery.isFetching} />

      <EditAutoRechargeModal
        isOpen={isEditRechargeOpen}
        organizationId={organizationId}
        initialValues={{
          autopayEnabled: data.autopayEnabled,
          rechargeAmountCents: data.rechargeAmountCents,
          rechargeThresholdCents: data.rechargeThresholdCents,
        }}
        onClose={() => setIsEditRechargeOpen(false)}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: ["billing", organizationId] });
        }}
      />
      <AddFundsModal
        isOpen={isAddFundsOpen}
        currentBalanceCents={data.currentBalanceCents}
        fundHref={fundHref}
        portalHref={portalHref}
        onClose={() => setIsAddFundsOpen(false)}
      />
    </section>
  );
}

export default function BillingPage(props: Props) {
  return (
    <QueryProvider>
      <BillingPageInner {...props} />
    </QueryProvider>
  );
}
