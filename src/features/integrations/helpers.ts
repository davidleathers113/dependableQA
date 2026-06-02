import type { IntegrationCard, IntegrationProvider } from "../../lib/app-data";

interface RingbaPixelUrlOptions {
  origin?: string;
  publicIngestKey: string;
  includePublisher: boolean;
  includeBuyer: boolean;
}

function hasRequiredIngressConfig(integration: IntegrationCard) {
  if (integration.provider === "ringba") {
    return Boolean(integration.ringba.publicIngestKey);
  }

  return integration.webhookAuth.secretConfigured;
}

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
    return "Public GET pixel ingest with Ringba query-string tags.";
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
      label: "Not connected",
      description:
        integration.provider === "ringba"
          ? "Connect this provider to generate the Ringba pixel URL and start receiving call events."
          : "Connect this provider to start receiving signed webhook events.",
    };
  }

  const hasRequiredConfig = hasRequiredIngressConfig(integration);
  const hasSuccess = Boolean(integration.lastSuccessAt);
  const hasError = Boolean(integration.lastErrorAt);
  const lastEventSeverity = integration.lastEventSeverity ?? "info";
  const hasRecentErrorEvent = integration.recentEvents.some((event) => event.severity === "error");
  const hasRecentWarningEvent = integration.recentEvents.some((event) => event.severity === "warning");
  const hasRecentSuccessEvent = integration.recentEvents.some(
    (event) => event.severity !== "error" && event.severity !== "warning"
  );

  if (integration.status === "error" || lastEventSeverity === "error" || hasRecentErrorEvent) {
    return {
      state: "error",
      label: "Error",
      description: "Recent webhook activity failed and needs attention.",
    };
  }

  if (!hasRequiredConfig) {
    return {
      state: "needs-configuration",
      label: "Needs configuration",
      description:
        integration.provider === "ringba"
          ? "Ringba pixel setup is incomplete because this integration does not have a public ingest key yet."
          : "Webhook signing is incomplete, so inbound events cannot be trusted yet.",
    };
  }

  if (
    integration.status === "degraded" ||
    lastEventSeverity === "warning" ||
    hasRecentWarningEvent ||
    (hasError && !hasSuccess && !hasRecentSuccessEvent)
  ) {
    return {
      state: "degraded",
      label: "Degraded",
      description: "The integration is configured, but recent activity shows warnings or partial failures.",
    };
  }

  if (!hasSuccess && !hasRecentSuccessEvent) {
    return {
      state: "awaiting-first-event",
      label: "Awaiting first event",
      description:
        integration.provider === "ringba"
          ? "Configuration is present, but no successful Ringba pixel event has been recorded yet."
          : "Configuration is present, but no successful inbound webhook has been recorded yet.",
    };
  }

  return {
    state: "healthy",
    label: "Healthy",
    description:
      integration.provider === "ringba"
        ? "Recent Ringba pixel traffic has been accepted successfully."
        : "Recent signed webhook traffic has been accepted successfully.",
  };
}

export function getWebhookEndpointUrl() {
  if (typeof window === "undefined") {
    return "/.netlify/functions/integration-ingest";
  }

  return new URL("/.netlify/functions/integration-ingest", window.location.origin).toString();
}

export function getPublicAppOrigin() {
  if (typeof window === "undefined") {
    return "";
  }

  const globalWindow = window as typeof window & {
    __DEPENDABLEQA_PUBLIC_APP_ORIGIN__?: unknown;
  };
  const configuredOrigin =
    typeof globalWindow.__DEPENDABLEQA_PUBLIC_APP_ORIGIN__ === "string"
      ? globalWindow.__DEPENDABLEQA_PUBLIC_APP_ORIGIN__.trim()
      : "";
  if (configuredOrigin) {
    return configuredOrigin;
  }

  return window.location.origin;
}

