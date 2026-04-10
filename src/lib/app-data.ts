import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "../../supabase/types";

export type OrganizationRole = "owner" | "admin" | "reviewer" | "analyst" | "billing";
export type ReviewStatus = "unreviewed" | "in_review" | "reviewed" | "reopened";
export type IntegrationProvider = "ringba" | "retreaver" | "trackdrive" | "custom";

export interface OrganizationMembership {
  id: string;
  name: string;
  role: OrganizationRole;
}

export interface CallFilters {
  search?: string;
  reviewStatus?: string;
  publisherId?: string;
  campaignId?: string;
  disposition?: string;
  dateFrom?: string;
  dateTo?: string;
}

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
  sourceProvider: IntegrationProvider;
  importBatchId: string | null;
}

export interface CallFlagItem {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "dismissed" | "confirmed";
  description: string | null;
}

export interface CallHistoryItem {
  id: string;
  type: "analysis" | "review" | "override" | "flag" | "import" | "audit";
  title: string;
  detail: string;
  createdAt: string;
}

export interface CallDetail {
  id: string;
  callerNumber: string;
  destinationNumber: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  campaignName: string | null;
  publisherName: string | null;
  currentDisposition: string | null;
  currentReviewStatus: ReviewStatus;
  flagCount: number;
  sourceProvider: IntegrationProvider;
  importBatchId: string | null;
  sourceStatus: string;
  transcriptText: string | null;
  transcriptSegments: Array<{ speaker: string; text: string; start?: number; end?: number }>;
  analysisSummary: string | null;
  suggestedDisposition: string | null;
  analysisConfidence: number | null;
  flags: CallFlagItem[];
  history: CallHistoryItem[];
}

export interface CallFilterOptions {
  publishers: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
  dispositions: string[];
}

export interface CallsPageData {
  rows: CallListItem[];
  filters: CallFilters;
  options: CallFilterOptions;
}

export interface OverviewData {
  balanceCents: number;
  projectedDaysRemaining: number | null;
  callsThisMonth: number;
  minutesProcessed: number;
  flagRate: number;
  openFlagCount: number;
  needsAttention: Array<{ title: string; description: string; tone: "critical" | "warning" | "info" }>;
  recentActivity: Array<{ type: string; message: string; createdAt: string }>;
}

export interface ImportBatchSummary {
  id: string;
  filename: string;
  status: string;
  rowCountTotal: number;
  rowCountAccepted: number;
  rowCountRejected: number;
  createdAt: string;
  sourceProvider: IntegrationProvider;
}

export interface ImportBatchDetail extends ImportBatchSummary {
  storagePath: string;
  sourceKind: string;
  startedAt: string | null;
  completedAt: string | null;
  callCount: number;
  errors: Array<{
    id: string;
    rowNumber: number;
    errorCode: string;
    errorMessage: string;
    rawRow: Json;
  }>;
}

export interface ImportsPageData {
  batches: ImportBatchSummary[];
}

export interface BillingSummary {
  accountId: string | null;
  billingEmail: string | null;
  autopayEnabled: boolean;
  rechargeThresholdCents: number;
  rechargeAmountCents: number;
  perMinuteRateCents: number;
  currentBalanceCents: number;
  ledger: Array<{
    id: string;
    entryType: string;
    amountCents: number;
    balanceAfterCents: number;
    description: string | null;
    createdAt: string;
  }>;
}

export interface IntegrationCard {
  id: string;
  displayName: string;
  provider: IntegrationProvider;
  status: string;
  mode: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastEventMessage: string | null;
}

export interface IntegrationsSummary {
  integrations: IntegrationCard[];
}

