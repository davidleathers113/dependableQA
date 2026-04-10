import * as React from 'react';
import { CallsToolbar } from './components/CallsToolbar';
import { CallsTable } from './components/CallsTable';
import { CallDetailDrawer } from './components/CallDetailDrawer';
import type { CallListItem } from '../../types/domain';

interface Props {
  organizationId: string;
  userId: string;
}

export default function CallsPage({ organizationId }: Props) {
  const [selectedCallId, setSelectedCallId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<CallListItem[]>([]);

  React.useEffect(() => {
    // TODO: replace with TanStack Query + server-backed filters
    void organizationId;
    // Dummy data for now
    setRows([
      {
        id: '1',
        callerNumber: '+1 234 567 8901',
        startedAt: '2026-04-10T14:22:00Z',
        durationSeconds: 272,
        campaignName: 'WhiteRock Legal',
        publisherName: 'LeadGen Pro',
        currentDisposition: 'Sale',
        currentReviewStatus: 'unreviewed',
        flagCount: 0,
        topFlag: null,
        sourceProvider: 'ringba',
        importBatchId: 'batch_1'
      },
      {
        id: '2',
        callerNumber: '+1 987 654 3210',
        startedAt: '2026-04-10T13:45:00Z',
        durationSeconds: 120,
        campaignName: 'Solar Direct',
        publisherName: 'SolarFlow',
        currentDisposition: 'Disqualified',
        currentReviewStatus: 'reviewed',
        flagCount: 2,
        topFlag: 'Compliance',
        sourceProvider: 'trackdrive',
        importBatchId: null
      }
    ]);
  }, [organizationId]);

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

      <CallsToolbar organizationId={organizationId} />

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
