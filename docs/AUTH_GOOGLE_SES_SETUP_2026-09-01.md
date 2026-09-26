# Mithaq auth, Google and SES setup

> **Update, September 2026:** Supabase Auth emails are designed in and sent by **Resend**.
>
> - Designs: published Resend templates `mithaq-verify-email`, `mithaq-reset-password` and
>   `mithaq-account-link` (source copies in `supabase/resend-templates/`). Edit copy in Resend and
>   re-publish; no deploy needed.
> - Sending: the Postgres function `public.send_auth_email_via_resend`
>   (`supabase/migrations/20260926090000_resend_auth_email_hook.sql`) is Supabase's **Send Email
>   hook**. It builds token-hash links to `https://www.mithaq.uk/auth/callback`, so they work on any
>   device, and posts to the Resend API with a send-only key stored in Vault as `resend_api_key`.
> - Enable it in Supabase → Authentication → Hooks → Send Email → Postgres →
>   `public.send_auth_email_via_resend`. While the hook is off, Supabase falls back to Resend SMTP
>   with the templates in `supabase/templates/`.
> - Troubleshooting: `select * from net._http_response order by created desc` shows Resend's reply
>   to each send; the Resend dashboard shows delivery.
>
> The SES SMTP section below is kept for history only.

## What is implemented in the app

- Email sign-up now uses the canonical callback `https://www.mithaq.uk/auth/callback`.
- Pending sign-ups are sent to `/verify-email` even though Supabase correctly returns no session before confirmation.
- The callback exchanges the PKCE code (or verifies a token hash), creates the browser session, shows a success state, then opens the dashboard.
- Unconfirmed sign-ins return to the verification screen instead of exposing a raw provider error.
- Google OAuth uses the same callback and preserves only a validated same-site `next` path.
- The branded responsive confirmation template is at `supabase/templates/confirmation.html`.

## Supabase URL configuration

At the time of this review, the hosted project still had `http://localhost:3000` as its Site URL and no redirect allow-list entries. Configure:

- Site URL: `https://www.mithaq.uk`
- Redirect URL: `https://www.mithaq.uk/auth/callback`
- Redirect URL: `https://meet-haq.vercel.app/auth/callback`
- Redirect URL for owned Vercel previews: `https://*-m46-1241.vercel.app/**`

Production should use exact paths wherever possible. The preview wildcard is restricted to this Vercel account slug.

## Google provider

Create a Web application OAuth client in the Google Cloud project for Mithaq.

- Authorized JavaScript origin: `https://www.mithaq.uk`
- Authorized redirect URI: `https://oxhpvawqmrdvkrlntswl.supabase.co/auth/v1/callback`
- Required scopes: `openid`, `userinfo.email`, `userinfo.profile`

Save the generated Client ID and Client Secret only in Supabase Authentication > Sign In / Providers > Google. Never put the client secret in a `VITE_*` variable or the repository.

After the provider is working, set `VITE_ENABLE_GOOGLE_AUTH=true` and `VITE_PUBLIC_SITE_URL=https://www.mithaq.uk` for the Vercel production environment, then redeploy.

## Amazon SES for Supabase Auth email

Supabase Auth should continue generating and validating one-time verification links. Amazon SES is the SMTP transport only.

Create SES SMTP credentials in `eu-north-1`, then configure Supabase Authentication > Emails > SMTP:

- Sender email: `no-reply@mithaq.uk`
- Sender name: `Mithaq`
- Host: `email-smtp.eu-north-1.amazonaws.com`
- Port: `587`
- Username: generated SES SMTP username
- Password: generated SES SMTP password

Use the subject `Verify your email — Mithaq` and paste the HTML from `supabase/templates/confirmation.html` into the Confirm sign-up template.

The existing Vercel OIDC IAM role for application notifications is deliberately separate: Supabase hosted Auth needs SMTP credentials and cannot assume that Vercel role. Do not commit or expose the SMTP credentials.

AWS SES is still in the Stockholm sandbox while production-access case `178821170800160` is pending. In the sandbox, confirmation email can only be tested with SES-verified recipient addresses. Do not treat general member delivery as live until AWS approves production access and an unverified external recipient completes an end-to-end sign-up test.
