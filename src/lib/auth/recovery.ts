export interface RecoveryParams {
  code: string;
  tokenHash: string;
  type: string;
  error: string;
  errorDescription: string;
  hasHashTokens: boolean;
  hasRecoveryContext: boolean;
}

function readHashParams(url: URL) {
  const hashValue = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  return new URLSearchParams(hashValue);
}

export function buildRecoveryRedirectUrl(currentUrl: URL) {
  return new URL("/reset-password", currentUrl).toString();
}

export function parseRecoveryParams(input: string | URL): RecoveryParams {
  const url = input instanceof URL ? input : new URL(input);
  const hashParams = readHashParams(url);

  const code = url.searchParams.get("code") ?? "";
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type") ?? "";
  const error = url.searchParams.get("error") ?? hashParams.get("error") ?? "";
  const errorDescription =
    url.searchParams.get("error_description") ?? hashParams.get("error_description") ?? "";
  const hasHashTokens =
    (hashParams.get("access_token") ?? "").length > 0 ||
    (hashParams.get("refresh_token") ?? "").length > 0;

  return {
    code,
    tokenHash,
    type,
    error,
    errorDescription,
    hasHashTokens,
    hasRecoveryContext:
      code.length > 0 ||
      tokenHash.length > 0 ||
      hasHashTokens ||
      type === "recovery",
  };
}

export function normalizeResetRequestErrorMessage(message: string) {
  const normalizedMessage = message.trim().toLowerCase();

  if (normalizedMessage.includes("rate limit")) {
    return "Too many reset requests were sent recently. Wait a moment, then try again.";
  }

  if (normalizedMessage.includes("network")) {
    return "We couldn’t reach the authentication service. Try again in a moment.";
  }

  return "We couldn’t send a reset link right now. Please try again.";
}

export function normalizeRecoveryErrorMessage(message: string) {
  const normalizedMessage = message.trim().toLowerCase();

  if (normalizedMessage.includes("expired")) {
    return "This reset link has expired. Request a new password reset email to continue.";
  }

  if (normalizedMessage.includes("invalid")) {
    return "This reset link is no longer valid. Request a new password reset email and try again.";
  }

  if (normalizedMessage.includes("otp")) {
    return "This reset link could not be verified. Request a new password reset email and try again.";
  }

  if (normalizedMessage.includes("session")) {
    return "We couldn’t establish a recovery session from this link. Request a new password reset email.";
  }

  return "We couldn’t verify this reset link. Request a new password reset email to continue.";
}
