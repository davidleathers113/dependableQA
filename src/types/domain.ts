export type ReviewStatus = 'unreviewed' | 'in_review' | 'reviewed' | 'reopened';

export interface CallListItem {
  id: string;
  callerNumber: string;
  startedAt: string;
  durationSeconds: number;
  campaignName: string | null;
  publisherName: string | null;
  currentDisposition: string | null;
  currentReviewStatus: ReviewStatus;
  flagCount: number;
  topFlag: string | null;
  sourceProvider: 'ringba' | 'retreaver' | 'trackdrive' | 'custom';
  importBatchId: string | null;
}

export interface CallDetail extends CallListItem {
  destinationNumber: string | null;
  endedAt: string | null;
  transcriptText: string | null;
  analysisSummary: string | null;
  suggestedDisposition: string | null;
  analysisConfidence: number | null;
  flags: Array<{
    id: string;
    title: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'dismissed' | 'confirmed';
    description: string | null;
  }>;
}
