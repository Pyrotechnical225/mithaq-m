# Get Stripe checkout working

Clicking Monthly/Yearly currently throws an error. The only key saved is a restricted key (`rk_...`), and the saved webhook secret does not look like a Stripe signing secret (`whsec_...`). So there are two likely causes to confirm and fix: the key lacks the permissions Checkout needs, and webhook confirmation would fail even if checkout succeeded.

## Step 1 — Diagnose with a real Stripe call

Add a temporary admin-only diagnostic that calls Stripe with the saved key and reports back exactly what Stripe says (key type, mode test/live, and the error code/message from a Checkout Session attempt). This replaces guessing: Stripe returns a precise message when a restricted key is missing a permission.

## Step 2 — Fix based on what Stripe reports

- **Missing permissions on the restricted key** — you grant write access to Checkout Sessions, Billing Portal Sessions and Prices/Products, plus read on Subscriptions and Customers, in Stripe (Developers → API keys → edit the restricted key). If you prefer, saving a full secret key (`sk_test_...`) instead removes this class of problem entirely.
- **Key rejected / wrong mode** — re-save the key.
- **Any other Stripe error** — fixed in the request we send (for example switching from inline `price_data` to pre-created Prices if the restricted key cannot create products on the fly).

## Step 3 — Make failures readable instead of raw

Right now a Stripe failure surfaces as a raw provider dump. Change checkout so that:

- The membership page shows a plain-language reason ("payments not connected", "payment setup incomplete — contact support") and keeps the full detail in server logs only.
- Admins (your account) additionally see the underlying Stripe message, so you can self-diagnose without me.

## Step 4 — Webhook secret and end-to-end verification

- Confirm the webhook signing secret. In Stripe → Developers → Webhooks, the endpoint must point at `https://mithaq-m.lovable.app/api/public/stripe-webhook` with events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`; the signing secret starts with `whsec_`. If the stored value is not that, you re-save it via the secure form.
- Add a fallback so membership activates even if a webhook is delayed: on returning to `/membership?checkout=success`, the app verifies the session with Stripe directly and syncs the subscription row. This makes the paid flow reliable rather than webhook-dependent.
- Then run a test-mode purchase with card `4242 4242 4242 4242` and confirm the dashboard's matches section unlocks.

## Technical notes

- `src/lib/membership.server.ts` — richer error typing from `stripeCall`, key-mode detection, new `retrieveCheckoutSession`.
- `src/lib/membership.functions.ts` — new `diagnoseStripe` (admin-only) and `confirmCheckout` server functions; sanitised error messages.
- `src/routes/_authenticated/membership.tsx` — friendly error display, admin diagnostic panel, post-checkout confirmation on `?checkout=success`.
- Webhook route unchanged apart from reusing the shared sync helper.
