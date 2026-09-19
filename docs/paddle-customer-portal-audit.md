# Paddle Customer Portal — repository audit (2026-09-19)

Prompted by Issue #305's follow-up: a human reviewing a real Production
receipt/invoice email did not see an obvious Paddle customer-portal link, and
asked whether this repository has (or can safely add) any customer-portal
link/config/API support.

## Finding: this repository has no customer-portal integration at all

A full search of `src/`, `server/`, and `docs/` found:

- No portal URL, `customer-portal`, or `portal-session` string anywhere in
  application code.
- No Paddle **API key** (a secret credential, distinct from the webhook
  signing secrets and client-side tokens this repo already uses) in
  `server/config.example.php`, `Config.php`, or anywhere else. Every existing
  Paddle-related secret in this repo (`PADDLE_SANDBOX_WEBHOOK_SECRET`,
  `PADDLE_LIVE_WEBHOOK_SECRET`, the client-side `VITE_PADDLE_*` tokens) is
  scoped to checkout/webhook verification only, never to Paddle's general
  server-side REST API.
- `RefundPage.tsx` and `SupportPage.tsx` (the only two pages that discuss
  purchase-related support) do not claim or link to any customer portal
  today — there is no stale/incorrect claim to fix.

This is expected: this app was built around the server-authoritative
entitlement chain (purchase intent → opaque `purchase_ref` → Paddle
`custom_data` → signature-verified webhook → entitlement), which never
required calling Paddle's general REST API. Portal access is a separate
Paddle feature this repo simply never wired up.

## What Paddle provides today (per the requester's own account of current Paddle docs)

- Paddle's hosted Customer Portal is enabled by default and supports
  one-time-purchase payment history/invoices.
- A seller can link to it in two ways: (a) the **general** portal (Paddle
  emails a transaction-specific/authenticated link as part of its own
  receipt), or (b) a **short-lived authenticated portal session** created
  server-side via Paddle's API for a specific customer.
- There is no publicly documented static/generic portal URL a seller can
  hardcode that works for an arbitrary customer without one of those two
  Paddle-issued links — access is inherently tied to a specific customer
  identity.

This repository cannot independently confirm current Paddle documentation
(no live web access in this session); the above reflects what was reported
by the human requester from the current Paddle docs, not a fresh fetch by
this audit.

## Why no AI-only implementation is safe right now

Option (a) (rely on Paddle's own receipt-email link) requires no repository
change — it is entirely controlled by Paddle's receipt template and Paddle
account/dashboard settings, which this repo does not generate, render, or
control. If the link is missing from the actual received email, that is a
Paddle account/dashboard question, not a code gap here.

Option (b) (server-generated authenticated portal sessions) would require:

- Creating a **new Paddle API key** with server-side REST API access — a new
  Production secret/credential this repo does not currently hold, request,
  or have a config slot for.
- Granting that key **customer data read access**, since a portal session is
  scoped to a specific customer.
- Adding a new authenticated server endpoint that calls Paddle's API using
  that key.

Per `docs/operational-gates.md`'s Cost Gate/Human fast-path policy, creating
a new Production secret/credential and granting a new external API
permission is explicitly a Human Gate, not an AI-only action — independent
of whether the resulting feature would itself be free. This audit does not
create, request, or use any such key, and does not implement a portal-link
feature.

## Conclusion / disposition

- **AI-only work completed:** confirmed there is no existing customer-portal
  link/config/API support in this repository, and no stale/incorrect portal
  claim anywhere in the current UI or docs that needs correcting.
- **Human Gate (not implemented):** any authenticated Paddle Customer Portal
  session feature, because it requires creating and holding a new
  Production-scoped Paddle API key. If a human wants this feature, the
  smallest safe next step is: create a least-privilege Paddle API key scoped
  to customer-portal sessions only, add it to `server/config.php` (never to
  this repo), and then request a bounded AI-only PR to add one
  authenticated server endpoint plus one "Manage purchase" link in
  `AccountPage.tsx`/`SupportPage.tsx`.
