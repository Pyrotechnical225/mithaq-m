-- Supabase Auth "Send Email" hook that delivers auth emails through Resend.
--
-- Supabase calls this function instead of sending email itself (enable it in
-- Dashboard -> Authentication -> Hooks -> Send Email -> Postgres ->
-- public.send_auth_email_via_resend). The email design lives in Resend as
-- published templates, so copy changes are made in Resend, not here:
--   mithaq-verify-email    sign-up verification
--   mithaq-reset-password  password reset
--   mithaq-account-link    magic link, invite, email change, reauthentication
--
-- Links go straight to /auth/callback with a token hash, so they work on any
-- device (the callback calls supabase.auth.verifyOtp).
--
-- The Resend API key is read from Vault (secret name: resend_api_key). It is a
-- send-only key restricted to the mithaq.uk domain.
--
-- Delivery is queued with pg_net so a slow Resend response can never make
-- sign-up time out. Failed requests are visible in net._http_response and in
-- the Resend dashboard logs.

create extension if not exists pg_net with schema extensions;

create or replace function public.send_auth_email_via_resend(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  callback_url constant text := 'https://www.mithaq.uk/auth/callback';
  sender constant text := 'Mithaq <no-reply@mithaq.uk>';
  api_key text;
  action text := event -> 'email_data' ->> 'email_action_type';
  token_hash text := event -> 'email_data' ->> 'token_hash';
  token_hash_new text := event -> 'email_data' ->> 'token_hash_new';
  token text := event -> 'email_data' ->> 'token';
  redirect_to text := coalesce(event -> 'email_data' ->> 'redirect_to', '');
  user_email text := event -> 'user' ->> 'email';
  new_email text := event -> 'user' ->> 'new_email';
  next_path text;
  messages jsonb := '[]'::jsonb;
  message jsonb;
begin
  select decrypted_secret into api_key
  from vault.decrypted_secrets
  where name = 'resend_api_key'
  limit 1;

  if api_key is null or api_key = '' then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 500, 'message', 'Email delivery is not configured.')
    );
  end if;

  -- Keep a validated same-site destination (e.g. /survey) from the app's
  -- emailRedirectTo. The callback page re-validates it with safeRelativePath.
  next_path := substring(redirect_to from '^https://www\.mithaq\.uk/auth/callback\?(?:.*&)?next=(%2F[^&#]*)');

  if action = 'signup' then
    messages := jsonb_build_array(jsonb_build_object(
      'to', user_email,
      'subject', 'Verify your email — Mithaq',
      'template', 'mithaq-verify-email',
      'variables', jsonb_build_object(
        'ACTION_URL', callback_url || '?token_hash=' || token_hash || '&type=email'
          || coalesce('&next=' || next_path, '')
      )
    ));
  elsif action = 'recovery' then
    messages := jsonb_build_array(jsonb_build_object(
      'to', user_email,
      'subject', 'Reset your password — Mithaq',
      'template', 'mithaq-reset-password',
      'variables', jsonb_build_object(
        'ACTION_URL', callback_url || '?token_hash=' || token_hash
          || '&type=recovery&next=%2Freset-password'
      )
    ));
  elsif action = 'magiclink' then
    messages := jsonb_build_array(jsonb_build_object(
      'to', user_email,
      'subject', 'Your sign-in link — Mithaq',
      'template', 'mithaq-account-link',
      'variables', jsonb_build_object(
        'ACTION_URL', callback_url || '?token_hash=' || token_hash || '&type=magiclink'
          || coalesce('&next=' || next_path, ''),
        'HEADING', 'Sign in to Mithaq',
        'INTRO', 'Use the button below to sign in to your Mithaq account.',
        'BUTTON_LABEL', 'Sign in'
      )
    ));
  elsif action = 'invite' then
    messages := jsonb_build_array(jsonb_build_object(
      'to', user_email,
      'subject', 'You''re invited to Mithaq',
      'template', 'mithaq-account-link',
      'variables', jsonb_build_object(
        'ACTION_URL', callback_url || '?token_hash=' || token_hash || '&type=invite',
        'HEADING', 'You''re invited to Mithaq',
        'INTRO', 'You have been invited to create a Mithaq account. Use the button below to accept.',
        'BUTTON_LABEL', 'Accept invitation'
      )
    ));
  elsif action = 'email_change' then
    -- With secure email change Supabase sends two links. For backwards
    -- compatibility token_hash_new belongs to the current address and
    -- token_hash to the new one.
    if coalesce(token_hash_new, '') <> '' and coalesce(user_email, '') <> '' then
      messages := messages || jsonb_build_array(jsonb_build_object(
        'to', user_email,
        'subject', 'Confirm your email change — Mithaq',
        'template', 'mithaq-account-link',
        'variables', jsonb_build_object(
          'ACTION_URL', callback_url || '?token_hash=' || token_hash_new || '&type=email_change',
          'HEADING', 'Confirm your email change',
          'INTRO', 'Confirm that you want to change the email address on your Mithaq account to ' || coalesce(new_email, 'a new address') || '.',
          'BUTTON_LABEL', 'Confirm change'
        )
      ));
    end if;
    if coalesce(token_hash, '') <> '' and coalesce(new_email, '') <> '' then
      messages := messages || jsonb_build_array(jsonb_build_object(
        'to', new_email,
        'subject', 'Confirm your new email — Mithaq',
        'template', 'mithaq-account-link',
        'variables', jsonb_build_object(
          'ACTION_URL', callback_url || '?token_hash=' || token_hash || '&type=email_change',
          'HEADING', 'Confirm your new email',
          'INTRO', 'Confirm this address to finish updating the email on your Mithaq account.',
          'BUTTON_LABEL', 'Confirm new email'
        )
      ));
    end if;
  elsif action = 'reauthentication' then
    messages := jsonb_build_array(jsonb_build_object(
      'to', user_email,
      'subject', 'Your Mithaq security code',
      'template', 'mithaq-account-link',
      'variables', jsonb_build_object(
        'ACTION_URL', 'https://www.mithaq.uk',
        'HEADING', 'Your security code: ' || coalesce(token, ''),
        'INTRO', 'Enter this code on Mithaq to confirm it''s you. Never share it with anyone.',
        'BUTTON_LABEL', 'Open Mithaq'
      )
    ));
  else
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 400, 'message', 'Unsupported email type: ' || coalesce(action, 'none'))
    );
  end if;

  if jsonb_array_length(messages) = 0 or coalesce(token_hash, token, '') = '' then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 400, 'message', 'Missing email address or token.')
    );
  end if;

  for message in select * from jsonb_array_elements(messages) loop
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || api_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'from', sender,
        'to', jsonb_build_array(message ->> 'to'),
        'subject', message ->> 'subject',
        'template', jsonb_build_object(
          'id', message ->> 'template',
          'variables', message -> 'variables'
        ),
        'tags', jsonb_build_array(jsonb_build_object('name', 'auth_email', 'value', action))
      ),
      timeout_milliseconds := 10000
    );
  end loop;

  return '{}'::jsonb;
exception
  when others then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 500, 'message', 'We could not send the email. Please try again.')
    );
end;
$$;

-- Only Supabase Auth may call the hook.
revoke all on function public.send_auth_email_via_resend(jsonb) from public, anon, authenticated;
grant execute on function public.send_auth_email_via_resend(jsonb) to supabase_auth_admin;
