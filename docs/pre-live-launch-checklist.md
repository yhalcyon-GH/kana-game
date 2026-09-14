# Pre-Live Launch Checklist

This is the human-facing checklist for cutting KanaGame/Tamamizu over from
Paddle Sandbox + dev/staging to Paddle Live + Production. It exists because
several of the required steps are operations only a human can perform
(Production server access, Paddle Dashboard, real credentials) and must not
be attempted by an AI session. No secret values are recorded here — only
whether a step is done and where to verify it.

Each item is tagged:

- **AI-verifiable** — an AI session can check repo state/tests for this.
- **Human required** — requires Production/XServer access, the Paddle
  Dashboard, or a credential, and must be done by a human.
- **Live operation** — directly touches real money, real Paddle Live
  config, or real customer data. Human-only, and should be done last.

## 1. Repository state

- [ ] **AI-verifiable** — Record current `main` SHA before cutover and
      confirm it matches the last reviewed/merged commit.
- [ ] **AI-verifiable** — `npm run verify` (test + lint + build + `git diff
      --check`) passes on `main`.
- [ ] **AI-verifiable** — `php server/tests/run-tests.php` passes on `main`.
- [ ] **AI-verifiable** — MariaDB concurrency workflow (GitHub Actions)
      passes on `main`.

## 2. Database

- [ ] **Human required** — Take a Production DB backup immediately before
      migration/cutover.
- [ ] **Human required** — Confirm which migrations (if any) still need to
      run against Production, and run them only after the backup above.

## 3. Production server deploy (XServer)

- [ ] **Human required** — Deploy the reviewed `main` SHA to the Production
      XServer document root.
- [ ] **Human required** — Confirm `config.php` (or equivalent env source)
      on Production has all required keys present. Do not display or paste
      key values into any AI session or doc — only confirm presence/absence.
- [ ] **Human required** — Confirm `DEV_HARNESS_ENABLED` is **not** set to
      `true` on Production (see `server/auth/request-link.php` — dev-harness
      mode takes priority over the real mailer and must never be active on
      Production).
- [ ] **Human required** — Confirm a real mailer is actually configured on
      Production: `RESEND_API_KEY`, `MAGIC_LINK_FROM_EMAIL`, and
      `MAGIC_LINK_FROM_NAME` all present and non-empty. If any one of the
      three is missing, `request-link.php` silently falls back to a no-op
      mailer and logs `request-link: mailer_unconfigured` — treat that log
      line appearing on Production as a go-live blocker, not routine noise
      (see `docs/observability.md`).
- [ ] **Human required** — Confirm the real path `error_log` writes to on
      this XServer plan, and that it is being watched/rotated. (Not
      independently verifiable from the repo; do not guess a path.)
- [ ] **Human required** — Confirm CORS allowed-origins in Production config
      match the real Production frontend origin(s) only.
- [ ] **Human required** — Confirm session cookie settings (`Secure`,
      `HttpOnly`, `SameSite`) are correct for the real Production domain and
      that the cookie is actually being set/read in a real browser against
      Production.

## 4. Magic Link auth (end-to-end, real browser, Production)

- [ ] **Human required** — Request a magic link against the Production
      endpoint with a real inbox and confirm the email actually arrives.
- [ ] **Human required** — Click the link, confirm session cookie is set,
      confirm `auth/me` reflects the logged-in user.
- [ ] **Human required** — Confirm `auth/logout` clears the session.

## 5. Purchase / entitlement flow

- [ ] **AI-verifiable** — Purchase-intent, webhook signature verification,
      idempotency (duplicate event id), and out-of-order
      refund/adjustment-before-transaction handling are covered by
      automated tests on `main` (see `server/tests/` and
      `server/src/Purchase/PurchaseWebhookHandler.php`).
- [ ] **Human required** — Confirm Paddle environment consistency: the
      Production deployment's Paddle client token, price/product IDs, and
      webhook secret are all the **Live** set, not Sandbox, and that none of
      Sandbox and Live values are mixed.
- [ ] **Live operation** — Create/verify the Live product and price in the
      Paddle Dashboard.
- [ ] **Live operation** — Point the Paddle Live webhook destination at the
      real Production webhook URL and set the Live webhook secret in
      Production config (not in any repo file, not in any AI session).
- [ ] **Live operation** — Run one real low-value test purchase against
      Paddle Live, confirm the webhook is received, signature verifies,
      `entitlement-me` reflects the grant, and the in-app UI unlocks
      correctly.
- [ ] **Live operation** — Run one real refund against that test purchase,
      confirm the adjustment webhook revokes entitlement and that any
      locally-stored learning progress is retained per the intended
      refund-vs-progress policy (business decision, not a repo default to
      infer).
- [ ] **Human required** — Confirm the failed/cancelled checkout UX (user
      closes or cancels Paddle Checkout without completing) leaves the app
      in a sane, non-broken state.
- [ ] **Human required** — Confirm receipt/invoice/customer-portal access
      works as Paddle provides it (Paddle-hosted, not custom-built here
      unless the repo already implements a portal link).

## 6. Observability

- [ ] **AI-verifiable** — Stage-tagged webhook logging and the
      `mailer_unconfigured` warning are present on `main` (see
      `docs/observability.md`).
- [ ] **Human required** — Confirm Production logs are actually reachable
      (see error_log path item above) so these warnings are seen in
      practice, not just emitted.

## 7. Rollback / go-no-go

- [ ] **Human required** — Confirm the rollback plan: previous known-good
      deployed SHA, DB backup restore procedure, and the condition under
      which cutover would be aborted (e.g. any Live webhook signature
      failure, any entitlement mismatch during the test purchase).
- [ ] **Human required** — Go/no-go: only proceed to real customer traffic
      once every Live-operation item above has been completed successfully
      and rolled back cleanly at least once in a rehearsal, if practical.

## Notes

- Paddle Sandbox → Live cutover, real credential generation, real charges,
  real refunds, and any Paddle Dashboard/API changes are explicitly
  out of scope for AI-only sessions and must be done by a human following
  this checklist.
- This checklist should be kept up to date as auth/purchase/entitlement code
  changes; treat it as living documentation, not a one-time artifact.