type SupabaseAny = SupabaseClient<any>;

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function assertNoError(error: unknown, fallback: string) {
  if (error) {
    throw new Error(getErrorMessage(error, fallback));
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function asBoolean(value: unknown) {
  return value === true;
}

function formatMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function slugify(value: string) {
  const lower = value.trim().toLowerCase();
  let slug = "";
  let lastWasDash = false;

  for (const character of lower) {
    const isLetter = character >= "a" && character <= "z";
    const isDigit = character >= "0" && character <= "9";

    if (isLetter || isDigit) {
      slug += character;
      lastWasDash = false;
      continue;
    }

    if (!lastWasDash) {
      slug += "-";
      lastWasDash = true;
    }
  }

  while (slug.startsWith("-")) {
    slug = slug.slice(1);
  }

  while (slug.endsWith("-")) {
    slug = slug.slice(0, -1);
  }

  return slug || "organization";
}

function normalizeFilename(fileName: string) {
  return fileName
    .split(" ").join("-")
    .split("/").join("-")
    .split("\\").join("-")
    .split(":").join("-")
    .split("?").join("-")
    .split("#").join("-");
}

function parseSegments(value: unknown): Array<{ speaker: string; text: string; start?: number; end?: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        speaker: asString(record.speaker) || "Speaker",
        text: asString(record.text),
        start: typeof record.start === "number" ? record.start : undefined,
        end: typeof record.end === "number" ? record.end : undefined,
      };
    })
    .filter((item) => item.text.length > 0);
}

export function formatCurrency(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export function buildCallFilters(searchParams: URLSearchParams): CallFilters {
  return {
    search: searchParams.get("search") ?? "",
    reviewStatus: searchParams.get("reviewStatus") ?? "",
    publisherId: searchParams.get("publisherId") ?? "",
    campaignId: searchParams.get("campaignId") ?? "",
    disposition: searchParams.get("disposition") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
  };
}

export function filtersToSearchParams(filters: CallFilters) {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(filters)) {
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (value) {
      params.set(key, value);
    }
  }

  return params;
}

export async function listUserOrganizations(client: SupabaseAny, userId: string) {
  const { data, error } = await client
    .from("organization_members")
    .select("role, organization:organizations(id, name)")
    .eq("user_id", userId)
    .eq("invite_status", "accepted");

  assertNoError(error, "Unable to load organizations.");

  return ((data ?? []) as Array<Record<string, unknown>>)
    .map((membership) => {
      const organization = membership.organization as Record<string, unknown> | null;
      if (!organization) {
        return null;
      }

      return {
        id: asString(organization.id),
        name: asString(organization.name),
        role: (asString(membership.role) || "reviewer") as OrganizationRole,
      } satisfies OrganizationMembership;
    })
    .filter((item): item is OrganizationMembership => Boolean(item?.id));
}

export async function getDefaultOrganizationId(client: SupabaseAny, userId: string, preferredOrganizationId?: string | null) {
  const organizations = await listUserOrganizations(client, userId);

  if (preferredOrganizationId) {
    const match = organizations.find((organization) => organization.id === preferredOrganizationId);
    if (match) {
      return match.id;
    }
  }

  return organizations[0]?.id ?? null;
}

async function searchCallIds(client: SupabaseAny, organizationId: string, rawSearch: string) {
  const search = rawSearch.trim();
  if (!search) {
    return null;
  }

  const [callSearch, transcriptSearch] = await Promise.all([
    client
      .from("calls")
      .select("id")
      .eq("organization_id", organizationId)
      .textSearch("search_document", search, { type: "websearch" }),
    client
      .from("call_transcripts")
      .select("call_id")
      .eq("organization_id", organizationId)
      .textSearch("search_document", search, { type: "websearch" }),
  ]);

  assertNoError(callSearch.error, "Unable to search calls.");
  assertNoError(transcriptSearch.error, "Unable to search transcripts.");

  const ids = new Set<string>();

  for (const row of (callSearch.data ?? []) as Array<Record<string, unknown>>) {
    const id = asString(row.id);
    if (id) {
      ids.add(id);
    }
  }

  for (const row of (transcriptSearch.data ?? []) as Array<Record<string, unknown>>) {
    const id = asString(row.call_id);
    if (id) {
      ids.add(id);
    }
  }

  return Array.from(ids);
}

export async function getCallFilterOptions(client: SupabaseAny, organizationId: string): Promise<CallFilterOptions> {
  const [publishersResult, campaignsResult, callsResult] = await Promise.all([
    client
      .from("publishers")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name"),
    client
      .from("campaigns")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name"),
    client
      .from("calls")
      .select("current_disposition")
      .eq("organization_id", organizationId)
      .not("current_disposition", "is", null),
  ]);

  assertNoError(publishersResult.error, "Unable to load publishers.");
  assertNoError(campaignsResult.error, "Unable to load campaigns.");
  assertNoError(callsResult.error, "Unable to load dispositions.");

  const dispositionSet = new Set<string>();

  for (const row of (callsResult.data ?? []) as Array<Record<string, unknown>>) {
    const disposition = asString(row.current_disposition);
    if (disposition) {
      dispositionSet.add(disposition);
    }
  }

  return {
    publishers: ((publishersResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
    })),
    campaigns: ((campaignsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
    })),
    dispositions: Array.from(dispositionSet).sort(),
  };
}