export function getRingbaPixelUrl({
  origin,
  publicIngestKey,
  includePublisher,
  includeBuyer,
}: RingbaPixelUrlOptions) {
  const baseUrl = origin
    ? new URL("/api/integrations/ringba/pixel", origin).toString()
    : "/api/integrations/ringba/pixel";
  const queryParts = [
    `api_key=${publicIngestKey}`,
    "platform=ringba",
    "call_id=[Call:InboundCallId]",
    "caller_number=[tag:InboundNumber:Number]",
    "duration_seconds=[tag:CallLength:Total]",
    "recording_url=[Call:RecordingUrl]",
    "campaign_name=[tag:Campaign:Name]",
    "call_timestamp=[Call:CallConnectedTimestamp]",
    // Backup when [Call:CallConnectedTimestamp] is empty for some pixel triggers; parser uses first non-empty time param.
    "call_connection_dt=[Call:CallConnectionDt]",
  ];

  if (includePublisher) {
    queryParts.push("publisher_name=[tag:Publisher:Name]");
  }

  if (includeBuyer) {
    queryParts.push("buyer_name=[tag:Buyer:Name]");
  }

  return `${baseUrl}?${queryParts.join("&")}`;
}

export function getIntegrationLatestStatusLabel(integration: IntegrationCard) {
  if (!integration.isConfigured) {
    return "Not connected yet";
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
    const latestEvent = integration.recentEvents[0];
    if (latestEvent?.severity === "error") {
      return "Recent error recorded";
    }

    if (latestEvent?.severity === "warning") {
      return "Recent warning recorded";
    }

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
      `Create a ${providerLabel} recording pixel with the full pixel URL shown below.`,
      "Ringba pixels use GET query tags, not custom signature headers.",
      "Add the pixel to each campaign individually, then wait for a real completed call to confirm diagnostics update.",
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
    return "Configure Ringba to fire a recording pixel to the DependableQA Ringba URL above. The URL already includes the required query-string tags and public ingest key. Add the pixel to each campaign you want to track, then wait for a completed call to verify delivery.";
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
    return integration.provider === "ringba"
      ? "Connect this provider to generate the Ringba pixel URL."
      : "Connect this provider to start receiving webhook events.";
  }

  const health = getIntegrationHealth(integration);

  if (integration.lastEventMessage) {
    return integration.lastEventMessage;
  }

  if (health.state === "needs-configuration") {
    return integration.provider === "ringba"
      ? "Ringba pixel setup is not fully configured yet."
      : "Webhook security is not fully configured yet.";
  }

  if (health.state === "awaiting-first-event") {
    return integration.provider === "ringba"
      ? "Configuration is complete. Waiting for the first Ringba pixel event."
      : "Configuration is complete. Waiting for the first webhook event.";
  }

  if (health.state === "error") {
    return "Recent integration events failed. Review diagnostics below.";
  }

  if (integration.recentEvents.length > 0) {
    return integration.provider === "ringba"
      ? "A recent Ringba pixel event was recorded. Open diagnostics for full details."
      : "A recent webhook event was recorded. Open diagnostics for full details.";
  }

  return integration.provider === "ringba"
    ? "No Ringba pixel events have been recorded yet for this integration."
    : "No webhook events have been recorded yet for this integration.";
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

/**
 * Tab ids in the integration detail workspace. Kept here so the checklist /
 * next-step helpers can point a CTA at the right tab without importing UI.
 */
export type IntegrationWorkspaceTab =
  | "overview"
  | "pixel"
  | "api"
  | "advanced"
  | "imports"
  | "diagnostics"
  | "setup"
  | "security";

export interface IntegrationChecklistItem {
  id: string;
  label: string;
  done: boolean;
  optional: boolean;
  targetTab: IntegrationWorkspaceTab;
}

export interface IntegrationNextStep {
  label: string;
  description: string;
  cta: { label: string; targetTab: IntegrationWorkspaceTab } | null;
  /** True when no required steps remain. */
  complete: boolean;
}

export type IntegrationCapabilityState = "ready" | "inactive" | "attention";

export interface IntegrationCapability {
  key: string;
  label: string;
  state: IntegrationCapabilityState;
  detail: string;
}

function hasRecentErrorActivity(integration: IntegrationCard) {
  return integration.status === "error" || integration.recentEvents.some((event) => event.severity === "error");
}

function hasSuccessfulEvent(integration: IntegrationCard) {
  return integration.recentEvents.some((event) => event.severity !== "error" && event.severity !== "warning");
}

/**
 * Ordered setup checklist derived purely from IntegrationCard. Required items
 * drive the "next step"; optional items (pixel, scheduled sync) never block it.
 *
 * Note: there is no persisted "tested" / "imported" flag on the card, so
 * "Verify connection" and "Import first calls" use proxies — the Ringba API
 * sync watermark, success-severity events, and the integration-level
 * lastSuccessAt. Good enough for guidance; exactness would need per-channel
 * timestamps from recentEvents.
 */
export function getIntegrationChecklist(integration: IntegrationCard): IntegrationChecklistItem[] {
  const created = integration.isConfigured && !integration.isCatalogPlaceholder;

  if (integration.provider === "ringba") {
    const credentialsReady = integration.ringba.apiTokenConfigured && integration.ringba.ringbaAccountId !== "";
    const connectionVerified = integration.ringba.lastRingbaApiSyncAt !== null || hasSuccessfulEvent(integration);
    const callsImported = integration.lastSuccessAt !== null || integration.recentEvents.length > 0;

    return [
      { id: "create", label: "Create the Ringba integration", done: created, optional: false, targetTab: "overview" },
      {
        id: "credentials",
        label: "Add your API Account ID and token",
        done: created && credentialsReady,
        optional: false,
        targetTab: "api",
      },
      {
        id: "verify",
        label: "Verify the API connection",
        done: created && credentialsReady && connectionVerified,
        optional: false,
        targetTab: "api",
      },
      {
        id: "import",
        label: "Import your first calls",
        done: created && callsImported,
        optional: false,
        targetTab: "imports",
      },
      {
        id: "pixel",
        label: "Install the real-time pixel",
        done: created && integration.ringba.publicIngestKey !== "" && integration.lastSuccessAt !== null,
        optional: true,
        targetTab: "pixel",
      },
      {
        id: "schedule",
        label: "Enable scheduled sync",
        done: created && integration.ringba.ringbaApiSyncEnabled,
        optional: true,
        targetTab: "advanced",
      },
    ];
  }

  const securityReady = integration.webhookAuth.secretConfigured;
  const eventReceived = integration.lastSuccessAt !== null || integration.recentEvents.length > 0;

  return [
    { id: "create", label: "Create the integration", done: created, optional: false, targetTab: "overview" },
    {
      id: "security",
      label: "Configure webhook security",
      done: created && securityReady,
      optional: false,
      targetTab: "security",
    },
    {
      id: "first-event",
      label: "Receive your first event",
      done: created && eventReceived,
      optional: false,
      targetTab: "setup",
    },
  ];
}

function nextStepCtaLabel(id: string) {
  switch (id) {
    case "create":
      return "Create integration";
    case "credentials":
      return "Add credentials";
    case "verify":
      return "Test connection";
    case "import":
      return "Import calls";
    case "security":
      return "Configure security";
    case "first-event":
      return "Send a test event";
    default:
      return "Continue";
  }
}

function nextStepDescription(id: string, integration: IntegrationCard) {
  switch (id) {
    case "create":
      return integration.provider === "ringba"
        ? "Create the Ringba integration so DependableQA can generate keys and store your settings."
        : "Create the integration so DependableQA can store webhook security settings.";
    case "credentials":
      return "Enter your Ringba Account ID and API token, then save them in the API sync tab.";
    case "verify":
      return "Run a connection test to confirm DependableQA can read your Ringba Call Logs.";
    case "import":
      return "Pull a bounded set of recent calls so you can review what arrives before analyzing.";
    case "security":
      return "Set up request signing so inbound provider webhooks can be verified.";
    case "first-event":
      return "Send a test event (or trigger a real one) to confirm events arrive.";
    default:
      return "";
  }
}

/** First incomplete required checklist item, with a tailored CTA and copy. */
export function getIntegrationNextStep(integration: IntegrationCard): IntegrationNextStep {
  const next = getIntegrationChecklist(integration).find((item) => !item.optional && !item.done);

  if (!next) {
    return {
      label: "You're all set",
      description:
        integration.provider === "ringba"
          ? "Ringba calls are flowing in. Review activity in Diagnostics or fine-tune scheduled sync."
          : "This integration is receiving events. Review activity in Diagnostics.",
      cta: null,
      complete: true,
    };
  }

  return {
    label: next.label,
    description: nextStepDescription(next.id, integration),
    cta: { label: nextStepCtaLabel(next.id), targetTab: next.targetTab },
    complete: false,
  };
}

/**
 * Per-capability readiness, so the overview can show that (for Ringba) the API
 * connection, the real-time pixel, and the scheduled sync each have their own
 * health — they are not one combined status. lastSuccessAt is integration-level
 * (it can't distinguish a pixel event from an API event), so the API/sync cards
 * lean on the API-specific lastRingbaApiSyncAt watermark instead.
 */
export function getIntegrationCapabilities(integration: IntegrationCard): IntegrationCapability[] {
  const errored = hasRecentErrorActivity(integration);

  if (integration.provider === "ringba") {
    const credentialsReady = integration.ringba.apiTokenConfigured && integration.ringba.ringbaAccountId !== "";
    const synced = integration.ringba.lastRingbaApiSyncAt !== null;
    const pixelReady = integration.ringba.publicIngestKey !== "";
    const pixelProven = pixelReady && integration.lastSuccessAt !== null;
    const syncEnabled = integration.ringba.ringbaApiSyncEnabled;

    return [
      {
        key: "api",
        label: "API connection",
        state: !credentialsReady ? "inactive" : errored ? "attention" : "ready",
        detail: !credentialsReady
          ? "Add your Account ID and token"
          : errored
            ? "Recent API error — check Diagnostics"
            : synced
              ? `Last sync ${formatIntegrationDateTime(integration.ringba.lastRingbaApiSyncAt)}`
              : "Connected — no sync yet",
      },
      {
        key: "pixel",
        label: "Pixel ingestion",
        state: !pixelReady ? "inactive" : !pixelProven ? "inactive" : errored ? "attention" : "ready",
        detail: !pixelReady
          ? "Pixel URL not generated yet"
          : !pixelProven
            ? "Ready — awaiting first call"
            : errored
              ? "Recent pixel error — check Diagnostics"
              : "Receiving call events",
      },
      {
        key: "sync",
        label: "Scheduled sync",
        state: !syncEnabled ? "inactive" : errored ? "attention" : "ready",
        detail: !syncEnabled
          ? "Off"
          : synced
            ? `Last run ${formatIntegrationDateTime(integration.ringba.lastRingbaApiSyncAt)}`
            : "Enabled — first run pending",
      },
    ];
  }

  const securityReady = integration.webhookAuth.secretConfigured;
  const eventReceived = integration.lastSuccessAt !== null || integration.recentEvents.length > 0;

  return [
    {
      key: "auth",
      label: "Webhook security",
      state: !securityReady ? "inactive" : errored ? "attention" : "ready",
      detail: !securityReady
        ? "No signing secret configured"
        : errored
          ? "Recent error — check Diagnostics"
          : "Signing configured",
    },
    {
      key: "events",
      label: "Inbound events",
      state: !eventReceived ? "inactive" : errored ? "attention" : "ready",
      detail: !eventReceived ? "No events received yet" : errored ? "Recent error — check Diagnostics" : "Receiving events",
    },
  ];
}

export function getDiagnosticsSummaryLine(integration: IntegrationCard) {
  if (!integration.isConfigured) {
    return "Connect this provider to start receiving diagnostics.";
  }

  const health = getIntegrationHealth(integration);

  if (integration.recentEvents.length === 0) {
    return integration.provider === "ringba"
      ? "Configuration is complete. Waiting for the first Ringba pixel event."
      : "Configuration is complete. Waiting for the first webhook event.";
  }

  if (health.state === "healthy" || health.state === "awaiting-first-event") {
    return integration.provider === "ringba"
      ? "Recent Ringba pixel events are processing successfully."
      : "Recent webhook events are processing successfully.";
  }

  return integration.provider === "ringba"
    ? "Recent Ringba pixel events need attention. Review the latest messages below."
    : "Recent webhook events need attention. Review the latest messages below.";
}

const WORKSPACE_TAB_LABELS: Record<IntegrationWorkspaceTab, string> = {
  overview: "Overview",
  pixel: "Pixel",
  api: "API sync",
  advanced: "Advanced",
  imports: "Imports",
  diagnostics: "Diagnostics",
  setup: "Setup",
  security: "Security",
};

export interface IntegrationPreTrafficGuide {
  /** A verification the user can run now, before live traffic (null when no required step remains). */
  verifyNow: { action: string; detail: string; location: string; targetTab: IntegrationWorkspaceTab } | null;
  /** Provider-accurate signals that will appear in Diagnostics after the first call. */
  afterFirstCall: string[];
  /** What an empty diagnostics list means before traffic, and how to tell setup issues from no-traffic. */
  noDataMeaning: string;
}

/**
 * Pre-traffic guidance for the Diagnostics empty state: what to verify now, what
 * signals will appear after the first call, and what "no events yet" actually
 * means. Reuses `getIntegrationNextStep` for the verify-now action so the copy
 * stays in sync with the setup checklist. Provider claims are deliberately
 * conservative — only Ringba's parsed fields (recording link, duration, campaign,
 * publisher) are named, since the other providers' field-level normalization is
 * not yet runtime-proven.
 */
export function getIntegrationPreTrafficGuide(integration: IntegrationCard): IntegrationPreTrafficGuide {
  const nextStep = getIntegrationNextStep(integration);
  const verifyNow = nextStep.cta
    ? {
        action: nextStep.cta.label,
        detail: nextStep.description,
        location: `${WORKSPACE_TAB_LABELS[nextStep.cta.targetTab]} tab`,
        targetTab: nextStep.cta.targetTab,
      }
    : null;

  if (integration.provider === "ringba") {
    return {
      verifyNow,
      afterFirstCall: [
        "An accepted event with the call's time, caller number, duration, campaign, publisher, and recording link.",
        "The “Last event” time and “Recent successes” count update within seconds of a completed call.",
        "Calls shorter than your minimum duration are logged as skipped — not as errors.",
      ],
      noDataMeaning:
        "An empty list before your first call is expected — it does not mean the connection is broken. Place the pixel (or run a scheduled sync) and complete a test call; events appear here within seconds. Still nothing after a minute? Re-check your Account ID, API token, and pixel URL.",
    };
  }

  return {
    verifyNow,
    afterFirstCall: [
      "An accepted event showing the call's message, event type, severity, and time.",
      "The “Last event” time and “Recent successes” count update once the provider posts a webhook.",
      "Signature or payload problems are logged here as warnings or errors.",
    ],
    noDataMeaning:
      "An empty list before your first webhook is expected — it does not mean the connection is broken. Point the provider at the webhook endpoint and send a test event; it appears here within seconds. Still nothing after a minute? Re-check the endpoint URL and your signing secret.",
  };
}
