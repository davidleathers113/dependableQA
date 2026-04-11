import type { IntegrationCard, IntegrationProvider } from "../../lib/app-data";

export type IntegrationHealthState =
  | "healthy"
  | "needs-configuration"
  | "awaiting-first-event"
  | "degraded"
  | "error";

export interface IntegrationHealthSummary {
  state: IntegrationHealthState;
  label: string;
  description: string;
}

export interface IntegrationSummaryMeta {
  setupModelDescription: string;
  latestStatusLabel: string;
  primaryActionLabel: string;
}

export function formatIntegrationDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatIntegrationRelativeTime(value: string | null, now = Date.now()) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const deltaSeconds = Math.round((timestamp - now) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (absoluteSeconds < 60) {
    return formatter.format(deltaSeconds, "second");
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(deltaMinutes, "minute");
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return formatter.format(deltaHours, "hour");
  }

  const deltaDays = Math.round(deltaHours / 24);
  return formatter.format(deltaDays, "day");
}

export function getIntegrationProviderLabel(provider: IntegrationProvider) {
  if (provider === "ringba") {
    return "Ringba";
  }

  if (provider === "retreaver") {
    return "Retreaver";
  }

  if (provider === "trackdrive") {
    return "TrackDrive";
  }

  return "Custom";
}

export function getIntegrationSetupModelDescription(provider: IntegrationProvider) {
  if (provider === "ringba") {
    return "Webhook ingest with signed provider payloads.";
  }

  if (provider === "trackdrive") {
    return "JSON POST webhook. One connection can cover all configured sources.";
  }

  if (provider === "retreaver") {
    return "Webhook or export-based ingest for call event processing.";
  }

  return "Custom provider webhook delivery with request verification.";
}

export function getIntegrationHealth(integration: IntegrationCard): IntegrationHealthSummary {
  if (!integration.isConfigured || integration.isCatalogPlaceholder) {
    return {
      state: "needs-configuration",
      label: "Needs configuration",
      description: "This provider has not been configured yet.",
    };
  }

  const hasSecret = integration.webhookAuth.secretConfigured;
  const hasSuccess = Boolean(integration.lastSuccessAt);
  const hasError = Boolean(integration.lastErrorAt);
  const lastEventSeverity = integration.lastEventSeverity ?? "info";

  if (integration.status === "error" || lastEventSeverity === "error") {
    return {
      state: "error",
      label: "Error",
      description: "Recent webhook activity failed and needs attention.",
    };
  }

  if (!hasSecret) {
    return {
      state: "needs-configuration",
      label: "Needs configuration",
      description: "Webhook signing is incomplete, so inbound events cannot be trusted yet.",
    };
  }

  if (integration.status === "degraded" || lastEventSeverity === "warning" || (hasError && !hasSuccess)) {
    return {
      state: "degraded",
      label: "Degraded",
      description: "The integration is configured, but recent activity shows warnings or partial failures.",
    };
  }

  if (!hasSuccess) {
    return {
      state: "awaiting-first-event",
      label: "Awaiting first event",
      description: "Configuration is present, but no successful inbound webhook has been recorded yet.",
    };
  }

  return {
    state: "healthy",
    label: "Healthy",
    description: "Recent signed webhook traffic has been accepted successfully.",
  };
}

export function getWebhookEndpointUrl() {
  if (typeof window === "undefined") {
    return "/.netlify/functions/integration-ingest";
  }

  return new URL("/.netlify/functions/integration-ingest", window.location.origin).toString();
}

export function getIntegrationLatestStatusLabel(integration: IntegrationCard) {
  if (!integration.isConfigured) {
    return "No events received yet";
  }

  const lastErrorTime = integration.lastErrorAt ? new Date(integration.lastErrorAt).getTime() : Number.NaN;
  const lastSuccessTime = integration.lastSuccessAt ? new Date(integration.lastSuccessAt).getTime() : Number.NaN;
  const hasValidError = !Number.isNaN(lastErrorTime);
  const hasValidSuccess = !Number.isNaN(lastSuccessTime);

  if (hasValidError && (!hasValidSuccess || lastErrorTime >= lastSuccessTime)) {
    return `Last error: ${formatIntegrationDateTime(integration.lastErrorAt)}`;
  }

  if (hasValidSuccess) {
    return `Last success: ${formatIntegrationDateTime(integration.lastSuccessAt)}`;
  }

  if (integration.recentEvents.length > 0) {
    return "Recent event recorded";
  }

  return "No events received yet";
}

export function getIntegrationPrimaryActionLabel(integration: IntegrationCard) {
  if (!integration.isConfigured) {
    return "Connect";
  }

  const health = getIntegrationHealth(integration);
  return health.state === "needs-configuration" ? "Configure" : "Reconfigure";
}

export function getIntegrationSummaryMeta(integration: IntegrationCard): IntegrationSummaryMeta {
  return {
    setupModelDescription: getIntegrationSetupModelDescription(integration.provider),
    latestStatusLabel: getIntegrationLatestStatusLabel(integration),
    primaryActionLabel: getIntegrationPrimaryActionLabel(integration),
  };
}

export function getSecretSourceLabel(secretSource: IntegrationCard["webhookAuth"]["secretSource"]) {
  if (secretSource === "integration") {
    return "Integration-specific";
  }

  if (secretSource === "environment") {
    return "Environment fallback";
  }

  return "None";
}

