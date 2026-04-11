import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../supabase/types";
import {
  getPublicIntegrationWebhookAuth,
  type IntegrationWebhookDefaults,
  type PublicIntegrationEvent,
  type PublicIntegrationWebhookAuth,
} from "./integration-config";

export type OrganizationRole = "owner" | "admin" | "reviewer" | "analyst" | "billing";
export type ReviewStatus = "unreviewed" | "in_review" | "reviewed" | "reopened";
export type IntegrationProvider = "ringba" | "retreaver" | "trackdrive" | "custom";
export type CallSortBy = "startedAt" | "durationSeconds" | "flagCount" | "updatedAt";
export type CallSortDirection = "asc" | "desc";
export type CallTableDensity = "comfortable" | "compact";

export interface OrganizationMembership {
  id: string;
  name: string;
  role: OrganizationRole;
}

export interface CallFilters {
  search?: string;
  reviewStatus?: ReviewStatus;
  publisherId?: string;
  campaignId?: string;
  disposition?: string;
  dateFrom?: string;
  dateTo?: string;
  flaggedOnly?: boolean;
  flagCategory?: string;
  sortBy?: CallSortBy;
  sortDirection?: CallSortDirection;
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
  importBatchFilename: string | null;
  reviewedByName: string | null;
  lastUpdatedAt: string;
}

export interface CallFlagItem {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "dismissed" | "confirmed";
  category: string;
  description: string | null;
  evidenceSummary: string[];
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
  topFlag: string | null;
  severitySummary: string | null;
  sourceProvider: IntegrationProvider;
  importBatchId: string | null;
  importBatchFilename: string | null;
  sourceStatus: string;
  transcriptText: string | null;
  transcriptSegments: Array<{ speaker: string; text: string; start?: number; end?: number }>;
  analysisSummary: string | null;
  suggestedDisposition: string | null;
  analysisConfidence: number | null;
  analysisModelName: string | null;
  analysisVersion: string | null;
  analysisStructuredOutput: Json | null;
  latestReviewNotes: string | null;
  latestReviewedByName: string | null;
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
  summary: CallsSummary;
}

export interface CallsSummary {
  totalCalls: number;
  flaggedCalls: number;
  needsReviewCount: number;
  complianceFlagCount: number;
  qualifiedCount: number;
  disqualifiedCount: number;
  topFlaggedPublisher: {
    publisherId: string | null;
    publisherName: string;
    flaggedCalls: number;
    totalCalls: number;
  } | null;
}

export interface SavedViewSummary {
  id: string;
  name: string;
  isDefault: boolean;
  config: CallSavedViewConfig;
}