export async function getCallsPageData(client: SupabaseAny, organizationId: string, filters: CallFilters): Promise<CallsPageData> {
  const optionsPromise = getCallFilterOptions(client, organizationId);
  const matchingIds = await searchCallIds(client, organizationId, filters.search ?? "");

  if (matchingIds && matchingIds.length === 0) {
    return {
      rows: [],
      filters,
      options: await optionsPromise,
    };
  }

  let query = client
    .from("calls")
    .select("id, caller_number, started_at, duration_seconds, current_disposition, current_review_status, flag_count, source_provider, import_batch_id, campaigns(name), publishers(name)")
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false })
    .limit(100);

  if (filters.reviewStatus) {
    query = query.eq("current_review_status", filters.reviewStatus);
  }

  if (filters.publisherId) {
    query = query.eq("publisher_id", filters.publisherId);
  }

  if (filters.campaignId) {
    query = query.eq("campaign_id", filters.campaignId);
  }

  if (filters.disposition) {
    query = query.eq("current_disposition", filters.disposition);
  }

  if (filters.dateFrom) {
    query = query.gte("started_at", filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte("started_at", filters.dateTo);
  }

  if (matchingIds && matchingIds.length > 0) {
    query = query.in("id", matchingIds);
  }

  const { data, error } = await query;
  assertNoError(error, "Unable to load calls.");

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const campaign = row.campaigns as Record<string, unknown> | null;
    const publisher = row.publishers as Record<string, unknown> | null;

    return {
      id: asString(row.id),
      callerNumber: asString(row.caller_number),
      startedAt: asString(row.started_at),
      durationSeconds: asNumber(row.duration_seconds),
      campaignName: asNullableString(campaign?.name),
      publisherName: asNullableString(publisher?.name),
      currentDisposition: asNullableString(row.current_disposition),
      currentReviewStatus: (asString(row.current_review_status) || "unreviewed") as ReviewStatus,
      flagCount: asNumber(row.flag_count),
      topFlag: null,
      sourceProvider: (asString(row.source_provider) || "custom") as IntegrationProvider,
      importBatchId: asNullableString(row.import_batch_id),
    } satisfies CallListItem;
  });

  return {
    rows,
    filters,
    options: await optionsPromise,
  };
}

