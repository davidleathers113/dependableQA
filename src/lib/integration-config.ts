import type { Json } from "../../supabase/types";

export type IntegrationWebhookAuthType = "shared-secret" | "hmac-sha256";
export type IntegrationWebhookSecretSource = "integration" | "environment" | "none";
export const DEFAULT_RINGBA_MINIMUM_DURATION_SECONDS = 30;

/** Ringba Call Logs API pull: minimum interval between syncs (UI / stored config). */
export const RINGBA_API_POLL_INTERVAL_MIN_MINUTES = 15;
export const RINGBA_API_POLL_INTERVAL_MAX_MINUTES = 1440;
export const RINGBA_API_POLL_INTERVAL_DEFAULT_MINUTES = 60;

export const RINGBA_API_LOOKBACK_MIN_HOURS = 1;
export const RINGBA_API_LOOKBACK_MAX_HOURS = 168;
export const RINGBA_API_LOOKBACK_DEFAULT_HOURS = 48;

export const DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE = "America/Chicago";

let cachedIanaTimeZones: ReadonlySet<string> | null = null;

function getIanaTimeZoneSet(): ReadonlySet<string> {
  if (cachedIanaTimeZones) {
    return cachedIanaTimeZones;
  }
  const list =
    typeof Intl !== "undefined" && "supportedValuesOf" in Intl
      ? (Intl.supportedValuesOf as (key: string) => string[])("timeZone")
      : [];
  cachedIanaTimeZones = new Set(list);
  return cachedIanaTimeZones;
}

export function isValidIanaTimeZone(value: string): boolean {
  const zone = value.trim();
  if (!zone) {
    return false;
  }
  return getIanaTimeZoneSet().has(zone);
}

export interface PublicIntegrationWebhookAuth {
  authType: IntegrationWebhookAuthType;
  headerName: string;
  prefix: string;
  secretConfigured: boolean;
  secretSource: IntegrationWebhookSecretSource;
}

export interface PublicIntegrationRingbaConfig {
  publicIngestKey: string;
  minimumDurationSeconds: number;
  ringbaApiSyncEnabled: boolean;
  ringbaAccountId: string;
  apiTokenConfigured: boolean;
  callLogsTimeZone: string;
  pollIntervalMinutes: number;
  lookbackHours: number;
  lastRingbaApiSyncAt: string | null;
}

export interface PublicIntegrationEvent {
  id: string;
  eventType: string;
  severity: string;
  message: string;
  createdAt: string;
}

export interface IntegrationWebhookDefaults {
  fallbackSecretConfigured?: boolean;
  fallbackHeaderName?: string | null;
  fallbackPrefix?: string | null;
}

export interface IntegrationWebhookAuthInput {
  authType: IntegrationWebhookAuthType;
  headerName: string;
  prefix: string;
  secret: string;
}

export interface IntegrationRingbaConfigInput {
  publicIngestKey?: string;
  minimumDurationSeconds?: number;
  ringbaApiSyncEnabled?: boolean;
  ringbaAccountId?: string;
  apiAccessToken?: string;
  callLogsTimeZone?: string;
  pollIntervalMinutes?: number;
  lookbackHours?: number;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cloneRecord(value: unknown) {
  const record = asRecord(value);
  return record ? { ...record } : {};
}

function getConfiguredSecret(configRecord: Record<string, unknown>, webhookAuth: Record<string, unknown> | null) {
  return asString(webhookAuth?.secret) || asString(configRecord.signingSecret) || asString(configRecord.sharedSecret);
}

function getConfiguredRingba(configRecord: Record<string, unknown>) {
  return asRecord(configRecord.ringba);
}

function normalizeMinimumDurationSeconds(value: unknown) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration < 0) {
    return DEFAULT_RINGBA_MINIMUM_DURATION_SECONDS;
  }

  return Math.floor(duration);
}

function normalizePollIntervalMinutes(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return RINGBA_API_POLL_INTERVAL_DEFAULT_MINUTES;
  }
  return Math.min(
    RINGBA_API_POLL_INTERVAL_MAX_MINUTES,
    Math.max(RINGBA_API_POLL_INTERVAL_MIN_MINUTES, Math.floor(n))
  );
}

function normalizeLookbackHours(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return RINGBA_API_LOOKBACK_DEFAULT_HOURS;
  }
  return Math.min(
    RINGBA_API_LOOKBACK_MAX_HOURS,
    Math.max(RINGBA_API_LOOKBACK_MIN_HOURS, Math.floor(n))
  );
}

export function getPublicIntegrationRingbaConfig(config: unknown): PublicIntegrationRingbaConfig {
  const configRecord = asRecord(config) ?? {};
  const ringba = getConfiguredRingba(configRecord);
  const accountId = asString(ringba?.ringbaAccountId);
  const token = asString(ringba?.apiAccessToken);

  return {
    publicIngestKey: asString(ringba?.publicIngestKey),
    minimumDurationSeconds: normalizeMinimumDurationSeconds(ringba?.minimumDurationSeconds),
    ringbaApiSyncEnabled: Boolean(ringba?.ringbaApiSyncEnabled),
    ringbaAccountId: accountId,
    apiTokenConfigured: Boolean(token),
    callLogsTimeZone: asString(ringba?.callLogsTimeZone) || DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE,
    pollIntervalMinutes: normalizePollIntervalMinutes(ringba?.pollIntervalMinutes),
    lookbackHours: normalizeLookbackHours(ringba?.lookbackHours),
    lastRingbaApiSyncAt: asString(ringba?.lastRingbaApiSyncAt) || null,
  };
}

/** Server-only: read Ringba API token from integration config JSON (never expose to clients). */
export function getRingbaApiAccessTokenFromConfig(config: unknown): string {
  const ringba = getConfiguredRingba(asRecord(config) ?? {});
  return asString(ringba?.apiAccessToken);
}

