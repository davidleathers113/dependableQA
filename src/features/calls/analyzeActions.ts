/**
 * Pure helpers for the Calls-list "Analyze selected" affordance. The actual
 * spend/tenant/cap enforcement lives server-side in
 * `/api/calls/analyze-selected` (`enqueueAnalysisForCalls`); this helper only
 * shapes the post-run summary message and is unit-tested in isolation. The cost
 * estimate uses the shared, wallet-accurate `estimateBatchCostLabel`
 * (`src/features/billing/pricing.ts`).
 */

export interface AnalyzeSelectionSummary {
  requested: number;
  transcriptionQueued: number;
  analysisQueued: number;
  skipped: Array<{ callId: string; reason: string }>;
}

const SKIP_REASON_LABELS: Record<string, string> = {
  not_in_org: "not in this organization",
  no_media: "no recording",
  already_queued: "already queued",
};

/** Human-readable summary of an analyze-selected response for the notice banner. */
export function summarizeAnalyzeResult(result: AnalyzeSelectionSummary): string {
  const parts = [
    `Queued ${result.transcriptionQueued} transcription and ${result.analysisQueued} analysis job(s).`,
  ];

  if (result.skipped.length > 0) {
    const counts = new Map<string, number>();
    for (const item of result.skipped) {
      counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
    }
    const detail = Array.from(counts.entries())
      .map(([reason, count]) => `${count} ${SKIP_REASON_LABELS[reason] ?? reason.split("_").join(" ")}`)
      .join(", ");
    parts.push(`Skipped ${result.skipped.length} (${detail}).`);
  }

  return parts.join(" ");
}
