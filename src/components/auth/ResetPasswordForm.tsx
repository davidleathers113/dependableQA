import * as React from "react";
import { Eye, EyeOff, LoaderCircle, TriangleAlert } from "lucide-react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getBrowserSupabase } from "../../lib/supabase/browser-client";
import { normalizeRecoveryErrorMessage, parseRecoveryParams } from "../../lib/auth/recovery";

const passwordFieldClassName =
  "block h-12 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 pr-12 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-300/60 focus:outline-none focus:ring-2 focus:ring-emerald-300/20";

function getPasswordError(value: string) {
  if (!value) {
    return "New password is required.";
  }

  if (value.length < 8) {
    return "Use at least 8 characters.";
  }

  return "";
}

function getConfirmationError(password: string, confirmation: string) {
  if (!confirmation) {
    return "Confirm your new password.";
  }

  if (password !== confirmation) {
    return "Passwords do not match yet.";
  }

  return "";
}

export default function ResetPasswordForm() {
  const [password, setPassword] = React.useState("");
  const [passwordConfirmation, setPasswordConfirmation] = React.useState("");
  const [passwordTouched, setPasswordTouched] = React.useState(false);
  const [passwordConfirmationTouched, setPasswordConfirmationTouched] = React.useState(false);
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [confirmationVisible, setConfirmationVisible] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState("");
  const [passwordConfirmationError, setPasswordConfirmationError] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [statusMessage, setStatusMessage] = React.useState("Checking your reset link...");
  const [isRecoveryReady, setIsRecoveryReady] = React.useState(false);
  const [isCheckingRecovery, setIsCheckingRecovery] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    const supabase = getBrowserSupabase();
    const recoveryParams = parseRecoveryParams(window.location.href);
    const basePath = window.location.pathname;

    const clearSensitiveUrl = () => {
      if (window.location.search || window.location.hash) {
        window.history.replaceState({}, "", basePath);
      }
    };

    const setInvalidState = (message: string) => {
      if (!isMounted) {
        return;
      }

      clearSensitiveUrl();
      setIsRecoveryReady(false);
      setIsCheckingRecovery(false);
      setStatusMessage(message);
    };

    const setReadyState = () => {
      if (!isMounted) {
        return;
      }

      clearSensitiveUrl();
      setIsRecoveryReady(true);
      setIsCheckingRecovery(false);
      setFormError("");
      setStatusMessage("");
    };

    const waitForSession = async () => {
      if (!recoveryParams.hasHashTokens) {
        return;
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 200);
      });
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) {
        return;
      }

      if (event === "PASSWORD_RECOVERY" && session) {
        setReadyState();
      }
    });

    const initialize = async () => {
      if (recoveryParams.errorDescription || recoveryParams.error) {
        setInvalidState(
          normalizeRecoveryErrorMessage(
            recoveryParams.errorDescription || recoveryParams.error
          )
        );
        return;
      }

      if (!recoveryParams.hasRecoveryContext) {
        setInvalidState(
          "This reset link is missing or incomplete. Request a new password reset email to continue."
        );
        return;
      }

      if (recoveryParams.tokenHash && recoveryParams.type && recoveryParams.type !== "recovery") {
        setInvalidState(
          "This link can’t be used to reset a password. Request a new password reset email."
        );
        return;
      }

      if (recoveryParams.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(recoveryParams.code);

        if (error) {
          setInvalidState(normalizeRecoveryErrorMessage(error.message));
          return;
        }
      } else if (recoveryParams.tokenHash && recoveryParams.type === "recovery") {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: recoveryParams.tokenHash,
          type: recoveryParams.type as EmailOtpType,
        });

        if (error) {
          setInvalidState(normalizeRecoveryErrorMessage(error.message));
          return;
        }
      }

      await waitForSession();

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setReadyState();
        return;
      }

      setInvalidState(
        "This reset link is no longer valid. Request a new password reset email and try again."
      );
    };

    initialize().catch((error) => {
      const message = error instanceof Error ? error.message : "Unable to validate reset link.";
      setInvalidState(normalizeRecoveryErrorMessage(message));
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (passwordTouched) {
      setPasswordError(getPasswordError(password));
    }

    if (passwordConfirmationTouched) {
      setPasswordConfirmationError(getConfirmationError(password, passwordConfirmation));
    }
  }, [password, passwordConfirmation, passwordTouched, passwordConfirmationTouched]);

  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();

    setPasswordTouched(true);
    setPasswordConfirmationTouched(true);
    setFormError("");

    const nextPasswordError = getPasswordError(password);
    const nextConfirmationError = getConfirmationError(password, passwordConfirmation);

    setPasswordError(nextPasswordError);
    setPasswordConfirmationError(nextConfirmationError);

    if (nextPasswordError || nextConfirmationError || !isRecoveryReady) {
      return;
    }

    setIsSubmitting(true);
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setFormError(normalizeRecoveryErrorMessage(error.message));
      setIsSubmitting(false);
      return;
    }

    await supabase.auth.signOut();
    window.location.assign("/login?reset=success");
  };

  if (isCheckingRecovery) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm text-slate-300">
        <div className="flex items-center gap-3">
          <LoaderCircle className="h-4 w-4 animate-spin text-emerald-300" aria-hidden="true" />
          <p>{statusMessage}</p>
        </div>
      </div>
    );
  }

  if (!isRecoveryReady) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-4 text-sm text-rose-100">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{statusMessage}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href="/forgot-password"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-200"
          >
            Request a new link
          </a>
          <a
            href="/login"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/80 px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-slate-500 hover:bg-slate-800"
          >
            Back to login
          </a>
        </div>
      </div>
    );
  }

  const passwordHintId = passwordError ? "reset-password-error" : "reset-password-help";
  const confirmationHintId = passwordConfirmationError
    ? "reset-confirmation-error"
    : "reset-confirmation-help";

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {formError ? (
        <div
          className="flex items-start gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
          aria-live="polite"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{formError}</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-slate-200">
          New password
        </label>
        <div className="relative">
          <input
            id="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="new-password"
            className={passwordFieldClassName}
            value={password}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordHintId}
            onBlur={() => {
              setPasswordTouched(true);
              setPasswordError(getPasswordError(password));
            }}
            onChange={(event) => {
              setPassword(event.target.value);
              setFormError("");
            }}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-slate-400 transition-colors hover:text-white"
            aria-label={passwordVisible ? "Hide new password" : "Show new password"}
            onClick={() => setPasswordVisible((currentValue) => !currentValue)}
          >
            {passwordVisible ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <p
          id={passwordHintId}
          className={`text-sm ${passwordError ? "text-rose-300" : "text-slate-500"}`}
          aria-live="polite"
        >
          {passwordError || "Use at least 8 characters."}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="password-confirmation" className="text-sm font-medium text-slate-200">
          Confirm new password
        </label>
        <div className="relative">
          <input
            id="password-confirmation"
            type={confirmationVisible ? "text" : "password"}
            autoComplete="new-password"
            className={passwordFieldClassName}
            value={passwordConfirmation}
            aria-invalid={passwordConfirmationError ? true : undefined}
            aria-describedby={confirmationHintId}
            onBlur={() => {
              setPasswordConfirmationTouched(true);
              setPasswordConfirmationError(
                getConfirmationError(password, passwordConfirmation)
              );
            }}
            onChange={(event) => {
              setPasswordConfirmation(event.target.value);
              setFormError("");
            }}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-slate-400 transition-colors hover:text-white"
            aria-label={confirmationVisible ? "Hide confirmation password" : "Show confirmation password"}
            onClick={() => setConfirmationVisible((currentValue) => !currentValue)}
          >
            {confirmationVisible ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <p
          id={confirmationHintId}
          className={`text-sm ${passwordConfirmationError ? "text-rose-300" : "text-slate-500"}`}
          aria-live="polite"
        >
          {passwordConfirmationError || "Enter the same password again to confirm it."}
        </p>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300/40 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
      >
        {isSubmitting ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Updating password...
          </>
        ) : (
          "Update password"
        )}
      </button>
    </form>
  );
}