export interface CallSavedViewConfig {
  filters: CallFilters;
  density?: CallTableDensity;
  visibleColumns?: string[];
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

export type BillingHealthStatus = "healthy" | "warning" | "critical";
export type BillingHealthActionKind =
  | "edit_recharge"
  | "update_card"
  | "add_funds"
  | "open_portal"
  | "setup_billing"
  | null;
export type BillingPaymentMethodStatus = "ready" | "missing" | "expired" | "attention";
export type BillingLedgerEntryType =
  | "funding"
  | "usage"
  | "auto_recharge"
  | "adjustment"
  | "refund"
  | "failed_recharge"
  | string;
export type BillingLedgerEntryStatus = "completed" | "applied" | "failed" | "pending" | string;

export interface BillingPaymentMethodSummary {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  status: BillingPaymentMethodStatus;
  lastChargeAt: string | null;
}

export interface BillingRunwaySummary {
  projectedDaysRemaining: number | null;
  averageDailySpendCents: number | null;
  estimatedNextRechargeAt: string | null;
}

export interface BillingHealthSummary {
  status: BillingHealthStatus;
  title: string;
  description: string;
  actionLabel?: string | null;
  actionKind?: BillingHealthActionKind;
}

export interface BillingLedgerEntrySummary {
  id: string;
  entryType: BillingLedgerEntryType;
  status: BillingLedgerEntryStatus;
  amountCents: number;
  balanceAfterCents: number;
  description: string | null;
  reference: string | null;
  createdAt: string;
}

export interface BillingEventSummary {
  id: string;
  type: "recharge" | "payment_method" | "settings" | "funding" | "alert" | "info";
  message: string;
  createdAt: string;
  tone: "success" | "warning" | "critical" | "info";
}

export interface BillingSummary {
  accountId: string | null;
  billingEmail: string | null;
  autopayEnabled: boolean;
  rechargeThresholdCents: number;
  rechargeAmountCents: number;
  perMinuteRateCents: number;
  currentBalanceCents: number;
  paymentMethod: BillingPaymentMethodSummary | null;
  runway: BillingRunwaySummary;
  health: BillingHealthSummary;
  ledger: BillingLedgerEntrySummary[];
  events: BillingEventSummary[];
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
  lastEventSeverity: string | null;
  webhookAuth: PublicIntegrationWebhookAuth;
  recentEvents: PublicIntegrationEvent[];
}

export interface IntegrationsSummary {
  integrations: IntegrationCard[];
}

export interface ReportsSummaryCard {
  id: string;
  title: string;
  value: string;
  trend: string;
  description: string;
}

export interface ReportsPublisherBreakdown {
  publisherId: string | null;
  publisherName: string;
  totalCalls: number;
  flaggedCalls: number;
  flagRate: number;
}

export interface ReportsRecentImport {
  id: string;
  filename: string;
  status: string;
  rowCountTotal: number;
  rowCountRejected: number;
  createdAt: string;
}

export interface ReportsSummary {
  cards: ReportsSummaryCard[];
  publisherBreakdown: ReportsPublisherBreakdown[];
  recentImports: ReportsRecentImport[];
  reviewVelocity: {
    reviewsThisMonth: number;
    reviewsPreviousMonth: number;
    averagePerDay: number;
  };
}

export interface ProfileSettingsData {
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

export interface ProfileSettingsInput {
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

export interface OrganizationSettingsData {
  name: string;
  slug: string;
  timezone: string;
  status: string;
  billingEmail: string;
}

export interface OrganizationSettingsInput {
  name: string;
  slug: string;
  timezone: string;
  billingEmail: string;
}

export interface TeamMemberSummary {
  id: string;
  userId: string | null;
  inviteEmail: string | null;
  name: string;
  email: string;
  initials: string;
  role: OrganizationRole;
  inviteStatus: string;
  createdAt: string;
}

export interface TeamSettingsData {
  members: TeamMemberSummary[];
}

export interface ApiKeySummary {
  id: string;
  label: string;
  tokenPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeysData {
  keys: ApiKeySummary[];
}

export interface AlertRuleSummary {
  id: string;
  name: string;
  isEnabled: boolean;
  triggerSummary: string;
  destinationSummary: string;
  cooldownMinutes: number;
  createdAt: string;
}

export interface AlertRulesData {
  rules: AlertRuleSummary[];
}

export interface AlertRuleInput {
  name: string;
  triggerSummary: string;
  destinationSummary: string;
  cooldownMinutes: number;
  isEnabled: boolean;
}

export interface AiAssistantResponse {
  answer: string;
  references: string[];
  followUps: string[];
}

type SupabaseAny = SupabaseClient<Database>;

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

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asBoolean(value: unknown) {
  return value === true;
}

function formatMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function formatMonthStartWithOffset(offset: number, date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)).toISOString();
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeBoolean(value: unknown) {
  return value === true;
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return ((current - previous) / previous) * 100;
}

function formatPercent(value: number) {
  return `${Number(value.toFixed(1))}%`;
}

function formatTrend(current: number, previous: number, noun: string) {
  if (current === previous) {
    return `Flat vs previous ${noun}`;
  }

  const change = Math.abs(percentageChange(current, previous));
  const direction = current > previous ? "up" : "down";
  return `${direction} ${formatPercent(change)} vs previous ${noun}`;
}

function getDispositionCategory(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (
    normalized.includes("qualif") ||
    normalized.includes("sale") ||
    normalized.includes("book") ||
    normalized.includes("close")
  ) {
    return "qualified";
  }

  if (
    normalized.includes("disqual") ||
    normalized.includes("reject") ||
    normalized.includes("spam") ||
    normalized.includes("no sale")
  ) {
    return "disqualified";
  }

  return "other";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getAlertTriggerSummary(value: unknown) {
  const config = asRecord(value);
  return asString(config?.summary) || "Custom rule";
}

function getAlertDestinationSummary(value: unknown) {
  const config = asRecord(value);
  const summary = asString(config?.summary);
  if (summary) {
    return summary;
  }

  const destinations = config?.destinations;
  if (!Array.isArray(destinations)) {
    return "No destination configured";
  }

  const values = destinations
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);

  return values.length > 0 ? values.join(", ") : "No destination configured";
}

function getInitials(name: string, email: string) {
  const parts = name.split(" ").map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return email.slice(0, 2).toUpperCase() || "NA";
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

function hasValidStorageSegment(value: string) {
  const segment = value.trim();
  if (!segment || segment === "." || segment === "..") {
    return false;
  }

  return !segment.includes("/");
}

export function isValidImportStoragePath(organizationId: string, storagePath: string) {
  const normalizedOrganizationId = organizationId.trim();
  const normalizedPath = storagePath.trim();

  if (!hasValidStorageSegment(normalizedOrganizationId)) {
    return false;
  }

  if (!normalizedPath.startsWith(`${normalizedOrganizationId}/`)) {
    return false;
  }

  const segments = normalizedPath.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 2) {
    return false;
  }

  for (const segment of segments) {
    if (!hasValidStorageSegment(segment)) {
      return false;
    }
  }

  return true;
}

export function buildImportStoragePath(organizationId: string, fileName: string, now = Date.now()) {
  const safeName = `${now}-${normalizeFilename(fileName)}`;
  return `${organizationId.trim()}/${safeName}`;
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

const DEFAULT_CALL_FILTERS: Required<
  Pick<CallFilters, "search" | "publisherId" | "campaignId" | "disposition" | "dateFrom" | "dateTo" | "flagCategory" | "sortBy" | "sortDirection">
> &
  Pick<CallFilters, "reviewStatus" | "flaggedOnly"> = {
  search: "",
  reviewStatus: undefined,
  publisherId: "",
  campaignId: "",
  disposition: "",
  dateFrom: "",
  dateTo: "",
  flaggedOnly: false,
  flagCategory: "",
  sortBy: "startedAt",
  sortDirection: "desc",
};

export { DEFAULT_CALL_FILTERS };

function toReviewStatus(value: string | null): ReviewStatus | undefined {
  if (value === "unreviewed" || value === "in_review" || value === "reviewed" || value === "reopened") {
    return value;
  }

  return undefined;
}

function toCallSortBy(value: string | null): CallSortBy | undefined {
  if (
    value === "startedAt" ||
    value === "durationSeconds" ||
    value === "flagCount" ||
    value === "updatedAt"
  ) {
    return value;
  }

  return undefined;
}

function toCallSortDirection(value: string | null): CallSortDirection | undefined {
  if (value === "asc" || value === "desc") {
    return value;
  }

  return undefined;
}

export function normalizeCallFilters(filters: CallFilters): CallFilters {
  return {
    search: asString(filters.search).trim(),
    reviewStatus: toReviewStatus(filters.reviewStatus ?? null),
    publisherId: asString(filters.publisherId).trim(),
    campaignId: asString(filters.campaignId).trim(),
    disposition: asString(filters.disposition).trim(),
    dateFrom: asString(filters.dateFrom).trim(),
    dateTo: asString(filters.dateTo).trim(),
    flaggedOnly: normalizeBoolean(filters.flaggedOnly),
    flagCategory: asString(filters.flagCategory).trim(),
    sortBy: filters.sortBy ?? DEFAULT_CALL_FILTERS.sortBy,
    sortDirection: filters.sortDirection ?? DEFAULT_CALL_FILTERS.sortDirection,
  };
}

export function buildCallFilters(searchParams: URLSearchParams): CallFilters {
  return normalizeCallFilters({
    search: searchParams.get("search") ?? "",
    reviewStatus: toReviewStatus(searchParams.get("reviewStatus")),
    publisherId: searchParams.get("publisherId") ?? "",
    campaignId: searchParams.get("campaignId") ?? "",
    disposition: searchParams.get("disposition") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    flaggedOnly: searchParams.get("flaggedOnly") === "true",
    flagCategory: searchParams.get("flagCategory") ?? "",
    sortBy: toCallSortBy(searchParams.get("sortBy")),
    sortDirection: toCallSortDirection(searchParams.get("sortDirection")),
  });
}

export function filtersToSearchParams(filters: CallFilters) {
  const normalized = normalizeCallFilters(filters);
  const params = new URLSearchParams();

  if (normalized.search) {
    params.set("search", normalized.search);
  }

  if (normalized.reviewStatus) {
    params.set("reviewStatus", normalized.reviewStatus);
  }

  if (normalized.publisherId) {
    params.set("publisherId", normalized.publisherId);
  }

  if (normalized.campaignId) {
    params.set("campaignId", normalized.campaignId);
  }

  if (normalized.disposition) {
    params.set("disposition", normalized.disposition);
  }

  if (normalized.dateFrom) {
    params.set("dateFrom", normalized.dateFrom);
  }

  if (normalized.dateTo) {
    params.set("dateTo", normalized.dateTo);
  }

  if (normalized.flaggedOnly) {
    params.set("flaggedOnly", "true");
  }

  if (normalized.flagCategory) {
    params.set("flagCategory", normalized.flagCategory);
  }

  if (normalized.sortBy && normalized.sortBy !== DEFAULT_CALL_FILTERS.sortBy) {
    params.set("sortBy", normalized.sortBy);
  }

  if (normalized.sortDirection && normalized.sortDirection !== DEFAULT_CALL_FILTERS.sortDirection) {
    params.set("sortDirection", normalized.sortDirection);
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

async function getFlagFilteredCallIds(client: SupabaseAny, organizationId: string, filters: CallFilters) {
  const normalized = normalizeCallFilters(filters);
  if (!normalized.flaggedOnly && !normalized.flagCategory) {
    return null;
  }

  let query = client
    .from("call_flags")
    .select("call_id")
    .eq("organization_id", organizationId)
    .eq("status", "open");

  if (normalized.flagCategory) {
    query = query.eq("flag_category", normalized.flagCategory);
  }

  const { data, error } = await query;
  assertNoError(error, "Unable to load flag filters.");

  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = asString(row.call_id);
    if (id) {
      ids.add(id);
    }
  }

  return Array.from(ids);
}

function intersectCallIds(...groups: Array<string[] | null>) {
  const populated = groups.filter((group): group is string[] => Array.isArray(group));
  if (populated.length === 0) {
    return null;
  }

  let current = new Set(populated[0]);
  for (const group of populated.slice(1)) {
    const next = new Set(group);
    current = new Set(Array.from(current).filter((id) => next.has(id)));
  }

  return Array.from(current);
}

function getSeverityRank(value: string) {
  if (value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function buildEvidenceSummary(value: unknown) {
  const evidence = asRecord(value);
  if (!evidence) {
    return [] as string[];
  }

  const entries = Object.entries(evidence)
    .map(([key, rawValue]) => {
      if (typeof rawValue === "string" && rawValue.trim()) {
        return `${key}: ${rawValue.trim()}`;
      }

      if (typeof rawValue === "number" || typeof rawValue === "boolean") {
        return `${key}: ${String(rawValue)}`;
      }

      if (Array.isArray(rawValue) && rawValue.length > 0) {
        const values = rawValue
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((item) => item.length > 0);
        if (values.length > 0) {
          return `${key}: ${values.join(", ")}`;
        }
      }

      return "";
    })
    .filter((entry) => entry.length > 0);

  return entries.slice(0, 3);
}

function getDisplayName(profile: Record<string, unknown> | null) {
  if (!profile) {
    return null;
  }

  const fullName = `${asString(profile.first_name)} ${asString(profile.last_name)}`.trim();
  if (fullName) {
    return fullName;
  }

  return asNullableString(profile.email);
}

async function getCallTopFlags(
  client: SupabaseAny,
  organizationId: string,
  callIds: string[]
) {
  if (callIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await client
    .from("call_flags")
    .select("call_id, title, severity, status, created_at")
    .eq("organization_id", organizationId)
    .in("call_id", callIds)
    .order("created_at", { ascending: false });

  assertNoError(error, "Unable to load top flags.");

  const topFlags = new Map<string, { title: string; severity: string; status: string; createdAt: string }>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const callId = asString(row.call_id);
    if (!callId) {
      continue;
    }

    const candidate = {
      title: asString(row.title),
      severity: asString(row.severity),
      status: asString(row.status),
      createdAt: asString(row.created_at),
    };

    const existing = topFlags.get(callId);
    if (!existing) {
      topFlags.set(callId, candidate);
      continue;
    }

    const existingStatusRank = existing.status === "open" ? 1 : 0;
    const candidateStatusRank = candidate.status === "open" ? 1 : 0;
    const existingSeverityRank = getSeverityRank(existing.severity);
    const candidateSeverityRank = getSeverityRank(candidate.severity);

    if (
      candidateStatusRank > existingStatusRank ||
      (candidateStatusRank === existingStatusRank && candidateSeverityRank > existingSeverityRank) ||
      (candidateStatusRank === existingStatusRank &&
        candidateSeverityRank === existingSeverityRank &&
        candidate.createdAt > existing.createdAt)
    ) {
      topFlags.set(callId, candidate);
    }
  }

  return new Map(Array.from(topFlags.entries()).map(([callId, flag]) => [callId, flag.title || null]));
}

async function getLatestReviewers(
  client: SupabaseAny,
  organizationId: string,
  callIds: string[]
) {
  if (callIds.length === 0) {
    return new Map<string, string | null>();
  }

  const reviewsResult = await client
    .from("call_reviews")
    .select("call_id, reviewed_by, created_at")
    .eq("organization_id", organizationId)
    .in("call_id", callIds)
    .order("created_at", { ascending: false });

  assertNoError(reviewsResult.error, "Unable to load call reviewers.");

  const latestByCall = new Map<string, string>();
  for (const row of (reviewsResult.data ?? []) as Array<Record<string, unknown>>) {
    const callId = asString(row.call_id);
    const reviewerId = asString(row.reviewed_by);
    if (callId && reviewerId && !latestByCall.has(callId)) {
      latestByCall.set(callId, reviewerId);
    }
  }

  const reviewerIds = Array.from(new Set(Array.from(latestByCall.values())));
  if (reviewerIds.length === 0) {
    return new Map();
  }

  const profilesResult = await client
    .from("profiles")
    .select("id, first_name, last_name, email")
    .in("id", reviewerIds);

  assertNoError(profilesResult.error, "Unable to load reviewer names.");

  const profilesById = new Map<string, Record<string, unknown>>();
  for (const row of (profilesResult.data ?? []) as Array<Record<string, unknown>>) {
    const id = asString(row.id);
    if (id) {
      profilesById.set(id, row);
    }
  }

  return new Map(
    Array.from(latestByCall.entries()).map(([callId, reviewerId]) => [
      callId,
      getDisplayName(profilesById.get(reviewerId) ?? null),
    ])
  );
}

async function getCallsSummary(
  client: SupabaseAny,
  organizationId: string,
  filters: CallFilters,
  matchingIds: string[] | null
): Promise<CallsSummary> {
  const normalized = normalizeCallFilters(filters);
  let query = client
    .from("calls")
    .select("id, publisher_id, current_disposition, current_review_status, flag_count")
    .eq("organization_id", organizationId);

  if (normalized.reviewStatus) {
    query = query.eq("current_review_status", normalized.reviewStatus);
  }

  if (normalized.publisherId) {
    query = query.eq("publisher_id", normalized.publisherId);
  }

  if (normalized.campaignId) {
    query = query.eq("campaign_id", normalized.campaignId);
  }

  if (normalized.disposition) {
    query = query.eq("current_disposition", normalized.disposition);
  }

  if (normalized.dateFrom) {
    query = query.gte("started_at", normalized.dateFrom);
  }

  if (normalized.dateTo) {
    query = query.lte("started_at", normalized.dateTo);
  }

  if (matchingIds && matchingIds.length > 0) {
    query = query.in("id", matchingIds);
  }

  const { data, error } = await query.limit(500);
  assertNoError(error, "Unable to load calls summary.");

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const callIds = rows.map((row) => asString(row.id)).filter((id) => id.length > 0);

  const complianceResult = callIds.length
    ? await client
        .from("call_flags")
        .select("call_id, flag_category")
        .eq("organization_id", organizationId)
        .eq("status", "open")
        .in("call_id", callIds)
    : { data: [], error: null };

  assertNoError(complianceResult.error, "Unable to load compliance flags.");

  const publisherMetrics = new Map<string, { totalCalls: number; flaggedCalls: number }>();
  for (const row of rows) {
    const publisherId = asNullableString(row.publisher_id) ?? "unassigned";
    const metrics = publisherMetrics.get(publisherId) ?? { totalCalls: 0, flaggedCalls: 0 };
    metrics.totalCalls += 1;
    if (asNumber(row.flag_count) > 0) {
      metrics.flaggedCalls += 1;
    }
    publisherMetrics.set(publisherId, metrics);
  }

  const publisherIds = Array.from(publisherMetrics.keys()).filter((publisherId) => publisherId !== "unassigned");
  const publishersResult = publisherIds.length
    ? await client
        .from("publishers")
        .select("id, name")
        .eq("organization_id", organizationId)
        .in("id", publisherIds)
    : { data: [], error: null };

  assertNoError(publishersResult.error, "Unable to load publisher summary.");

  const publisherNames = new Map<string, string>();
  for (const row of (publishersResult.data ?? []) as Array<Record<string, unknown>>) {
    publisherNames.set(asString(row.id), asString(row.name));
  }

  const topFlaggedPublisher = Array.from(publisherMetrics.entries())
    .map(([publisherId, metrics]) => ({
      publisherId: publisherId === "unassigned" ? null : publisherId,
      publisherName: publisherId === "unassigned" ? "Unassigned" : publisherNames.get(publisherId) ?? "Unknown Publisher",
      flaggedCalls: metrics.flaggedCalls,
      totalCalls: metrics.totalCalls,
    }))
    .sort((left, right) => {
      if (left.flaggedCalls !== right.flaggedCalls) {
        return right.flaggedCalls - left.flaggedCalls;
      }
      return right.totalCalls - left.totalCalls;
    })[0] ?? null;

  return {
    totalCalls: rows.length,
    flaggedCalls: rows.filter((row) => asNumber(row.flag_count) > 0).length,
    needsReviewCount: rows.filter((row) => asString(row.current_review_status) !== "reviewed").length,
    complianceFlagCount: ((complianceResult.data ?? []) as Array<Record<string, unknown>>).filter((row) =>
      normalizeText(asNullableString(row.flag_category)).includes("compliance")
    ).length,
    qualifiedCount: rows.filter((row) => getDispositionCategory(asNullableString(row.current_disposition)) === "qualified").length,
    disqualifiedCount: rows.filter((row) => getDispositionCategory(asNullableString(row.current_disposition)) === "disqualified").length,
    topFlaggedPublisher,
  };
}

function getSavedViewConfig(value: unknown): CallSavedViewConfig {
  const config = asRecord(value);
  const filters = normalizeCallFilters(asRecord(config?.filters) ?? {});
  const density = config?.density === "compact" ? "compact" : "comfortable";
  const visibleColumns = asArray(config?.visibleColumns)
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);

  return {
    filters,
    density,
    visibleColumns,
  };
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
  const normalizedFilters = normalizeCallFilters(filters);
  const optionsPromise = getCallFilterOptions(client, organizationId);
  const [searchIds, flagIds] = await Promise.all([
    searchCallIds(client, organizationId, normalizedFilters.search ?? ""),
    getFlagFilteredCallIds(client, organizationId, normalizedFilters),
  ]);
  const matchingIds = intersectCallIds(searchIds, flagIds);
  const summaryPromise = getCallsSummary(client, organizationId, normalizedFilters, matchingIds);

  if (matchingIds && matchingIds.length === 0) {
    return {
      rows: [],
      filters: normalizedFilters,
      options: await optionsPromise,
      summary: await summaryPromise,
    };
  }

  let query = client
    .from("calls")
    .select("id, caller_number, started_at, duration_seconds, current_disposition, current_review_status, flag_count, source_provider, import_batch_id, updated_at, campaigns(name), publishers(name), import_batches(filename)")
    .eq("organization_id", organizationId)
    .limit(100);

  if (normalizedFilters.reviewStatus) {
    query = query.eq("current_review_status", normalizedFilters.reviewStatus);
  }

  if (normalizedFilters.publisherId) {
    query = query.eq("publisher_id", normalizedFilters.publisherId);
  }

  if (normalizedFilters.campaignId) {
    query = query.eq("campaign_id", normalizedFilters.campaignId);
  }

  if (normalizedFilters.disposition) {
    query = query.eq("current_disposition", normalizedFilters.disposition);
  }

  if (normalizedFilters.dateFrom) {
    query = query.gte("started_at", normalizedFilters.dateFrom);
  }

  if (normalizedFilters.dateTo) {
    query = query.lte("started_at", normalizedFilters.dateTo);
  }

  if (matchingIds && matchingIds.length > 0) {
    query = query.in("id", matchingIds);
  }

  if (normalizedFilters.sortBy === "durationSeconds") {
    query = query.order("duration_seconds", { ascending: normalizedFilters.sortDirection === "asc" });
  } else if (normalizedFilters.sortBy === "flagCount") {
    query = query.order("flag_count", { ascending: normalizedFilters.sortDirection === "asc" });
  } else if (normalizedFilters.sortBy === "updatedAt") {
    query = query.order("updated_at", { ascending: normalizedFilters.sortDirection === "asc" });
  } else {
    query = query.order("started_at", { ascending: normalizedFilters.sortDirection === "asc" });
  }

  const { data, error } = await query;
  assertNoError(error, "Unable to load calls.");

  const callIds = ((data ?? []) as Array<Record<string, unknown>>)
    .map((row) => asString(row.id))
    .filter((id) => id.length > 0);
  const [topFlagsByCall, reviewersByCall] = await Promise.all([
    getCallTopFlags(client, organizationId, callIds),
    getLatestReviewers(client, organizationId, callIds),
  ]);

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const campaign = row.campaigns as Record<string, unknown> | null;
    const publisher = row.publishers as Record<string, unknown> | null;
    const importBatch = row.import_batches as Record<string, unknown> | null;
    const callId = asString(row.id);

    return {
      id: callId,
      callerNumber: asString(row.caller_number),
      startedAt: asString(row.started_at),
      durationSeconds: asNumber(row.duration_seconds),
      campaignName: asNullableString(campaign?.name),
      publisherName: asNullableString(publisher?.name),
      currentDisposition: asNullableString(row.current_disposition),
      currentReviewStatus: (asString(row.current_review_status) || "unreviewed") as ReviewStatus,
      flagCount: asNumber(row.flag_count),
      topFlag: topFlagsByCall.get(callId) ?? null,
      sourceProvider: (asString(row.source_provider) || "custom") as IntegrationProvider,
      importBatchId: asNullableString(row.import_batch_id),
      importBatchFilename: asNullableString(importBatch?.filename),
      reviewedByName: reviewersByCall.get(callId) ?? null,
      lastUpdatedAt: asString(row.updated_at),
    } satisfies CallListItem;
  });

  return {
    rows,
    filters: normalizedFilters,
    options: await optionsPromise,
    summary: await summaryPromise,
  };
}

export async function getCallDetail(client: SupabaseAny, organizationId: string, callId: string): Promise<CallDetail | null> {
  const [callResult, transcriptResult, analysisResult, flagsResult, reviewsResult, overridesResult, auditResult] = await Promise.all([
    client
      .from("calls")
      .select("id, caller_number, destination_number, started_at, ended_at, duration_seconds, current_disposition, current_review_status, flag_count, source_provider, import_batch_id, source_status, campaigns(name), publishers(name), import_batches(filename)")
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
      .select("summary, disposition_suggested, confidence, model_name, analysis_version, structured_output, created_at")
      .eq("organization_id", organizationId)
      .eq("call_id", callId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("call_flags")
      .select("id, title, severity, status, description, flag_category, evidence, created_at")
      .eq("organization_id", organizationId)
      .eq("call_id", callId)
      .order("created_at", { ascending: false }),
    client
      .from("call_reviews")
      .select("id, review_status, final_disposition, review_notes, reviewed_by, created_at")
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
  const importBatch = call.import_batches as Record<string, unknown> | null;
  const transcript = (transcriptResult.data ?? null) as Record<string, unknown> | null;
  const analysis = (analysisResult.data ?? null) as Record<string, unknown> | null;
  const latestReview = ((reviewsResult.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
  const latestReviewedBy = latestReview ? asString(latestReview.reviewed_by) : "";
  const latestReviewerProfileResult = latestReviewedBy
    ? await client
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("id", latestReviewedBy)
        .maybeSingle()
    : null;

  assertNoError(latestReviewerProfileResult?.error ?? null, "Unable to load latest reviewer.");

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

  const topFlag = ((flagsResult.data ?? []) as Array<Record<string, unknown>>)
    .slice()
    .sort((left, right) => {
      const leftStatus = asString(left.status) === "open" ? 1 : 0;
      const rightStatus = asString(right.status) === "open" ? 1 : 0;
      if (leftStatus !== rightStatus) {
        return rightStatus - leftStatus;
      }
      const leftSeverity = getSeverityRank(asString(left.severity));
      const rightSeverity = getSeverityRank(asString(right.severity));
      if (leftSeverity !== rightSeverity) {
        return rightSeverity - leftSeverity;
      }
      return asString(right.created_at).localeCompare(asString(left.created_at));
    })[0];

  const severitySummary = topFlag
    ? `${asString(topFlag.severity)} severity`
    : asNumber(call.flag_count) > 0
      ? `${asNumber(call.flag_count)} open flags`
      : null;

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
    topFlag: topFlag ? asString(topFlag.title) : null,
    severitySummary,
    sourceProvider: (asString(call.source_provider) || "custom") as IntegrationProvider,
    importBatchId: asNullableString(call.import_batch_id),
    importBatchFilename: asNullableString(importBatch?.filename),
    sourceStatus: asString(call.source_status) || "received",
    transcriptText: asNullableString(transcript?.transcript_text),
    transcriptSegments: parseSegments(transcript?.transcript_segments),
    analysisSummary: asNullableString(analysis?.summary),
    suggestedDisposition: asNullableString(analysis?.disposition_suggested),
    analysisConfidence: analysis ? asNumber(analysis.confidence) : null,
    analysisModelName: asNullableString(analysis?.model_name),
    analysisVersion: asNullableString(analysis?.analysis_version),
    analysisStructuredOutput: analysis?.structured_output ? (analysis.structured_output as Json) : null,
    latestReviewNotes: latestReview ? asNullableString(latestReview.review_notes) : null,
    latestReviewedByName: getDisplayName((latestReviewerProfileResult?.data ?? null) as Record<string, unknown> | null),
    flags: ((flagsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: asString(row.id),
      title: asString(row.title),
      severity: (asString(row.severity) || "low") as CallFlagItem["severity"],
      status: (asString(row.status) || "open") as CallFlagItem["status"],
      category: asString(row.flag_category),
      description: asNullableString(row.description),
      evidenceSummary: buildEvidenceSummary(row.evidence),
    })),
    history,
  };
}

export async function getCallSavedViews(
  client: SupabaseAny,
  organizationId: string,
  userId: string
): Promise<SavedViewSummary[]> {
  const { data, error } = await client
    .from("saved_views")
    .select("id, name, is_default, config")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("entity_type", "calls")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  assertNoError(error, "Unable to load saved views.");

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: asString(row.id),
    name: asString(row.name),
    isDefault: asBoolean(row.is_default),
    config: getSavedViewConfig(row.config),
  }));
}

export async function createCallSavedView(
  client: SupabaseAny,
  input: {
    organizationId: string;
    userId: string;
    name: string;
    config: CallSavedViewConfig;
  }
): Promise<SavedViewSummary> {
  const { data, error } = await client
    .from("saved_views")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      entity_type: "calls",
      name: input.name.trim(),
      config: {
        filters: normalizeCallFilters(input.config.filters) as Json,
        density: input.config.density ?? "comfortable",
        visibleColumns: input.config.visibleColumns ?? [],
      } as Json,
    })
    .select("id, name, is_default, config")
    .single();