export async function getCallDetail(client: SupabaseAny, organizationId: string, callId: string): Promise<CallDetail | null> {
  const [callResult, transcriptResult, analysisResult, flagsResult, reviewsResult, overridesResult, auditResult] = await Promise.all([
    client
      .from("calls")
      .select("id, caller_number, destination_number, started_at, ended_at, duration_seconds, current_disposition, current_review_status, flag_count, source_provider, import_batch_id, source_status, campaigns(name), publishers(name)")
      .eq("organization_id", organizationId)
      .eq("id", callId)
      .single(),
    client
      .from("call_transcripts")
      .select("transcript_text, transcript_segments")
      .eq("organization_id", organizationId)
      .eq("call_id", callId)
      .maybeSingle(),
    client
      .from("call_analyses")
      .select("summary, disposition_suggested, confidence, model_name, created_at")
      .eq("organization_id", organizationId)
      .eq("call_id", callId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("call_flags")
      .select("id, title, severity, status, description, created_at")
      .eq("organization_id", organizationId)
      .eq("call_id", callId)
      .order("created_at", { ascending: false }),
    client
      .from("call_reviews")
      .select("id, review_status, final_disposition, review_notes, created_at")
      .eq("organization_id", organizationId)
      .eq("call_id", callId)
      .order("created_at", { ascending: false }),
    client
      .from("disposition_overrides")
      .select("id, previous_disposition, new_disposition, reason, created_at")
      .eq("organization_id", organizationId)
      .eq("call_id", callId)
      .order("created_at", { ascending: false }),
    client
      .from("audit_logs")
      .select("id, action, metadata, created_at")
      .eq("organization_id", organizationId)
      .eq("entity_id", callId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (callResult.error) {
    if (getErrorMessage(callResult.error, "").includes("0 rows")) {
      return null;
    }
    throw new Error(getErrorMessage(callResult.error, "Unable to load call."));
  }

  assertNoError(transcriptResult.error, "Unable to load transcript.");
  assertNoError(analysisResult.error, "Unable to load analysis.");
  assertNoError(flagsResult.error, "Unable to load flags.");
  assertNoError(reviewsResult.error, "Unable to load reviews.");
  assertNoError(overridesResult.error, "Unable to load overrides.");
  assertNoError(auditResult.error, "Unable to load audit log.");

  const call = (callResult.data ?? null) as Record<string, unknown> | null;
  if (!call) {
    return null;
  }

  const campaign = call.campaigns as Record<string, unknown> | null;
  const publisher = call.publishers as Record<string, unknown> | null;
  const transcript = (transcriptResult.data ?? null) as Record<string, unknown> | null;
  const analysis = (analysisResult.data ?? null) as Record<string, unknown> | null;

  const history: CallHistoryItem[] = [];

  if (analysis) {
    history.push({
      id: `analysis-${asString(analysis.created_at)}`,
      type: "analysis",
      title: `Analysis completed by ${asString(analysis.model_name) || "AI"}`,
      detail: asString(analysis.summary) || "Analysis completed.",
      createdAt: asString(analysis.created_at),
    });
  }

  for (const row of (reviewsResult.data ?? []) as Array<Record<string, unknown>>) {
    history.push({
      id: asString(row.id),
      type: "review",
      title: `Review marked ${asString(row.review_status)}`,
      detail: asString(row.review_notes) || asString(row.final_disposition) || "Review updated.",
      createdAt: asString(row.created_at),
    });
  }

  for (const row of (overridesResult.data ?? []) as Array<Record<string, unknown>>) {
    history.push({
      id: asString(row.id),
      type: "override",
      title: `Disposition changed to ${asString(row.new_disposition)}`,
      detail: asString(row.reason),
      createdAt: asString(row.created_at),
    });
  }

  for (const row of (auditResult.data ?? []) as Array<Record<string, unknown>>) {
    const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
    history.push({
      id: asString(row.id),
      type: "audit",
      title: asString(row.action) || "Audit event",
      detail: asString(metadata.summary) || "Recorded in audit log.",
      createdAt: asString(row.created_at),
    });
  }

  history.sort((a, b) => {
    if (a.createdAt < b.createdAt) return 1;
    if (a.createdAt > b.createdAt) return -1;
    return 0;
  });

  return {
    id: asString(call.id),
    callerNumber: asString(call.caller_number),
    destinationNumber: asNullableString(call.destination_number),
    startedAt: asString(call.started_at),
    endedAt: asNullableString(call.ended_at),
    durationSeconds: asNumber(call.duration_seconds),
    campaignName: asNullableString(campaign?.name),
    publisherName: asNullableString(publisher?.name),
    currentDisposition: asNullableString(call.current_disposition),
    currentReviewStatus: (asString(call.current_review_status) || "unreviewed") as ReviewStatus,
    flagCount: asNumber(call.flag_count),
    sourceProvider: (asString(call.source_provider) || "custom") as IntegrationProvider,
    importBatchId: asNullableString(call.import_batch_id),
    sourceStatus: asString(call.source_status) || "received",
    transcriptText: asNullableString(transcript?.transcript_text),
    transcriptSegments: parseSegments(transcript?.transcript_segments),
    analysisSummary: asNullableString(analysis?.summary),
    suggestedDisposition: asNullableString(analysis?.disposition_suggested),
    analysisConfidence: analysis ? asNumber(analysis.confidence) : null,
    flags: ((flagsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: asString(row.id),
      title: asString(row.title),
      severity: (asString(row.severity) || "low") as CallFlagItem["severity"],
      status: (asString(row.status) || "open") as CallFlagItem["status"],
      description: asNullableString(row.description),
    })),
    history,
  };
}

export async function getOverviewData(client: SupabaseAny, organizationId: string): Promise<OverviewData> {
  const monthStart = formatMonthStart();

  const [
    billingResult,
    openFlagsResult,
    recentImportsResult,
    recentEventsResult,
    monthlyCallsResult,
    allCallsResult,
    integrationsResult,
    recentLedgerResult,
  ] = await Promise.all([
    client.from("billing_accounts").select("id").eq("organization_id", organizationId).maybeSingle(),
    client.from("call_flags").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "open"),
    client.from("import_batches").select("id, filename, status, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(3),
    client.from("integration_events").select("id, message, severity, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(3),
    client.from("calls").select("duration_seconds", { count: "exact" }).eq("organization_id", organizationId).gte("started_at", monthStart),
    client.from("calls").select("id, flag_count, duration_seconds").eq("organization_id", organizationId),
    client.from("integrations").select("id, display_name, status").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(3),
    client.from("wallet_ledger_entries").select("balance_after_cents, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(1),
  ]);

  assertNoError(billingResult.error, "Unable to load billing account.");
  assertNoError(openFlagsResult.error, "Unable to load open flags.");
  assertNoError(recentImportsResult.error, "Unable to load imports.");
  assertNoError(recentEventsResult.error, "Unable to load integration events.");
  assertNoError(monthlyCallsResult.error, "Unable to load monthly calls.");
  assertNoError(allCallsResult.error, "Unable to load calls.");
  assertNoError(integrationsResult.error, "Unable to load integrations.");
  assertNoError(recentLedgerResult.error, "Unable to load ledger.");

  const monthlyCalls = ((monthlyCallsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => asNumber(row.duration_seconds));
  const allCalls = ((allCallsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    durationSeconds: asNumber(row.duration_seconds),
    flagCount: asNumber(row.flag_count),
  }));

  const totalMinutes = allCalls.reduce((total, row) => total + row.durationSeconds, 0) / 60;
  const flaggedCalls = allCalls.filter((row) => row.flagCount > 0).length;
  const currentBalance = asNumber((recentLedgerResult.data as Record<string, unknown> | null)?.balance_after_cents);
  const monthlyMinutes = monthlyCalls.reduce((total, seconds) => total + seconds, 0) / 60;
  const burnRate = monthlyMinutes > 0 ? monthlyMinutes / new Date().getUTCDate() : 0;
  const projectedDaysRemaining = burnRate > 0 ? Math.floor((currentBalance / 100) / burnRate) : null;

  const needsAttention: OverviewData["needsAttention"] = [];

  if (currentBalance > 0 && currentBalance < 50000) {
    needsAttention.push({
      title: "Low balance warning",
      description: `Current wallet balance is ${formatCurrency(currentBalance)}.`,
      tone: "critical",
    });
  }

  for (const row of (integrationsResult.data ?? []) as Array<Record<string, unknown>>) {
    const status = asString(row.status);
    if (status === "error" || status === "degraded") {
      needsAttention.push({
        title: `${asString(row.display_name)} needs attention`,
        description: `Integration status is currently ${status}.`,
        tone: "warning",
      });
    }
  }

  const recentActivity: OverviewData["recentActivity"] = [];

  for (const row of (recentImportsResult.data ?? []) as Array<Record<string, unknown>>) {
    recentActivity.push({
      type: "Import",
      message: `${asString(row.filename)} is ${asString(row.status)}.`,
      createdAt: asString(row.created_at),
    });
  }

  for (const row of (recentEventsResult.data ?? []) as Array<Record<string, unknown>>) {
    recentActivity.push({
      type: "Integration",
      message: asString(row.message),
      createdAt: asString(row.created_at),
    });
  }

  recentActivity.sort((a, b) => {
    if (a.createdAt < b.createdAt) return 1;
    if (a.createdAt > b.createdAt) return -1;
    return 0;
  });

  return {
    balanceCents: currentBalance,
    projectedDaysRemaining,
    callsThisMonth: monthlyCallsResult.count ?? 0,
    minutesProcessed: Math.round(totalMinutes),
    flagRate: allCalls.length === 0 ? 0 : Number(((flaggedCalls / allCalls.length) * 100).toFixed(1)),
    openFlagCount: openFlagsResult.count ?? 0,
    needsAttention: needsAttention.slice(0, 3),
    recentActivity: recentActivity.slice(0, 5),
  };
}

export async function getImportsPageData(client: SupabaseAny, organizationId: string): Promise<ImportsPageData> {
  const { data, error } = await client
    .from("import_batches")
    .select("id, filename, status, row_count_total, row_count_accepted, row_count_rejected, created_at, source_provider")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  assertNoError(error, "Unable to load import batches.");

  return {
    batches: ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: asString(row.id),
      filename: asString(row.filename),
      status: asString(row.status),
      rowCountTotal: asNumber(row.row_count_total),
      rowCountAccepted: asNumber(row.row_count_accepted),
      rowCountRejected: asNumber(row.row_count_rejected),
      createdAt: asString(row.created_at),
      sourceProvider: (asString(row.source_provider) || "custom") as IntegrationProvider,
    })),
  };
}

export async function getImportBatchDetail(client: SupabaseAny, organizationId: string, batchId: string): Promise<ImportBatchDetail | null> {
  const [batchResult, errorsResult, callsCountResult] = await Promise.all([
    client
      .from("import_batches")
      .select("id, filename, status, row_count_total, row_count_accepted, row_count_rejected, created_at, source_provider, storage_path, source_kind, started_at, completed_at")
      .eq("organization_id", organizationId)
      .eq("id", batchId)
      .maybeSingle(),
    client
      .from("import_row_errors")
      .select("id, row_number, error_code, error_message, raw_row")
      .eq("organization_id", organizationId)
      .eq("import_batch_id", batchId)
      .order("row_number")
      .limit(100),
    client
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("import_batch_id", batchId),
  ]);

  assertNoError(batchResult.error, "Unable to load import batch.");
  assertNoError(errorsResult.error, "Unable to load import errors.");
  assertNoError(callsCountResult.error, "Unable to load batch calls.");

  const batch = (batchResult.data ?? null) as Record<string, unknown> | null;
  if (!batch) {
    return null;
  }

  return {
    id: asString(batch.id),
    filename: asString(batch.filename),
    status: asString(batch.status),
    rowCountTotal: asNumber(batch.row_count_total),
    rowCountAccepted: asNumber(batch.row_count_accepted),
    rowCountRejected: asNumber(batch.row_count_rejected),
    createdAt: asString(batch.created_at),
    sourceProvider: (asString(batch.source_provider) || "custom") as IntegrationProvider,
    storagePath: asString(batch.storage_path),
    sourceKind: asString(batch.source_kind),
    startedAt: asNullableString(batch.started_at),
    completedAt: asNullableString(batch.completed_at),
    callCount: callsCountResult.count ?? 0,
    errors: ((errorsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: asString(row.id),
      rowNumber: asNumber(row.row_number),
      errorCode: asString(row.error_code),
      errorMessage: asString(row.error_message),
      rawRow: (row.raw_row as Json) ?? null,
    })),
  };
}

export async function getBillingSummary(client: SupabaseAny, organizationId: string): Promise<BillingSummary> {
  const [accountResult, ledgerResult] = await Promise.all([
    client
      .from("billing_accounts")
      .select("id, billing_email, autopay_enabled, recharge_threshold_cents, recharge_amount_cents, per_minute_rate_cents")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    client
      .from("wallet_ledger_entries")
      .select("id, entry_type, amount_cents, balance_after_cents, description, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  assertNoError(accountResult.error, "Unable to load billing account.");
  assertNoError(ledgerResult.error, "Unable to load ledger.");

  const account = (accountResult.data ?? null) as Record<string, unknown> | null;
  const ledger = ((ledgerResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: asString(row.id),
    entryType: asString(row.entry_type),
    amountCents: asNumber(row.amount_cents),
    balanceAfterCents: asNumber(row.balance_after_cents),
    description: asNullableString(row.description),
    createdAt: asString(row.created_at),
  }));

  return {
    accountId: account ? asString(account.id) : null,
    billingEmail: account ? asNullableString(account.billing_email) : null,
    autopayEnabled: account ? asBoolean(account.autopay_enabled) : false,
    rechargeThresholdCents: account ? asNumber(account.recharge_threshold_cents) : 0,
    rechargeAmountCents: account ? asNumber(account.recharge_amount_cents) : 0,
    perMinuteRateCents: account ? asNumber(account.per_minute_rate_cents) : 0,
    currentBalanceCents: ledger[0]?.balanceAfterCents ?? 0,
    ledger,
  };
}

export async function getIntegrationsSummary(client: SupabaseAny, organizationId: string): Promise<IntegrationsSummary> {
  const [integrationsResult, eventsResult] = await Promise.all([
    client
      .from("integrations")
      .select("id, display_name, provider, status, mode, last_success_at, last_error_at")
      .eq("organization_id", organizationId)
      .order("display_name"),
    client
      .from("integration_events")
      .select("id, integration_id, message, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  assertNoError(integrationsResult.error, "Unable to load integrations.");
  assertNoError(eventsResult.error, "Unable to load integration events.");

  const latestByIntegration = new Map<string, string>();
  for (const row of (eventsResult.data ?? []) as Array<Record<string, unknown>>) {
    const integrationId = asString(row.integration_id);
    if (integrationId && !latestByIntegration.has(integrationId)) {
      latestByIntegration.set(integrationId, asString(row.message));
    }
  }

  return {
    integrations: ((integrationsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: asString(row.id),
      displayName: asString(row.display_name),
      provider: (asString(row.provider) || "custom") as IntegrationProvider,
      status: asString(row.status),
      mode: asString(row.mode),
      lastSuccessAt: asNullableString(row.last_success_at),
      lastErrorAt: asNullableString(row.last_error_at),
      lastEventMessage: latestByIntegration.get(asString(row.id)) ?? null,
    })),
  };
}

export async function createOrganizationForUser(
  adminClient: SupabaseAny,
  options: { userId: string; email: string; organizationName: string }
) {
  const name = options.organizationName.trim();
  if (!name) {
    throw new Error("Organization name is required.");
  }

  let slug = slugify(name);
  let counter = 1;

  while (true) {
    const { data, error } = await adminClient
      .from("organizations")
      .insert({
        name,
        slug,
      })
      .select("id, name, slug")
      .single();

    if (!error && data) {
      const organization = data as Record<string, unknown>;
      const organizationId = asString(organization.id);

      const memberInsert = await adminClient.from("organization_members").insert({
        organization_id: organizationId,
        user_id: options.userId,
        role: "owner",
        invite_status: "accepted",
      });
      assertNoError(memberInsert.error, "Unable to create organization membership.");

      const billingInsert = await adminClient.from("billing_accounts").insert({
        organization_id: organizationId,
        billing_email: options.email,
        autopay_enabled: true,
      });
      assertNoError(billingInsert.error, "Unable to create billing account.");

      const auditInsert = await adminClient.from("audit_logs").insert({
        organization_id: organizationId,
        actor_user_id: options.userId,
        entity_type: "organization",
        entity_id: organizationId,
        action: "organization.created",
        after: {
          name,
          slug,
        },
        metadata: {
          summary: "Created organization during onboarding.",
        },
      });
      assertNoError(auditInsert.error, "Unable to record organization audit log.");

      return {
        id: organizationId,
        name: asString(organization.name),
        slug: asString(organization.slug),
      };
    }

    const message = getErrorMessage(error, "Unable to create organization.");
    if (!message.includes("duplicate") && !message.includes("unique")) {
      throw new Error(message);
    }

    counter += 1;
    slug = `${slugify(name)}-${counter}`;
  }
}

export async function createImportBatchRecord(
  client: SupabaseAny,
  options: {
    organizationId: string;
    userId: string;
    fileName: string;
    storagePath: string;
    sourceProvider: IntegrationProvider;
  }
) {
  const { data, error } = await client
    .from("import_batches")
    .insert({
      organization_id: options.organizationId,
      uploaded_by: options.userId,
      filename: normalizeFilename(options.fileName),
      storage_path: options.storagePath,
      source_provider: options.sourceProvider,
      source_kind: "csv",
      status: "uploaded",
    })
    .select("id")
    .single();

  assertNoError(error, "Unable to create import batch.");
  return asString((data as Record<string, unknown>).id);
}

export async function insertAuditLog(
  client: SupabaseAny,
  entry: {
    organizationId: string;
    actorUserId: string | null;
    entityType: string;
    entityId: string;
    action: string;
    before?: Json;
    after?: Json;
    metadata?: Json;
  }
) {
  const { error } = await client.from("audit_logs").insert({
    organization_id: entry.organizationId,
    actor_user_id: entry.actorUserId,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    metadata: entry.metadata ?? {},
  });

  assertNoError(error, "Unable to record audit log.");
}

export { normalizeFilename, slugify };
