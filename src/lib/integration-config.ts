import type { Json } from "../../supabase/types";

export type IntegrationWebhookAuthType = "shared-secret" | "hmac-sha256";
export type IntegrationWebhookSecretSource = "integration" | "environment" | "none";
export const DEFAULT_RINGBA_MINIMUM_DURATION_SECONDS = 30;

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

export function getPublicIntegrationRingbaConfig(config: unknown): PublicIntegrationRingbaConfig {
  const configRecord = asRecord(config) ?? {};
  const ringba = getConfiguredRingba(configRecord);

  return {
    publicIngestKey: asString(ringba?.publicIngestKey),
    minimumDurationSeconds: normalizeMinimumDurationSeconds(ringba?.minimumDurationSeconds),
  };
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

  configRecord.ringba = nextRingba;
  return configRecord as Json;
}