  assertNoError(error, "Unable to save call view.");

  return {
    id: asString((data as Record<string, unknown>).id),
    name: asString((data as Record<string, unknown>).name),
    isDefault: asBoolean((data as Record<string, unknown>).is_default),
    config: getSavedViewConfig((data as Record<string, unknown>).config),
  };
}

export async function deleteCallSavedView(
  client: SupabaseAny,
  organizationId: string,
  savedViewId: string
) {
  const { error } = await client
    .from("saved_views")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", savedViewId)
    .eq("entity_type", "calls");

  assertNoError(error, "Unable to delete saved view.");
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

function humanizeBillingToken(value: string | null | undefined) {
  const source = asString(value).trim();
  if (!source) {
    return "";
  }

  const parts = source
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

function getBillingLedgerEntryType(
  entryType: string,
  amountCents: number,
  referenceType: string | null
): BillingLedgerEntryType {
  const normalizedType = normalizeText(entryType);
  const normalizedReferenceType = normalizeText(referenceType);

  if (normalizedType.includes("fail")) {
    return "failed_recharge";
  }

  if (
    (normalizedType.includes("auto") && normalizedType.includes("recharge")) ||
    (normalizedReferenceType.includes("stripe") && amountCents > 0)
  ) {
    return "auto_recharge";
  }

  if (
    normalizedType.includes("fund") ||
    normalizedType.includes("top") ||
    normalizedType.includes("credit")
  ) {
    return "funding";
  }

  if (normalizedType.includes("refund")) {
    return "refund";
  }

  if (normalizedType.includes("adjust")) {
    return "adjustment";
  }

  if (normalizedType.includes("usage") || amountCents < 0) {
    return "usage";
  }

  if (amountCents > 0) {
    return "funding";
  }

  return entryType || "adjustment";
}

function getBillingLedgerStatus(
  entryType: string,
  amountCents: number,
  normalizedType: BillingLedgerEntryType
): BillingLedgerEntryStatus {
  const lower = normalizeText(entryType);

  if (lower.includes("fail")) {
    return "failed";
  }

  if (lower.includes("pending")) {
    return "pending";
  }

  if (normalizedType === "usage") {
    return "applied";
  }

  if (amountCents === 0 && normalizedType === "failed_recharge") {
    return "failed";
  }

  return "completed";
}

function getBillingLedgerDescription(
  description: string | null,
  entryType: BillingLedgerEntryType,
  status: BillingLedgerEntryStatus
) {
  if (description) {
    return description;
  }

  if (entryType === "funding") {
    return "Manual wallet funding";
  }

  if (entryType === "usage") {
    return "Processed call minutes";
  }

  if (entryType === "auto_recharge") {
    return "Automatic wallet top-up";
  }

  if (entryType === "failed_recharge" || status === "failed") {
    return "Automatic wallet top-up";
  }

  if (entryType === "refund") {
    return "Wallet refund";
  }

  if (entryType === "adjustment") {
    return "Wallet balance adjustment";
  }

  return humanizeBillingToken(entryType) || "Wallet activity";
}

function getBillingLedgerReference(referenceType: string | null, referenceId: string | null, entryType: BillingLedgerEntryType) {
  const humanizedReferenceType = humanizeBillingToken(referenceType);
  if (humanizedReferenceType) {
    return humanizedReferenceType;
  }

  if (entryType === "usage") {
    return "Call processing";
  }

  if (entryType === "auto_recharge") {
    return "Stripe recharge";
  }

  if (entryType === "failed_recharge") {
    return "Payment failed";
  }

  if (entryType === "funding") {
    return "Top-up";
  }

  return referenceId ? referenceId.slice(0, 8) : null;
}

function summarizeLedgerEvent(entry: BillingLedgerEntrySummary): BillingEventSummary | null {
  if (entry.entryType === "usage") {
    return null;
  }

  if (entry.entryType === "auto_recharge" && entry.status === "completed") {
    return {
      id: `ledger-${entry.id}`,
      type: "recharge",
      message: `Auto-recharge of ${formatCurrency(entry.amountCents)} succeeded`,
      createdAt: entry.createdAt,
      tone: "success",
    };
  }

  if (entry.entryType === "failed_recharge" || entry.status === "failed") {
    return {
      id: `ledger-${entry.id}`,
      type: "alert",
      message: "Recent auto-recharge attempt failed",
      createdAt: entry.createdAt,
      tone: "critical",
    };
  }

  if (entry.entryType === "funding") {
    return {
      id: `ledger-${entry.id}`,
      type: "funding",
      message: `Manual top-up of ${formatCurrency(entry.amountCents)} completed`,
      createdAt: entry.createdAt,
      tone: "success",
    };
  }

  if (entry.entryType === "refund") {
    return {
      id: `ledger-${entry.id}`,
      type: "info",
      message: `Refund of ${formatCurrency(entry.amountCents)} posted`,
      createdAt: entry.createdAt,
      tone: "info",
    };
  }

  if (entry.entryType === "adjustment") {
    return {
      id: `ledger-${entry.id}`,
      type: "info",
      message: "Wallet balance adjusted",
      createdAt: entry.createdAt,
      tone: "info",
    };
  }

  return null;
}

function summarizeBillingAuditEvent(row: Record<string, unknown>): BillingEventSummary | null {
  const action = asString(row.action);
  const metadata = asRecord(row.metadata);
  const summary = asNullableString(metadata?.summary);
  const createdAt = asString(row.created_at);
  const eventId = asString(row.id);

  if (!action || !createdAt || !eventId) {
    return null;
  }

  if (action === "billing.portal.opened") {
    return null;
  }

  if (action.includes("payment_method")) {
    return {
      id: `audit-${eventId}`,
      type: "payment_method",
      message: summary ?? "Default payment method updated",
      createdAt,
      tone: action.includes("failed") ? "critical" : "success",
    };
  }

  if (action.includes("recharge_settings") || action.includes("billing.settings")) {
    return {
      id: `audit-${eventId}`,
      type: "settings",
      message: summary ?? "Auto-recharge settings updated",
      createdAt,
      tone: "info",
    };
  }

  if (action.startsWith("billing.")) {
    return {
      id: `audit-${eventId}`,
      type: "info",
      message: summary ?? humanizeBillingToken(action),
      createdAt,
      tone: action.includes("failed") ? "critical" : "info",
    };
  }

  return null;
}

export function deriveBillingRunwaySummary(input: {
  currentBalanceCents: number;
  rechargeThresholdCents: number;
  autopayEnabled: boolean;
  ledger: Array<Pick<BillingLedgerEntrySummary, "amountCents" | "createdAt" | "entryType" | "status">>;
}): BillingRunwaySummary {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const windowStart = now - 30 * dayMs;
  const spendEntries = input.ledger.filter((entry) => {
    if (entry.amountCents >= 0) {
      return false;
    }

    const createdAtMs = new Date(entry.createdAt).getTime();
    return Number.isFinite(createdAtMs) && createdAtMs >= windowStart;
  });

  if (spendEntries.length === 0) {
    return {
      projectedDaysRemaining: null,
      averageDailySpendCents: null,
      estimatedNextRechargeAt: null,
    };
  }

  let oldestCreatedAt = now;
  let newestCreatedAt = now;
  let totalSpendCents = 0;

  for (const entry of spendEntries) {
    const createdAtMs = new Date(entry.createdAt).getTime();
    oldestCreatedAt = Math.min(oldestCreatedAt, createdAtMs);
    newestCreatedAt = Math.max(newestCreatedAt, createdAtMs);
    totalSpendCents += Math.abs(entry.amountCents);
  }

  const observedDays = Math.max((newestCreatedAt - oldestCreatedAt) / dayMs, 1);
  const averageDailySpendCents = Math.round(totalSpendCents / observedDays);
  if (averageDailySpendCents <= 0) {
    return {
      projectedDaysRemaining: null,
      averageDailySpendCents: null,
      estimatedNextRechargeAt: null,
    };
  }

  const projectedDaysRemaining = Number((Math.max(input.currentBalanceCents, 0) / averageDailySpendCents).toFixed(1));
  let estimatedNextRechargeAt: string | null = null;

  if (input.autopayEnabled) {
    if (input.currentBalanceCents <= input.rechargeThresholdCents) {
      estimatedNextRechargeAt = new Date(now).toISOString();
    } else {
      const centsUntilThreshold = input.currentBalanceCents - input.rechargeThresholdCents;
      const daysUntilRecharge = centsUntilThreshold / averageDailySpendCents;
      estimatedNextRechargeAt = new Date(now + daysUntilRecharge * dayMs).toISOString();
    }
  }

  return {
    projectedDaysRemaining,
    averageDailySpendCents,
    estimatedNextRechargeAt,
  };
}

export function deriveBillingHealthSummary(input: {
  accountId: string | null;
  autopayEnabled: boolean;
  currentBalanceCents: number;
  rechargeThresholdCents: number;
  paymentMethodStatus: BillingPaymentMethodStatus;
  projectedDaysRemaining: number | null;
  latestLedgerEntry: Pick<BillingLedgerEntrySummary, "entryType" | "status"> | null;
}): BillingHealthSummary {
  if (!input.accountId) {
    return {
      status: "critical",
      title: "Set up billing to start processing calls",
      description: "Add a payment method and configure wallet funding to enable call processing.",
      actionLabel: "Set up billing",
      actionKind: "open_portal",
    };
  }

  if (
    input.latestLedgerEntry &&
    (input.latestLedgerEntry.entryType === "failed_recharge" || input.latestLedgerEntry.status === "failed")
  ) {
    return {
      status: "critical",
      title: "Recent recharge failed",
      description:
        "Your last automatic recharge attempt was unsuccessful. Update your payment method to avoid interruption.",
      actionLabel: "Update payment method",
      actionKind: "update_card",
    };
  }

  if (input.paymentMethodStatus === "missing" || input.paymentMethodStatus === "expired") {
    return {
      status: "critical",
      title: "No valid payment method on file",
      description: "Auto-recharge cannot run until a default payment method is added.",
      actionLabel: "Update payment method",
      actionKind: "update_card",
    };
  }

  if (!input.autopayEnabled) {
    return {
      status: "warning",
      title: "Auto-recharge is turned off",
      description: "Your balance will not replenish automatically when it drops below the threshold.",
      actionLabel: "Turn on auto-recharge",
      actionKind: "edit_recharge",
    };
  }

  if (input.currentBalanceCents <= 0 || input.currentBalanceCents <= input.rechargeThresholdCents) {
    return {
      status: "warning",
      title: "Balance is below your preferred operating buffer",
      description: "Your current balance is already below the configured recharge threshold.",
      actionLabel: "Add funds",
      actionKind: "add_funds",
    };
  }

  if (input.projectedDaysRemaining !== null && input.projectedDaysRemaining <= 3) {
    return {
      status: "warning",
      title: "Recharge likely soon",
      description: "Your current usage suggests a recharge may be triggered soon.",
      actionLabel: "Review recharge settings",
      actionKind: "edit_recharge",
    };
  }

  return {
    status: "healthy",
    title: "Billing healthy",
    description: "Auto-recharge is enabled and your default payment method is ready.",
    actionLabel: "Open Stripe billing portal",
    actionKind: "open_portal",
  };
}

export async function getBillingSummary(client: SupabaseAny, organizationId: string): Promise<BillingSummary> {
  const [accountResult, ledgerResult, auditResult] = await Promise.all([
    client
      .from("billing_accounts")
      .select("id, billing_email, autopay_enabled, recharge_threshold_cents, recharge_amount_cents, per_minute_rate_cents, stripe_customer_id")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    client
      .from("wallet_ledger_entries")
      .select("id, entry_type, amount_cents, balance_after_cents, description, reference_id, reference_type, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("audit_logs")
      .select("id, action, metadata, created_at")
      .eq("organization_id", organizationId)
      .eq("entity_type", "billing_account")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  assertNoError(accountResult.error, "Unable to load billing account.");
  assertNoError(ledgerResult.error, "Unable to load ledger.");
  assertNoError(auditResult.error, "Unable to load billing activity.");

  const account = (accountResult.data ?? null) as Record<string, unknown> | null;
  const ledger = ((ledgerResult.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const rawEntryType = asString(row.entry_type);
    const amountCents = asNumber(row.amount_cents);
    const referenceType = asNullableString(row.reference_type);
    const referenceId = asNullableString(row.reference_id);
    const entryType = getBillingLedgerEntryType(rawEntryType, amountCents, referenceType);
    const status = getBillingLedgerStatus(rawEntryType, amountCents, entryType);

    return {
      id: asString(row.id),
      entryType,
      status,
      amountCents,
      balanceAfterCents: asNumber(row.balance_after_cents),
      description: getBillingLedgerDescription(asNullableString(row.description), entryType, status),
      reference: getBillingLedgerReference(referenceType, referenceId, entryType),
      createdAt: asString(row.created_at),
    } satisfies BillingLedgerEntrySummary;
  });
  const currentBalanceCents = ledger[0]?.balanceAfterCents ?? 0;
  const lastSuccessfulChargeAt =
    ledger.find((entry) => entry.amountCents > 0 && entry.status === "completed")?.createdAt ?? null;
  const paymentMethod: BillingPaymentMethodSummary | null = account
    ? {
        brand: null,
        last4: null,
        expMonth: null,
        expYear: null,
        status: (asString(account.stripe_customer_id) ? "ready" : "missing") as BillingPaymentMethodStatus,
        lastChargeAt: lastSuccessfulChargeAt,
      }
    : null;
  const paymentMethodStatus: BillingPaymentMethodStatus = paymentMethod?.status ?? "missing";
  const runway = deriveBillingRunwaySummary({
    currentBalanceCents,
    rechargeThresholdCents: account ? asNumber(account.recharge_threshold_cents) : 0,
    autopayEnabled: account ? asBoolean(account.autopay_enabled) : false,
    ledger,
  });
  const health = deriveBillingHealthSummary({
    accountId: account ? asString(account.id) : null,
    autopayEnabled: account ? asBoolean(account.autopay_enabled) : false,
    currentBalanceCents,
    rechargeThresholdCents: account ? asNumber(account.recharge_threshold_cents) : 0,
    paymentMethodStatus,
    projectedDaysRemaining: runway.projectedDaysRemaining,
    latestLedgerEntry: ledger[0] ?? null,
  });
  const ledgerEvents = ledger
    .map((entry) => summarizeLedgerEvent(entry))
    .filter((entry): entry is BillingEventSummary => Boolean(entry));
  const auditEvents = ((auditResult.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => summarizeBillingAuditEvent(row))
    .filter((entry): entry is BillingEventSummary => Boolean(entry));
  const events = [...ledgerEvents, ...auditEvents]
    .sort((left, right) => {
      if (left.createdAt < right.createdAt) return 1;
      if (left.createdAt > right.createdAt) return -1;
      return 0;
    })
    .slice(0, 8);

  return {
    accountId: account ? asString(account.id) : null,
    billingEmail: account ? asNullableString(account.billing_email) : null,
    autopayEnabled: account ? asBoolean(account.autopay_enabled) : false,
    rechargeThresholdCents: account ? asNumber(account.recharge_threshold_cents) : 0,
    rechargeAmountCents: account ? asNumber(account.recharge_amount_cents) : 0,
    perMinuteRateCents: account ? asNumber(account.per_minute_rate_cents) : 0,
    currentBalanceCents,
    paymentMethod,
    runway,
    health,
    ledger,
    events,
  };
}

export async function getIntegrationsSummary(
  client: SupabaseAny,
  organizationId: string,
  defaults?: IntegrationWebhookDefaults
): Promise<IntegrationsSummary> {
  const [integrationsResult, eventsResult] = await Promise.all([
    client
      .from("integrations")
      .select("id, display_name, provider, status, mode, last_success_at, last_error_at, config")
      .eq("organization_id", organizationId)
      .order("display_name"),
    client
      .from("integration_events")
      .select("id, integration_id, event_type, severity, message, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  assertNoError(integrationsResult.error, "Unable to load integrations.");
  assertNoError(eventsResult.error, "Unable to load integration events.");

  const latestByIntegration = new Map<string, { message: string; severity: string | null }>();
  const recentEventsByIntegration = new Map<string, PublicIntegrationEvent[]>();
  for (const row of (eventsResult.data ?? []) as Array<Record<string, unknown>>) {
    const integrationId = asString(row.integration_id);
    if (!integrationId) {
      continue;
    }

    if (!latestByIntegration.has(integrationId)) {
      latestByIntegration.set(integrationId, {
        message: asString(row.message),
        severity: asNullableString(row.severity),
      });
    }

    const currentEvents = recentEventsByIntegration.get(integrationId) ?? [];
    if (currentEvents.length < 3) {
      currentEvents.push({
        id: asString(row.id),
        eventType: asString(row.event_type),
        severity: asString(row.severity) || "info",
        message: asString(row.message),
        createdAt: asString(row.created_at),
      });
      recentEventsByIntegration.set(integrationId, currentEvents);
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
      lastEventMessage: latestByIntegration.get(asString(row.id))?.message ?? null,
      lastEventSeverity: latestByIntegration.get(asString(row.id))?.severity ?? null,
      webhookAuth: getPublicIntegrationWebhookAuth(row.config, defaults),
      recentEvents: recentEventsByIntegration.get(asString(row.id)) ?? [],
    })),
  };
}

export async function getReportsSummary(client: SupabaseAny, organizationId: string): Promise<ReportsSummary> {
  const monthStart = formatMonthStart();
  const previousMonthStart = formatMonthStartWithOffset(-1);
  const dayOfMonth = Math.max(new Date().getUTCDate(), 1);

  const [
    currentCallsResult,
    previousCallsResult,
    currentFlagsResult,
    currentImportsResult,
    previousImportsResult,
    currentReviewsResult,
    previousReviewsResult,
  ] = await Promise.all([
    client
      .from("calls")
      .select("id, publisher_id, current_disposition, flag_count")
      .eq("organization_id", organizationId)
      .gte("started_at", monthStart),
    client
      .from("calls")
      .select("id, publisher_id, current_disposition, flag_count")
      .eq("organization_id", organizationId)
      .gte("started_at", previousMonthStart)
      .lt("started_at", monthStart),
    client
      .from("call_flags")
      .select("id, call_id, flag_category, status")
      .eq("organization_id", organizationId)
      .gte("created_at", monthStart),
    client
      .from("import_batches")
      .select("id, filename, status, row_count_total, row_count_rejected, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false })
      .limit(10),
    client
      .from("import_batches")
      .select("row_count_total, row_count_rejected")
      .eq("organization_id", organizationId)
      .gte("created_at", previousMonthStart)
      .lt("created_at", monthStart),
    client
      .from("call_reviews")
      .select("id")
      .eq("organization_id", organizationId)
      .gte("created_at", monthStart),
    client
      .from("call_reviews")
      .select("id")
      .eq("organization_id", organizationId)
      .gte("created_at", previousMonthStart)
      .lt("created_at", monthStart),
  ]);

  assertNoError(currentCallsResult.error, "Unable to load report calls.");
  assertNoError(previousCallsResult.error, "Unable to load previous call data.");
  assertNoError(currentFlagsResult.error, "Unable to load report flags.");
  assertNoError(currentImportsResult.error, "Unable to load report imports.");
  assertNoError(previousImportsResult.error, "Unable to load prior import data.");
  assertNoError(currentReviewsResult.error, "Unable to load report reviews.");
  assertNoError(previousReviewsResult.error, "Unable to load prior review data.");

  const currentCalls = (currentCallsResult.data ?? []) as Array<Record<string, unknown>>;
  const previousCalls = (previousCallsResult.data ?? []) as Array<Record<string, unknown>>;
  const currentFlags = (currentFlagsResult.data ?? []) as Array<Record<string, unknown>>;
  const currentImports = (currentImportsResult.data ?? []) as Array<Record<string, unknown>>;
  const previousImports = (previousImportsResult.data ?? []) as Array<Record<string, unknown>>;
  const currentReviews = (currentReviewsResult.data ?? []) as Array<Record<string, unknown>>;
  const previousReviews = (previousReviewsResult.data ?? []) as Array<Record<string, unknown>>;

  const uniquePublisherIds = Array.from(
    new Set(
      currentCalls
        .map((row) => asString(row.publisher_id))
        .filter((publisherId) => publisherId.length > 0)
    )
  );

  const publishersResult = uniquePublisherIds.length
    ? await client
        .from("publishers")
        .select("id, name")
        .eq("organization_id", organizationId)
        .in("id", uniquePublisherIds)
    : { data: [], error: null };

  assertNoError(publishersResult.error, "Unable to load report publishers.");

  const publisherNames = new Map<string, string>();
  for (const row of (publishersResult.data ?? []) as Array<Record<string, unknown>>) {
    publisherNames.set(asString(row.id), asString(row.name));
  }

  const currentCallCount = currentCalls.length;
  const previousCallCount = previousCalls.length;
  const currentQualifiedCount = currentCalls.filter((row) => getDispositionCategory(asNullableString(row.current_disposition)) === "qualified").length;
  const previousQualifiedCount = previousCalls.filter((row) => getDispositionCategory(asNullableString(row.current_disposition)) === "qualified").length;
  const currentFlaggedCallCount = currentCalls.filter((row) => asNumber(row.flag_count) > 0).length;
  const previousFlaggedCallCount = previousCalls.filter((row) => asNumber(row.flag_count) > 0).length;
  const currentComplianceOpenFlags = currentFlags.filter((row) => normalizeText(asNullableString(row.flag_category)).includes("compliance") && asString(row.status) === "open").length;
  const previousImportRejected = previousImports.reduce((total, row) => total + asNumber(row.row_count_rejected), 0);
  const previousImportTotal = previousImports.reduce((total, row) => total + asNumber(row.row_count_total), 0);
  const currentImportRejected = currentImports.reduce((total, row) => total + asNumber(row.row_count_rejected), 0);
  const currentImportTotal = currentImports.reduce((total, row) => total + asNumber(row.row_count_total), 0);
  const currentQualifiedRate = currentCallCount === 0 ? 0 : (currentQualifiedCount / currentCallCount) * 100;
  const previousQualifiedRate = previousCallCount === 0 ? 0 : (previousQualifiedCount / previousCallCount) * 100;
  const currentFlagRate = currentCallCount === 0 ? 0 : (currentFlaggedCallCount / currentCallCount) * 100;
  const previousFlagRate = previousCallCount === 0 ? 0 : (previousFlaggedCallCount / previousCallCount) * 100;
  const complianceRate = currentCallCount === 0 ? 100 : Math.max(0, 100 - (currentComplianceOpenFlags / currentCallCount) * 100);
  const importRejectionRate = currentImportTotal === 0 ? 0 : (currentImportRejected / currentImportTotal) * 100;
  const previousImportRejectionRate = previousImportTotal === 0 ? 0 : (previousImportRejected / previousImportTotal) * 100;

  const publisherMetrics = new Map<string, { totalCalls: number; flaggedCalls: number }>();
  for (const row of currentCalls) {
    const publisherId = asNullableString(row.publisher_id) ?? "unassigned";
    const current = publisherMetrics.get(publisherId) ?? { totalCalls: 0, flaggedCalls: 0 };
    current.totalCalls += 1;
    if (asNumber(row.flag_count) > 0) {
      current.flaggedCalls += 1;
    }
    publisherMetrics.set(publisherId, current);
  }

  const cards: ReportsSummaryCard[] = [
    {
      id: "call-volume",
      title: "Call Volume",
      value: currentCallCount.toLocaleString(),
      trend: formatTrend(currentCallCount, previousCallCount, "month"),
      description: "Current month calls processed across all connected sources.",
    },
    {
      id: "qualified-rate",
      title: "Qualified Rate",
      value: formatPercent(currentQualifiedRate),
      trend: formatTrend(currentQualifiedRate, previousQualifiedRate, "month"),
      description: "Share of calls with a disposition that looks qualified or sale-adjacent.",
    },
    {
      id: "flag-rate",
      title: "Flag Rate",
      value: formatPercent(currentFlagRate),
      trend: formatTrend(currentFlagRate, previousFlagRate, "month"),
      description: "Share of current-month calls with at least one open flag.",
    },
    {
      id: "compliance-rate",
      title: "Compliance Rate",
      value: formatPercent(complianceRate),
      trend: `${currentComplianceOpenFlags.toLocaleString()} open compliance flags this month`,
      description: "Derived from open compliance-category flags over current-month calls.",
    },
    {
      id: "import-rejection-rate",
      title: "Import Rejection Rate",
      value: formatPercent(importRejectionRate),
      trend: formatTrend(importRejectionRate, previousImportRejectionRate, "month"),
      description: "Rejected rows over uploaded rows for batches created this month.",
    },
    {
      id: "review-throughput",
      title: "Review Throughput",
      value: currentReviews.length.toLocaleString(),
      trend: formatTrend(currentReviews.length, previousReviews.length, "month"),
      description: "Completed review records created this month.",
    },
  ];

  const publisherBreakdown = Array.from(publisherMetrics.entries())
    .map(([publisherId, metrics]) => ({
      publisherId: publisherId === "unassigned" ? null : publisherId,
      publisherName:
        publisherId === "unassigned"
          ? "Unassigned"
          : publisherNames.get(publisherId) ?? "Unknown Publisher",
      totalCalls: metrics.totalCalls,
      flaggedCalls: metrics.flaggedCalls,
      flagRate: metrics.totalCalls === 0 ? 0 : Number(((metrics.flaggedCalls / metrics.totalCalls) * 100).toFixed(1)),
    }))
    .sort((left, right) => {
      if (left.flaggedCalls !== right.flaggedCalls) {
        return right.flaggedCalls - left.flaggedCalls;
      }
      return right.totalCalls - left.totalCalls;
    })
    .slice(0, 5);

  return {
    cards,
    publisherBreakdown,
    recentImports: currentImports.map((row) => ({
      id: asString(row.id),
      filename: asString(row.filename),
      status: asString(row.status),
      rowCountTotal: asNumber(row.row_count_total),
      rowCountRejected: asNumber(row.row_count_rejected),
      createdAt: asString(row.created_at),
    })),
    reviewVelocity: {
      reviewsThisMonth: currentReviews.length,
      reviewsPreviousMonth: previousReviews.length,
      averagePerDay: Number((currentReviews.length / dayOfMonth).toFixed(1)),
    },
  };
}

export async function getProfileSettings(client: SupabaseAny, userId: string): Promise<ProfileSettingsData> {
  const { data, error } = await client
    .from("profiles")
    .select("email, first_name, last_name, avatar_url")
    .eq("id", userId)
    .single();

  assertNoError(error, "Unable to load profile settings.");

  const profile = data as Record<string, unknown>;
  return {
    email: asString(profile.email),
    firstName: asString(profile.first_name),
    lastName: asString(profile.last_name),
    avatarUrl: asNullableString(profile.avatar_url),
  };
}

export async function updateProfileSettings(
  client: SupabaseAny,
  userId: string,
  input: ProfileSettingsInput
): Promise<ProfileSettingsData> {
  const updates = {
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    avatar_url: asNullableString(input.avatarUrl),
  };

  const { data, error } = await client
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select("email, first_name, last_name, avatar_url")
    .single();

  assertNoError(error, "Unable to update profile settings.");

  const profile = data as Record<string, unknown>;
  return {
    email: asString(profile.email),
    firstName: asString(profile.first_name),
    lastName: asString(profile.last_name),
    avatarUrl: asNullableString(profile.avatar_url),
  };
}

export async function getOrganizationSettings(
  client: SupabaseAny,
  organizationId: string
): Promise<OrganizationSettingsData> {
  const [organizationResult, billingResult] = await Promise.all([
    client
      .from("organizations")
      .select("name, slug, timezone, status")
      .eq("id", organizationId)
      .single(),
    client
      .from("billing_accounts")
      .select("billing_email")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  assertNoError(organizationResult.error, "Unable to load organization settings.");
  assertNoError(billingResult.error, "Unable to load billing contact.");

  const organization = organizationResult.data as Record<string, unknown>;
  const billing = (billingResult.data ?? null) as Record<string, unknown> | null;

  return {
    name: asString(organization.name),
    slug: asString(organization.slug),
    timezone: asString(organization.timezone) || "America/New_York",
    status: asString(organization.status) || "active",
    billingEmail: asString(billing?.billing_email),
  };
}

export async function updateOrganizationSettings(
  client: SupabaseAny,
  organizationId: string,
  input: OrganizationSettingsInput
): Promise<OrganizationSettingsData> {
  const organizationUpdate = await client
    .from("organizations")
    .update({
      name: input.name.trim(),
      slug: input.slug.trim(),
      timezone: input.timezone.trim() || "America/New_York",
    })
    .eq("id", organizationId);

  assertNoError(organizationUpdate.error, "Unable to update organization.");

  const billingEmail = input.billingEmail.trim();
  const billingResult = await client
    .from("billing_accounts")
    .upsert(
      {
        organization_id: organizationId,
        billing_email: billingEmail || null,
      },
      { onConflict: "organization_id" }
    );

  assertNoError(billingResult.error, "Unable to update billing contact.");

  return getOrganizationSettings(client, organizationId);
}

export async function getTeamSettings(client: SupabaseAny, organizationId: string): Promise<TeamSettingsData> {
  const membersResult = await client
    .from("organization_members")
    .select("id, user_id, invite_email, role, invite_status, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  assertNoError(membersResult.error, "Unable to load organization members.");

  const members = (membersResult.data ?? []) as Array<Record<string, unknown>>;
  const userIds = Array.from(
    new Set(members.map((row) => asString(row.user_id)).filter((userId) => userId.length > 0))
  );

  const profilesResult = userIds.length
    ? await client.from("profiles").select("id, email, first_name, last_name").in("id", userIds)
    : { data: [], error: null };

  assertNoError(profilesResult.error, "Unable to load member profiles.");

  const profilesById = new Map<string, Record<string, unknown>>();
  for (const row of (profilesResult.data ?? []) as Array<Record<string, unknown>>) {
    profilesById.set(asString(row.id), row);
  }

  return {
    members: members.map((row) => {
      const userId = asNullableString(row.user_id);
      const profile = userId ? profilesById.get(userId) ?? null : null;
      const firstName = asString(profile?.first_name);
      const lastName = asString(profile?.last_name);
      const profileName = `${firstName} ${lastName}`.trim();
      const inviteEmail = asNullableString(row.invite_email);
      const email = asString(profile?.email) || inviteEmail || "Pending invite";
      const name = profileName || inviteEmail || "Pending Invite";

      return {
        id: asString(row.id),
        userId,
        inviteEmail,
        name,
        email,
        initials: getInitials(name, email),
        role: (asString(row.role) || "reviewer") as OrganizationRole,
        inviteStatus: asString(row.invite_status) || "pending",
        createdAt: asString(row.created_at),
      };
    }),
  };
}

export async function inviteTeamMember(
  client: SupabaseAny,
  input: { organizationId: string; inviteEmail: string; role: OrganizationRole; invitedBy: string }
) {
  const { error } = await client.from("organization_members").insert({
    organization_id: input.organizationId,
    invite_email: input.inviteEmail.trim().toLowerCase(),
    role: input.role,
    invite_status: "pending",
    invited_by: input.invitedBy,
  });

  assertNoError(error, "Unable to create team invite.");
}

export async function updateTeamMemberRole(
  client: SupabaseAny,
  input: { organizationId: string; memberId: string; role: OrganizationRole }
) {
  const { error } = await client
    .from("organization_members")
    .update({ role: input.role })
    .eq("organization_id", input.organizationId)
    .eq("id", input.memberId);

  assertNoError(error, "Unable to update team member role.");
}

export async function getApiKeysData(client: SupabaseAny, organizationId: string): Promise<ApiKeysData> {
  const { data, error } = await client
    .from("api_keys")
    .select("id, label, token_prefix, scopes, last_used_at, revoked_at, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  assertNoError(error, "Unable to load API keys.");

  return {
    keys: ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: asString(row.id),
      label: asString(row.label),
      tokenPrefix: asString(row.token_prefix),
      scopes: Array.isArray(row.scopes)
        ? row.scopes.map((scope) => (typeof scope === "string" ? scope : "")).filter((scope) => scope.length > 0)
        : [],
      lastUsedAt: asNullableString(row.last_used_at),
      revokedAt: asNullableString(row.revoked_at),
      createdAt: asString(row.created_at),
    })),
  };
}

export async function getAlertRulesData(client: SupabaseAny, organizationId: string): Promise<AlertRulesData> {
  const { data, error } = await client
    .from("alert_rules")
    .select("id, name, is_enabled, trigger_config, delivery_config, cooldown_minutes, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  assertNoError(error, "Unable to load alert rules.");

  return {
    rules: ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: asString(row.id),
      name: asString(row.name),
      isEnabled: asBoolean(row.is_enabled),
      triggerSummary: getAlertTriggerSummary(row.trigger_config),
      destinationSummary: getAlertDestinationSummary(row.delivery_config),
      cooldownMinutes: asNumber(row.cooldown_minutes),
      createdAt: asString(row.created_at),
    })),
  };
}

export async function createAlertRule(
  client: SupabaseAny,
  input: AlertRuleInput & { organizationId: string; createdBy: string }
) {
  const { error } = await client.from("alert_rules").insert({
    organization_id: input.organizationId,
    name: input.name.trim(),
    is_enabled: input.isEnabled,
    cooldown_minutes: Math.max(0, input.cooldownMinutes),
    trigger_config: {
      summary: input.triggerSummary.trim(),
    },
    delivery_config: {
      summary: input.destinationSummary.trim(),
    },
    created_by: input.createdBy,
  });

  assertNoError(error, "Unable to create alert rule.");
}

export async function updateAlertRule(
  client: SupabaseAny,
  input: AlertRuleInput & { organizationId: string; ruleId: string }
) {
  const { error } = await client
    .from("alert_rules")
    .update({
      name: input.name.trim(),
      is_enabled: input.isEnabled,
      cooldown_minutes: Math.max(0, input.cooldownMinutes),
      trigger_config: {
        summary: input.triggerSummary.trim(),
      },
      delivery_config: {
        summary: input.destinationSummary.trim(),
      },
    })
    .eq("organization_id", input.organizationId)
    .eq("id", input.ruleId);

  assertNoError(error, "Unable to update alert rule.");
}

export async function setAlertRuleEnabled(
  client: SupabaseAny,
  input: { organizationId: string; ruleId: string; isEnabled: boolean }
) {
  const { error } = await client
    .from("alert_rules")
    .update({ is_enabled: input.isEnabled })
    .eq("organization_id", input.organizationId)
    .eq("id", input.ruleId);

  assertNoError(error, "Unable to update alert status.");
}

export async function getAiAssistantAnswer(
  client: SupabaseAny,
  organizationId: string,
  question: string
): Promise<AiAssistantResponse> {
  const normalizedQuestion = normalizeText(question);
  const [overview, reports, imports, integrations] = await Promise.all([
    getOverviewData(client, organizationId),
    getReportsSummary(client, organizationId),
    getImportsPageData(client, organizationId),
    getIntegrationsSummary(client, organizationId),
  ]);

  if (
    normalizedQuestion.includes("flag") ||
    normalizedQuestion.includes("compliance")
  ) {
    const topPublisher = reports.publisherBreakdown[0];
    return {
      answer: topPublisher
        ? `This month ${overview.openFlagCount} open flags need attention. The highest-risk publisher right now is ${topPublisher.publisherName} with ${topPublisher.flaggedCalls} flagged calls out of ${topPublisher.totalCalls} total calls (${formatPercent(topPublisher.flagRate)}).`
        : `This month ${overview.openFlagCount} open flags need attention, and there is not enough publisher volume yet to identify a clear outlier.`,
      references: ["Current month call flags", "Publisher flag breakdown", "Overview attention feed"],
      followUps: [
        "Show me recent flagged calls.",
        "Which flags are still open by severity?",
      ],
    };
  }

  if (
    normalizedQuestion.includes("publisher") ||
    normalizedQuestion.includes("disqual") ||
    normalizedQuestion.includes("qualified")
  ) {
    const topPublisher = reports.publisherBreakdown[0];
    const qualifiedRateCard = reports.cards.find((card) => card.id === "qualified-rate");
    return {
      answer: topPublisher
        ? `The most active publisher this month is ${topPublisher.publisherName}. Across the organization, the current qualified-rate snapshot is ${qualifiedRateCard?.value ?? "0%"} and ${topPublisher.publisherName} is carrying a ${formatPercent(topPublisher.flagRate)} flag rate.`
        : `There is not enough publisher-tagged call volume yet to rank publishers. The organization-level qualified-rate snapshot is ${qualifiedRateCard?.value ?? "0%"}.`,
      references: ["Reports qualified rate", "Publisher breakdown"],
      followUps: [
        "Show me the publishers with the most open flags.",
        "How many calls were reviewed this month?",
      ],
    };
  }

  if (
    normalizedQuestion.includes("import") ||
    normalizedQuestion.includes("batch") ||
    normalizedQuestion.includes("csv")
  ) {
    const latestBatch = imports.batches[0];
    return {
      answer: latestBatch
        ? `The latest import batch is ${latestBatch.filename} with status ${latestBatch.status}. This month the import rejection rate is ${reports.cards.find((card) => card.id === "import-rejection-rate")?.value ?? "0%"} across ${reports.recentImports.length} recent batches.`
        : "No import batches have been recorded for this organization yet.",
      references: ["Recent import batches", "Import rejection rate"],
      followUps: [
        "Which batch had the most rejected rows?",
        "Show me recent import errors.",
      ],
    };
  }

  if (
    normalizedQuestion.includes("balance") ||
    normalizedQuestion.includes("wallet") ||
    normalizedQuestion.includes("billing")
  ) {
    return {
      answer: `The current wallet balance is ${formatCurrency(overview.balanceCents)}. Based on recent usage, the projected runway is ${overview.projectedDaysRemaining ?? 0} days, and ${overview.needsAttention.length > 0 ? "there are active attention items on the dashboard." : "no urgent billing warnings are currently surfaced."}`,
      references: ["Billing summary", "Overview projected runway"],
      followUps: [
        "How many minutes have we processed this month?",
        "Show me recent billing activity.",
      ],
    };
  }

  const degradedIntegrations = integrations.integrations.filter(
    (integration) => integration.status === "error" || integration.status === "degraded"
  );

  return {
    answer: `This month the workspace has processed ${overview.callsThisMonth.toLocaleString()} calls and ${overview.minutesProcessed.toLocaleString()} minutes with a ${formatPercent(overview.flagRate)} flag rate. ${degradedIntegrations.length > 0 ? `${degradedIntegrations.length} integrations currently need attention.` : "All currently listed integrations are healthy."}`,
    references: ["Overview KPIs", "Integration health", "Report summary cards"],
    followUps: [
      "Show me import health.",
      "Summarize compliance risk.",
      "Which publisher should I inspect first?",
    ],
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
  if (!isValidImportStoragePath(options.organizationId, options.storagePath)) {
    throw new Error("Import storage path must stay within the organization imports prefix.");
  }

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