export function getSecretStateLabel(integration: IntegrationCard) {
  if (!integration.isConfigured) {
    return "No secret configured";
  }

  if (integration.webhookAuth.secretSource === "integration") {
    return "Integration-specific secret configured";
  }

  if (integration.webhookAuth.secretSource === "environment") {
    return "Using environment fallback secret";
  }

  return "No secret configured";
}

export function getSecretStateDescription(integration: IntegrationCard) {
  if (integration.webhookAuth.secretSource === "integration") {
    return "An integration-specific secret is active for inbound verification.";
  }

  if (integration.webhookAuth.secretSource === "environment") {
    return "This integration inherits the shared environment secret for inbound verification.";
  }

  return "No secret is configured yet. Unsigned or mismatched webhook requests will be rejected.";
}

export function getIntegrationSetupSteps(integration: IntegrationCard) {
  const providerLabel = getIntegrationProviderLabel(integration.provider);
  const authLabel = integration.webhookAuth.authType === "hmac-sha256" ? "HMAC SHA-256" : "shared secret";
  const prefixText = integration.webhookAuth.prefix ? `Prefix the value with \`${integration.webhookAuth.prefix}\`.` : "No prefix is required.";

  if (integration.provider === "ringba") {
    return [
      `Create or update the ${providerLabel} webhook destination with the endpoint shown below.`,
      `Send the signature in the \`${integration.webhookAuth.headerName}\` header using ${authLabel}. ${prefixText}`,
      "Trigger a test call or webhook from Ringba, then confirm the first accepted event appears in diagnostics.",
    ];
  }

  if (integration.provider === "trackdrive") {
    return [
      `Point ${providerLabel} postback delivery to the endpoint shown below.`,
      `Configure the \`${integration.webhookAuth.headerName}\` header so DependableQA can validate each payload with ${authLabel}. ${prefixText}`,
      "After saving provider settings, send a test lead or call event and confirm diagnostics update.",
    ];
  }

  if (integration.provider === "retreaver") {
    return [
      `Use the endpoint below as the ${providerLabel} webhook target for inbound call events.`,
      `Attach ${authLabel} data in the \`${integration.webhookAuth.headerName}\` header. ${prefixText}`,
      "Rotate the secret here first if you need a provider-specific signing value, then run a provider-side test event.",
    ];
  }

  return [
    "Use the endpoint below as the destination for inbound provider events.",
    `Send verification data in the \`${integration.webhookAuth.headerName}\` header using ${authLabel}. ${prefixText}`,
    "After configuration, send a signed sample payload and verify a successful event appears in diagnostics.",
  ];
}

export function getIntegrationSetupDescription(integration: IntegrationCard) {
  if (integration.provider === "ringba") {
    return "Configure Ringba to send signed webhook payloads to the DependableQA endpoint above. Use the signature header and prefix exactly as shown. After saving your provider settings, send a test event to verify delivery.";
  }

  if (integration.provider === "trackdrive") {
    return "Configure TrackDrive to send a JSON POST webhook to the DependableQA endpoint above. If request signing is enabled, use the configured signature header and prefix. Send a test event after setup to confirm delivery.";
  }

  if (integration.provider === "retreaver") {
    return "Configure Retreaver to send webhook events or exports into DependableQA. When using signed requests, match the header and prefix exactly. Verify the first event appears in diagnostics.";
  }

  return "Use these values in your provider to send webhook events to DependableQA.";
}

export function getIntegrationSetupHeading(integration: IntegrationCard) {
  return `${getIntegrationProviderLabel(integration.provider)} setup`;
}

export function getIntegrationLatestEventText(integration: IntegrationCard) {
  if (!integration.isConfigured) {
    return "This provider has not been configured yet.";
  }

  const health = getIntegrationHealth(integration);

  if (integration.lastEventMessage) {
    return integration.lastEventMessage;
  }

  if (health.state === "needs-configuration") {
    return "Webhook security is not fully configured yet.";
  }

  if (health.state === "awaiting-first-event") {
    return "Configuration saved. Waiting for the first provider event.";
  }

  if (health.state === "error") {
    return "Recent integration events failed. Review diagnostics below.";
  }

  return "No webhook events have been recorded yet for this integration.";
}

export function getDiagnosticsSummary(integration: IntegrationCard) {
  let successCount = 0;
  let errorCount = 0;
  let warningCount = 0;

  for (const event of integration.recentEvents) {
    if (event.severity === "error") {
      errorCount += 1;
      continue;
    }

    if (event.severity === "warning") {
      warningCount += 1;
      continue;
    }

    successCount += 1;
  }

  return {
    successCount,
    warningCount,
    errorCount,
    lastReceivedAt: integration.recentEvents[0]?.createdAt ?? null,
  };
}

export function getDiagnosticsSummaryLine(integration: IntegrationCard) {
  if (!integration.isConfigured) {
    return "No webhook events have been recorded yet for this integration.";
  }

  const health = getIntegrationHealth(integration);

  if (integration.recentEvents.length === 0) {
    return "No webhook events have been recorded yet for this integration.";
  }

  if (health.state === "healthy" || health.state === "awaiting-first-event") {
    return "Recent webhook events are processing successfully.";
  }

  return "Recent webhook events need attention. Review the latest messages below.";
}
