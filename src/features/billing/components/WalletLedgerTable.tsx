import * as React from "react";
import { Download } from "lucide-react";
import { formatCurrency, type BillingLedgerEntrySummary } from "../../../lib/app-data";

interface Props {
  ledger: BillingLedgerEntrySummary[];
  isRefreshing: boolean;
}

type DateRangeFilter = "all" | "7d" | "30d" | "90d";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanizeToken(value: string) {
  const parts = value
    .split("_")
    .join(" ")
    .split("-")
    .join(" ")
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parts
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function statusClasses(status: string) {
  if (status === "completed" || status === "applied") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }

  if (status === "failed") {
    return "border-rose-500/20 bg-rose-500/10 text-rose-300";
  }

  if (status === "pending") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  }

  return "border-slate-700 bg-slate-800 text-slate-300";
}

function amountClasses(amountCents: number) {
  if (amountCents > 0) {
    return "text-emerald-300";
  }

  if (amountCents < 0) {
    return "text-rose-300";
  }

  return "text-slate-300";
}

function csvEscape(value: string) {
  if (!value.includes(",") && !value.includes('"') && !value.includes("\n")) {
    return value;
  }

  return `"${value.split('"').join('""')}"`;
}

export function WalletLedgerTable({ ledger, isRefreshing }: Props) {
  const [dateRange, setDateRange] = React.useState<DateRangeFilter>("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");

  const typeOptions = React.useMemo(
    () => Array.from(new Set(ledger.map((entry) => entry.entryType))).sort(),
    [ledger]
  );
  const statusOptions = React.useMemo(
    () => Array.from(new Set(ledger.map((entry) => entry.status))).sort(),
    [ledger]
  );

  const filteredLedger = React.useMemo(() => {
    const now = Date.now();

    return ledger.filter((entry) => {
      if (typeFilter !== "all" && entry.entryType !== typeFilter) {
        return false;
      }

      if (statusFilter !== "all" && entry.status !== statusFilter) {
        return false;
      }

      if (dateRange === "all") {
        return true;
      }

      const createdAt = new Date(entry.createdAt).getTime();
      if (!Number.isFinite(createdAt)) {
        return false;
      }

      const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
      return createdAt >= now - days * 24 * 60 * 60 * 1000;
    });
  }, [dateRange, ledger, statusFilter, typeFilter]);

  const exportCsv = React.useCallback(() => {
    const rows = [
      [
        "Date & Time",
        "Type",
        "Description",
        "Status",
        "Amount",
        "Balance After",
        "Reference",
      ],
      ...filteredLedger.map((entry) => [
        formatDateTime(entry.createdAt),
        humanizeToken(entry.entryType),
        entry.description ?? "",
        humanizeToken(entry.status),
        formatCurrency(entry.amountCents),
        formatCurrency(entry.balanceAfterCents),
        entry.reference ?? "",
      ]),
    ];

    const csv = rows.map((row) => row.map((cell) => csvEscape(cell)).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "wallet-ledger.csv";
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }, [filteredLedger]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Wallet Ledger</h2>
          <p className="text-sm text-slate-400">Credits, debits, recharges, and balance changes.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={dateRange}
            onChange={(event) => setDateRange(event.target.value as DateRangeFilter)}
            className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="all">All dates</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="all">All types</option>
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {humanizeToken(option)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {humanizeToken(option)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400">
              <tr>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.18em]">Date &amp; Time</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.18em]">Type</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.18em]">Description</th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.18em]">Status</th>
                <th className="px-6 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em]">Amount</th>
                <th className="px-6 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.18em]">
                  Balance After
                </th>
                <th className="px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.18em]">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isRefreshing && filteredLedger.length === 0 ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`billing-ledger-loading-${index}`}>
                    <td colSpan={7} className="px-6 py-5">
                      <div className="space-y-2">
                        <div className="h-3 w-32 animate-pulse rounded bg-slate-800" />
                        <div className="h-4 w-full animate-pulse rounded bg-slate-800" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="mx-auto max-w-md space-y-3">
                      <div className="inline-flex rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        No wallet activity yet
                      </div>
                      <p className="text-base font-medium text-slate-300">No wallet activity yet</p>
                      <p className="text-sm text-slate-500">
                        Credits, debits, and recharge events will appear here once billing activity starts.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLedger.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-slate-800/50">
                    <td className="px-6 py-4 text-slate-300">{formatDateTime(entry.createdAt)}</td>
                    <td className="px-6 py-4 text-slate-300">{humanizeToken(entry.entryType)}</td>
                    <td className="px-6 py-4 text-slate-400">{entry.description ?? "—"}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusClasses(entry.status)}`}
                      >
                        {humanizeToken(entry.status)}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-right font-semibold ${amountClasses(entry.amountCents)}`}>
                      {entry.amountCents > 0 ? "+" : ""}
                      {formatCurrency(entry.amountCents)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-200">
                      {formatCurrency(entry.balanceAfterCents)}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{entry.reference ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