export function getPublicIntegrationWebhookAuth(
  config: unknown,
  defaults?: IntegrationWebhookDefaults
): PublicIntegrationWebhookAuth {
  const configRecord = asRecord(config) ?? {};
  const webhookAuth = asRecord(configRecord.webhookAuth);
  const configuredSecret = getConfiguredSecret(configRecord, webhookAuth);
  const fallbackSecretConfigured = Boolean(defaults?.fallbackSecretConfigured);

  const configuredType =
    asString(webhookAuth?.type) || (asString(configRecord.sharedSecret) ? "shared-secret" : "hmac-sha256");
  const authType: IntegrationWebhookAuthType =
    configuredType === "shared-secret" ? "shared-secret" : "hmac-sha256";
  const headerName =
    asString(webhookAuth?.headerName) ||
    asString(configRecord.signatureHeader) ||
    asString(configRecord.sharedSecretHeader) ||
    asString(defaults?.fallbackHeaderName) ||
    "x-dependableqa-signature";
  const prefix =
    asString(webhookAuth?.prefix) ||
    asString(configRecord.signaturePrefix) ||
    asString(defaults?.fallbackPrefix) ||
    (authType === "hmac-sha256" ? "sha256=" : "");

  if (configuredSecret) {
    return {
      authType,
      headerName,
      prefix,
      secretConfigured: true,
      secretSource: "integration",
    };
  }

  if (fallbackSecretConfigured) {
    return {
      authType,
      headerName,
      prefix,
      secretConfigured: true,
      secretSource: "environment",
    };
  }

  return {
    authType,
    headerName,
    prefix,
    secretConfigured: false,
    secretSource: "none",
  };
}

export function normalizeIntegrationWebhookAuthInput(
  existingConfig: unknown,
  input: IntegrationWebhookAuthInput
): Json {
  const configRecord = cloneRecord(existingConfig);
  const existingWebhookAuth = cloneRecord(configRecord.webhookAuth);
  const headerName = asString(input.headerName) || "x-dependableqa-signature";
  const authType: IntegrationWebhookAuthType =
    input.authType === "shared-secret" ? "shared-secret" : "hmac-sha256";
  const defaultPrefix = authType === "hmac-sha256" ? "sha256=" : "";
  const prefix = asString(input.prefix) || defaultPrefix;
  const nextSecret = asString(input.secret) || getConfiguredSecret(configRecord, asRecord(existingWebhookAuth));

  const nextWebhookAuth: Record<string, unknown> = {
    ...existingWebhookAuth,
    type: authType,
    headerName,
    prefix,
  };

  if (nextSecret) {
    nextWebhookAuth.secret = nextSecret;
  } else {
    delete nextWebhookAuth.secret;
  }

  delete configRecord.signingSecret;
  delete configRecord.sharedSecret;
  delete configRecord.signatureHeader;
  delete configRecord.sharedSecretHeader;
  delete configRecord.signaturePrefix;
  configRecord.webhookAuth = nextWebhookAuth;

  return configRecord as Json;
}

export function normalizeIntegrationRingbaConfigInput(
  existingConfig: unknown,
  input: IntegrationRingbaConfigInput
): Json {
  const configRecord = cloneRecord(existingConfig);
  const existingRingba = cloneRecord(configRecord.ringba);
  const nextPublicIngestKey =
    asString(input.publicIngestKey) || asString(existingRingba.publicIngestKey);

  const incomingToken = asString(input.apiAccessToken);
  const existingToken = asString(existingRingba.apiAccessToken);

  const nextRingba: Record<string, unknown> = {
    ...existingRingba,
    minimumDurationSeconds: normalizeMinimumDurationSeconds(
      input.minimumDurationSeconds ?? existingRingba.minimumDurationSeconds
    ),
  };

  if (nextPublicIngestKey) {
    nextRingba.publicIngestKey = nextPublicIngestKey;
  } else {
    delete nextRingba.publicIngestKey;
  }

  if (input.ringbaApiSyncEnabled !== undefined) {
    nextRingba.ringbaApiSyncEnabled = Boolean(input.ringbaApiSyncEnabled);
  }

  if (input.ringbaAccountId !== undefined) {
    const nextId = asString(input.ringbaAccountId);
    if (nextId) {
      nextRingba.ringbaAccountId = nextId;
    } else {
      delete nextRingba.ringbaAccountId;
    }
  }

  if (incomingToken) {
    nextRingba.apiAccessToken = incomingToken;
  } else if (existingToken) {
    nextRingba.apiAccessToken = existingToken;
  } else {
    delete nextRingba.apiAccessToken;
  }

  if (input.callLogsTimeZone !== undefined) {
    const z = asString(input.callLogsTimeZone);
    if (z) {
      nextRingba.callLogsTimeZone = z;
    } else {
      delete nextRingba.callLogsTimeZone;
    }
  }

  if (input.pollIntervalMinutes !== undefined) {
    nextRingba.pollIntervalMinutes = normalizePollIntervalMinutes(input.pollIntervalMinutes);
  }

  if (input.lookbackHours !== undefined) {
    nextRingba.lookbackHours = normalizeLookbackHours(input.lookbackHours);
  }

  configRecord.ringba = nextRingba;
  return configRecord as Json;
}

/** Merge server-written Ringba API sync watermark into config (preserves other keys). */
export function mergeRingbaApiLastSyncAt(existingConfig: unknown, isoTimestamp: string): Json {
  const configRecord = cloneRecord(existingConfig);
  const ringba = cloneRecord(configRecord.ringba);
  ringba.lastRingbaApiSyncAt = isoTimestamp;
  configRecord.ringba = ringba;
  return configRecord as Json;
}
