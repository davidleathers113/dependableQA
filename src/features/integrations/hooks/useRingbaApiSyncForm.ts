import * as React from "react";
import type { IntegrationCard } from "../../../lib/app-data";
import {
  DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE,
  listIanaTimeZones,
  RINGBA_API_POLL_INTERVAL_MAX_MINUTES,
  RINGBA_API_POLL_INTERVAL_MIN_MINUTES,
} from "../../../lib/integration-config";

export interface RingbaApiSyncFormInput {
  ringbaApiSyncEnabled: boolean;
  ringbaAccountId: string;
  apiAccessToken: string;
  callLogsTimeZone: string;
  pollIntervalMinutes: number;
  lookbackHours: number;
  minimumDurationSeconds: number;
}

export interface RingbaConnectionTestInput {
  ringbaAccountId: string;
  apiAccessToken: string;
  callLogsTimeZone: string;
}

export interface RingbaApiSyncForm {
  enabled: boolean;
  accountId: string;
  apiToken: string;
  timeZone: string;
  pollMinutes: number;
  lookback: number;
  minDuration: number;
  timeZoneOptions: readonly string[];
  validationMessage: string;
  editedSinceTest: boolean;
  apiTokenConfigured: boolean;
  setEnabled: (value: boolean) => void;
  setAccountId: (value: string) => void;
  setApiToken: (value: string) => void;
  setTimeZone: (value: string) => void;
  setPollMinutes: (value: number) => void;
  setLookback: (value: number) => void;
  setMinDuration: (value: number) => void;
  /** Validate the form: returns the input to save, or null after setting a message. */
  buildSaveInput: () => RingbaApiSyncFormInput | null;
  /** Currently-typed values for a connection test (blank token falls back server-side). */
  testInput: () => RingbaConnectionTestInput;
}

interface Options {
  integration: IntegrationCard;
  testNotice: { type: "success" | "error"; text: string } | null;
}

/**
 * Single source of truth for the Ringba API form, lifted out of one panel so
 * the connection fields and the advanced sync fields can render in different
 * tabs against the same state (tabs keep panels mounted, so values survive the
 * switch). Mirrors the original RingbaApiSyncPanel validation exactly.
 */
export function useRingbaApiSyncForm({ integration, testNotice }: Options): RingbaApiSyncForm {
  const rb = integration.ringba;
  const [enabled, setEnabled] = React.useState(rb.ringbaApiSyncEnabled);
  const [accountId, setAccountIdState] = React.useState(rb.ringbaAccountId);
  const [apiToken, setApiTokenState] = React.useState("");
  const [timeZone, setTimeZoneState] = React.useState(rb.callLogsTimeZone || DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE);
  const [pollMinutes, setPollMinutes] = React.useState(rb.pollIntervalMinutes);
  const [lookback, setLookback] = React.useState(rb.lookbackHours);
  const [minDuration, setMinDuration] = React.useState(rb.minimumDurationSeconds);
  const [validationMessage, setValidationMessage] = React.useState("");
  // Hide a stale "Connection successful/failed" notice once the user edits a
  // tested field (account id / token / timezone).
  const [editedSinceTest, setEditedSinceTest] = React.useState(false);

  React.useEffect(() => {
    if (testNotice) {
      setEditedSinceTest(false);
    }
  }, [testNotice]);

  // Runtime-supported IANA zones, plus the current value if it predates the
  // runtime's zone table, so a previously-saved zone stays selectable.
  const timeZoneOptions = React.useMemo(() => {
    const zones = listIanaTimeZones();
    const current = timeZone.trim();
    if (current && !zones.includes(current)) {
      return [current, ...zones];
    }
    return zones;
  }, [timeZone]);

  React.useEffect(() => {
    setEnabled(integration.ringba.ringbaApiSyncEnabled);
    setAccountIdState(integration.ringba.ringbaAccountId);
    setApiTokenState("");
    setTimeZoneState(integration.ringba.callLogsTimeZone || DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE);
    setPollMinutes(integration.ringba.pollIntervalMinutes);
    setLookback(integration.ringba.lookbackHours);
    setMinDuration(integration.ringba.minimumDurationSeconds);
    setValidationMessage("");
  }, [
    integration.id,
    integration.ringba.ringbaApiSyncEnabled,
    integration.ringba.ringbaAccountId,
    integration.ringba.callLogsTimeZone,
    integration.ringba.pollIntervalMinutes,
    integration.ringba.lookbackHours,
    integration.ringba.minimumDurationSeconds,
  ]);

  const setAccountId = React.useCallback((value: string) => {
    setAccountIdState(value);
    setEditedSinceTest(true);
  }, []);
  const setApiToken = React.useCallback((value: string) => {
    setApiTokenState(value);
    setEditedSinceTest(true);
  }, []);
  const setTimeZone = React.useCallback((value: string) => {
    setTimeZoneState(value);
    setEditedSinceTest(true);
  }, []);

  const buildSaveInput = React.useCallback((): RingbaApiSyncFormInput | null => {
    const nextAccount = accountId.trim();
    const nextTz = timeZone.trim() || DEFAULT_RINGBA_CALL_LOGS_TIME_ZONE;
    const nextPoll = Math.round(Number(pollMinutes));
    const nextLookback = Math.round(Number(lookback));

    if (enabled) {
      if (!nextAccount) {
        setValidationMessage("Ringba account id is required when API sync is enabled.");
        return null;
      }
      if (!integration.ringba.apiTokenConfigured && !apiToken.trim()) {
        setValidationMessage("API access token is required when enabling sync (paste the token from Ringba).");
        return null;
      }
    }

    if (!Number.isFinite(nextPoll) || nextPoll < RINGBA_API_POLL_INTERVAL_MIN_MINUTES) {
      setValidationMessage(
        `Poll interval must be between ${RINGBA_API_POLL_INTERVAL_MIN_MINUTES} and ${RINGBA_API_POLL_INTERVAL_MAX_MINUTES} minutes.`
      );
      return null;
    }

    if (!Number.isFinite(nextLookback) || nextLookback < 1) {
      setValidationMessage("Lookback hours must be at least 1.");
      return null;
    }

    const nextMinDuration = Math.round(Number(minDuration));
    if (!Number.isFinite(nextMinDuration) || nextMinDuration < 0) {
      setValidationMessage("Minimum duration must be 0 or greater.");
      return null;
    }

    setValidationMessage("");
    return {
      ringbaApiSyncEnabled: enabled,
      ringbaAccountId: nextAccount,
      apiAccessToken: apiToken.trim(),
      callLogsTimeZone: nextTz,
      pollIntervalMinutes: nextPoll,
      lookbackHours: nextLookback,
      minimumDurationSeconds: nextMinDuration,
    };
  }, [accountId, apiToken, enabled, integration.ringba.apiTokenConfigured, lookback, minDuration, pollMinutes, timeZone]);

  const testInput = React.useCallback(
    (): RingbaConnectionTestInput => ({
      ringbaAccountId: accountId.trim(),
      apiAccessToken: apiToken.trim(),
      callLogsTimeZone: timeZone.trim(),
    }),
    [accountId, apiToken, timeZone]
  );

  return {
    enabled,
    accountId,
    apiToken,
    timeZone,
    pollMinutes,
    lookback,
    minDuration,
    timeZoneOptions,
    validationMessage,
    editedSinceTest,
    apiTokenConfigured: integration.ringba.apiTokenConfigured,
    setEnabled,
    setAccountId,
    setApiToken,
    setTimeZone,
    setPollMinutes,
    setLookback,
    setMinDuration,
    buildSaveInput,
    testInput,
  };
}
