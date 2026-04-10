import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryProvider } from "../../components/providers/QueryProvider";
import { filtersToSearchParams, getCallsPageData, type CallsPageData } from "../../lib/app-data";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";
import { CallsToolbar } from "./components/CallsToolbar";
import { CallsTable } from "./components/CallsTable";
import { CallDetailDrawer } from "./components/CallDetailDrawer";

interface Props {
  organizationId: string;
  userId: string;
  initialData: CallsPageData;
}

function CallsPageInner({ organizationId, initialData }: Props) {
  const [selectedCallId, setSelectedCallId] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState(initialData.filters);

  const callsQuery = useQuery({
    queryKey: ["calls", organizationId, filters],
    queryFn: () => getCallsPageData(getBrowserSupabase(), organizationId, filters),
    initialData,
  });

  React.useEffect(() => {
    const params = filtersToSearchParams(filters);
    const target = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, "", target);
  }, [filters]);

  const rows = callsQuery.data.rows;
  const options = callsQuery.data.options;

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calls</h1>
          <p className="text-sm text-slate-400">
            Search, review, and audit AI-classified calls.
          </p>
        </div>
      </header>

      <CallsToolbar filters={filters} options={options} onChange={setFilters} />

      <CallsTable
        rows={rows}
        onRowClick={(row) => setSelectedCallId(row.id)}
      />

      <CallDetailDrawer
        organizationId={organizationId}
        callId={selectedCallId}
        open={Boolean(selectedCallId)}
        onOpenChange={(open) => {
          if (!open) setSelectedCallId(null);
        }}
      />
    </section>
  );
}

export default function CallsPage(props: Props) {
  return (
    <QueryProvider>
      <CallsPageInner {...props} />
    </QueryProvider>
  );
}
