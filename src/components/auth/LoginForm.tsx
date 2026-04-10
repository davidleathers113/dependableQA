import * as React from "react";
import { Eye, EyeOff, LoaderCircle, TriangleAlert } from "lucide-react";

interface LoginFormProps {
  action: string;
  initialEmail?: string;
  serverError?: string;
}

const fieldClassName =
  "block h-12 w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 pr-12 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-300/60 focus:outline-none focus:ring-2 focus:ring-emerald-300/20";

function getFieldError(input: HTMLInputElement, label: string) {
  if (input.validity.valueMissing) {
    return `${label} is required.`;
  }

  if (input.validity.typeMismatch) {
    return "Enter a valid work email address.";
  }

  return "";
}

export default function LoginForm({
  action,
  initialEmail = "",
  serverError = "",
}: LoginFormProps) {
  const emailRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  const [email, setEmail] = React.useState(initialEmail);
  const [password, setPassword] = React.useState("");
  const [emailTouched, setEmailTouched] = React.useState(false);
  const [passwordTouched, setPasswordTouched] = React.useState(false);
  const [emailError, setEmailError] = React.useState("");
  const [passwordError, setPasswordError] = React.useState("");
  const [formError, setFormError] = React.useState(serverError);
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isFormValid, setIsFormValid] = React.useState(false);

  const syncFormValidity = React.useCallback(() => {
    const emailInput = emailRef.current;
    const passwordInput = passwordRef.current;

    if (!emailInput || !passwordInput) {
      setIsFormValid(false);
      return;
    }

    if (emailTouched) {
      setEmailError(getFieldError(emailInput, "Email"));
    }

    if (passwordTouched) {
      setPasswordError(getFieldError(passwordInput, "Password"));
    }

    setIsFormValid(emailInput.checkValidity() && passwordInput.checkValidity());
  }, [emailTouched, passwordTouched]);

  React.useEffect(() => {
    setFormError(serverError);
    setIsSubmitting(false);
  }, [serverError]);

  React.useEffect(() => {
    syncFormValidity();
  }, [email, password, syncFormValidity]);

  const handleEmailBlur = () => {
    const emailInput = emailRef.current;

    setEmailTouched(true);
    if (emailInput) {
      setEmailError(getFieldError(emailInput, "Email"));
    }
  };

  const handlePasswordBlur = () => {
    const passwordInput = passwordRef.current;

    setPasswordTouched(true);
    if (passwordInput) {
      setPasswordError(getFieldError(passwordInput, "Password"));
    }
  };

  const handleSubmit = (event: { preventDefault: () => void }) => {
    const emailInput = emailRef.current;
    const passwordInput = passwordRef.current;

    setEmailTouched(true);
    setPasswordTouched(true);
    setFormError("");

    if (!emailInput || !passwordInput) {
      event.preventDefault();
      setIsSubmitting(false);
      return;
    }

    const nextEmailError = getFieldError(emailInput, "Email");
    const nextPasswordError = getFieldError(passwordInput, "Password");

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    if (nextEmailError || nextPasswordError) {
      event.preventDefault();
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
  };

  const emailHintId = emailError ? "login-email-error" : "login-email-help";
  const passwordHintId = passwordError ? "login-password-error" : "login-password-help";

  return (
    <form method="POST" action={action} noValidate className="space-y-5" onSubmit={handleSubmit}>
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
        <label htmlFor="email" className="text-sm font-medium text-slate-200">
          Email
        </label>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="you@company.com"
          className={fieldClassName}
          value={email}
          required
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailHintId}
          onBlur={handleEmailBlur}
          onChange={(event) => {
            setEmail(event.target.value);
            setFormError("");
          }}
        />
        <p
          id={emailHintId}
          className={`text-sm ${emailError ? "text-rose-300" : "text-slate-500"}`}
          aria-live="polite"
        >
          {emailError || "Use the email tied to your workspace."}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="password" className="text-sm font-medium text-slate-200">
            Password
          </label>
          <a
            href="/forgot-password"
            className="text-sm font-medium text-slate-400 transition-colors hover:text-white"
          >
            Forgot password?
          </a>
        </div>

        <div className="relative">
          <input
            ref={passwordRef}
            id="password"
            name="password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="current-password"
            className={fieldClassName}
            value={password}
            required
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordHintId}
            onBlur={handlePasswordBlur}
            onChange={(event) => {
              setPassword(event.target.value);
              setFormError("");
            }}
          />

          <button
            type="button"
            className="absolute inset-y-0 right-3 inline-flex items-center justify-center text-slate-400 transition-colors hover:text-white"
            aria-label={passwordVisible ? "Hide password" : "Show password"}
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
          {passwordError || "Your password is never stored in the browser."}
        </p>
      </div>

      <button
        type="submit"
        disabled={!isFormValid || isSubmitting}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-300/40 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
      >
        {isSubmitting ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Logging in...
          </>
        ) : (
          "Log in"
        )}
      </button>

      <p className="text-center text-sm text-slate-400">
        Don&apos;t have an account?{" "}
        <a href="/signup" className="font-medium text-white hover:text-emerald-300">
          Sign up
        </a>
      </p>
    </form>
  );
}
