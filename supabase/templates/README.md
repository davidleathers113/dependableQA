# Supabase Auth Email Templates

These templates provide a branded DependableQA version of the standard Supabase auth emails.

The shared logo asset lives at `public/brand/dependableqa-logo.png` and the email templates reference it through `{{ .SiteURL }}/brand/dependableqa-logo.png`.

## Files

- `confirmation.html`: confirm signup email
- `recovery.html`: forgot password / password reset email
- `magic_link.html`: passwordless sign-in email
- `invite.html`: workspace invitation email
- `email_change.html`: confirm new email address
- `reauthentication.html`: one-time verification code email

## Local Supabase

The repo includes `supabase/config.toml` entries that point each auth flow at its matching HTML file:

- `auth.email.template.confirmation`
- `auth.email.template.recovery`
- `auth.email.template.magic_link`
- `auth.email.template.invite`
- `auth.email.template.email_change`
- `auth.email.template.reauthentication`

If you run Supabase locally, restart the local stack after updating template HTML so the changes are picked up.

## Hosted Supabase Dashboard

Hosted Supabase projects do not read these files automatically. To apply the same templates in the dashboard:

1. Open `Authentication` -> `Email Templates` in the Supabase dashboard.
2. Select the matching template for the flow you want to update.
3. Copy the HTML from the corresponding file in `supabase/templates/`.
4. Copy the subject line from `supabase/config.toml`.
5. Save the dashboard template and send a test email.

## Flow Notes

- `confirmation.html` uses `{{ .ConfirmationURL }}` so signup confirmation keeps the redirect behavior already set by `src/pages/signup.astro`.
- `recovery.html` uses `{{ .ConfirmationURL }}` so password recovery keeps the redirect behavior already set by `src/pages/forgot-password.astro` and `src/lib/auth/recovery.ts`.
- `reauthentication.html` is token-based and intentionally renders the one-time code with `{{ .Token }}` instead of a CTA button.

## Supported Supabase Variables Used

- `{{ .ConfirmationURL }}`
- `{{ .NewEmail }}`
- `{{ .Token }}`
