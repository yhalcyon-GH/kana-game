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
- [ ] **Human required** — Before uploading, follow the reviewed file
      inclusion/exclusion and rollback boundaries in
      [xserver-api-deployment-plan.md](./xserver-api-deployment-plan.md).
      Preserve any existing Production configuration; do not expose the
      CLI-only `ops/` readiness directory over HTTP.

- [ ] **Human required** — Enable SSH and register a dedicated public key in
      XServer's Server Panel. Keep its private key only in the approved local
      secure environment; never add it to GitHub Actions or paste it into AI.
- [ ] **AI-verifiable after that one-time setup** — Run
      `npm run production:preflight` using the fixed, local-only runner in
      [production-readonly-connection.md](./production-readonly-connection.md).
      It runs exactly one redacted remote readiness check and rejects an
      enabled development harness; it cannot run arbitrary commands.
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
      (see `docs/observability.md`). The fixed Production preflight above
      runs this same check and prints only redacted booleans.
- [x] **Human required** — If Email OTP sign-in is intended to be live,
      confirm `EMAIL_CODE_AUTH_ENABLED=true` and `LOGIN_CODE_PEPPER` are both
      set on Production. Confirmed 2026-09-20; the fixed preflight reported `emailCodeAuthEnabled=true`, `loginCodePepperConfigured=true`, `emailCodeAuthReady=true`, and the public capability returned `email_code_auth=true`. The fixed preflight above also prints
      `emailCodeAuthEnabled` / `loginCodePepperConfigured` /
      `emailCodeAuthReady` booleans (never the pepper value) so a
      `{"email_code_auth":false}` response from the public capability probe
      can be told apart from a stale frontend — see
      [production-readonly-connection.md](./production-readonly-connection.md#email_code_auth-false-on-the-public-capability-probe--is-it-stale-or-is-it-off).
      If OTP is not intended to be live yet, `emailCodeAuthEnabled=false` is
      the expected, non-blocking state.
- [ ] **Human required** — Confirm the real path `error_log` writes to on
      this XServer plan, and that it is being watched/rotated. (Not
      independently verifiable from the repo; do not guess a path.)
- [ ] **Human required** — Confirm CORS allowed-origins in Production config
      match the real Production frontend origin(s) only.
- [x] **Human required** — Confirm session cookie behavior is correct in a real Production browser. Confirmed 2026-09-20 by successful OTP login, persistence across close/relaunch, and logout. Static cookie attributes remain enforced by the reviewed server implementation; no secret values were exposed.

## 4. Magic Link auth (end-to-end, real browser, Production)

- [x] **Human required** — Request a magic link against the Production
      endpoint with a real inbox and confirm the email actually arrives.
      Confirmed 2026-09-16 (see §8): real Production Magic Link
      delivery/login succeeded.
- [x] **Human required** — Click the link, confirm session cookie is set,
      confirm `auth/me` reflects the logged-in user. Confirmed 2026-09-16
      (see §8).
- [x] **Human required** — Confirm `auth/logout` clears the session. Confirmed 2026-09-20 in the real installed Production PWA after Email OTP enablement: 6-digit OTP login succeeded, login persisted across close/relaunch, and logout returned to signed-out state.

## 5. Purchase / entitlement flow

- [ ] **AI-verifiable** — Purchase-intent, webhook signature verification,
      idempotency (duplicate event id), and out-of-order
      refund/adjustment-before-transaction handling are covered by
      automated tests on `main` (see `server/tests/` and
      `server/src/Purchase/PurchaseWebhookHandler.php`).
- [x] **Human required** — Confirm Paddle environment consistency: the
      Production deployment's Paddle client token, price/product IDs, and
      webhook secret are all the **Live** set, not Sandbox, and that none of
      Sandbox and Live values are mixed. Confirmed 2026-09-16 (see §8): Live
      client token, Live product/price, and Live webhook destination are
      configured, and a real Live purchase + real Live refund both
      round-tripped correctly end to end, which is not possible with mixed
      Sandbox/Live values.
- [x] **Live operation** — Create/verify the Live product and price in the
      Paddle Dashboard. Confirmed 2026-09-16 (see §8): `Full Tamamizu`
      exists as a Live one-time product at USD 5.00.
- [x] **Live operation** — Point the Paddle Live webhook destination at the
      real Production webhook URL and set the Live webhook secret in
      Production config (not in any repo file, not in any AI session).
      Confirmed 2026-09-16 (see §8): Live webhook destination is
      `https://tamamizu.giganihongo.com/api/paddle-webhook.php` for
      `transaction.completed`, `adjustment.created`, and
      `adjustment.updated`; the secret itself remains Production-side only
      and was never shared with any AI session.
- [x] **Live operation** — Run one real low-value test purchase against
      Paddle Live, confirm the webhook is received, signature verifies,
      `entitlement-me` reflects the grant, and the in-app UI unlocks
      correctly. Confirmed 2026-09-16 (see §8): one authorized real Live
      purchase completed, entitlement became `Full Tamamizu: Active` and
      stayed active across reload and sign-out/re-login, and paid content
      unlocked.
- [ ] **Live operation** — Run one real refund against that test purchase,
      confirm the adjustment webhook revokes entitlement and that any
      locally-stored learning progress is retained per the intended
      refund-vs-progress policy (business decision, not a repo default to
      infer). **Partially confirmed 2026-09-16** (see §8): one authorized
      real refund completed with no manual DB edit and no webhook replay,
      and entitlement correctly went inactive with content re-locked on
      reload, confirming the real refund webhook path revokes access. Left
      unchecked because the refund-vs-progress retention policy itself was
      not exercised/verified in this pass.
- [x] **Human required** — Confirm the failed/cancelled checkout UX (user
      closes or cancels Paddle Checkout without completing) leaves the app
      in a sane, non-broken state. Confirmed 2026-09-19: closing/cancelling Checkout left Full Access locked and the app remained usable.
- [ ] **Human required** — Confirm receipt/invoice/customer-portal access
      works as Paddle provides it (Paddle-hosted, not custom-built here
      unless the repo already implements a portal link). **Partially
      confirmed 2026-09-16** (see §8): the purchase email and tax invoice
      were received and correctly showed USD 5.00 + Thailand VAT USD 0.35 =
      USD 5.35 with no seller home address exposed. Left unchecked because
      the Paddle customer-portal link itself was not exercised. **Audited
      2026-09-19** (see `docs/paddle-customer-portal-audit.md`): this repo
      has no customer-portal link/config/API integration at all, so any
      portal access today depends entirely on what Paddle's own receipt
      email/dashboard provides. Adding an authenticated in-app portal-session
      link would require creating a new Production Paddle API key, which is
      itself a Human Gate — not implemented here.

## 5a. Webhook response timing (KEEP SYNC FOR LIVE — launch acceptable)

- [x] **AI-verifiable** — Investigated: `server/paddle-webhook.php` verifies
      the Paddle signature and then performs its DB work (event claim, grant
      create/update, entitlement recompute) synchronously, inside the same
      request, before returning the HTTP response. Paddle's own guidance is
      to acknowledge the webhook quickly and do heavier processing after
      responding — but this is a documented **recommendation for scale
      protection**, not a hard requirement; the only hard requirement is
      responding within Paddle's 5s deadline.

      Evidence for keeping the current synchronous design at launch:
      - The runtime path (`PurchaseWebhookHandler::handle()`) has no
        external network I/O — every step is local MariaDB work inside one
        transaction.
      - Every operation is already idempotent (event claim, single-use
        `purchase_ref` consume, `FOR UPDATE` grant locking), so a duplicate
        delivery caused by a slow response self-heals rather than
        corrupting state — this is a latency/retry-noise risk, not a
        correctness defect.
      - A MariaDB 10.5/10.11 CI concurrency benchmark (`server/tests/mariadb-concurrency`,
        see PR #234) measured response-path timing across normal,
        duplicate, refund, refund+reconciliation, and contended/repurchase
        scenarios: medians of 4-6ms, worst observed max 415.97ms (a
        contended same-user refund on 10.5) — still a **~12x margin**
        under the 5s deadline, with other scenarios at 460-700x margin.

      **Decision: KEEP SYNC FOR LIVE.** The current synchronous design is
      acceptable to launch with. Restructuring to a durable async
      queue-and-ack pattern is an **OPTIONAL post-launch improvement**, not
      a Live blocker.

      Caveats carried forward:
      - CI latency is not Production latency — the benchmark numbers are
        evidence of structural margin, not a Production SLA measurement.
      - If Live webhook 5xx responses, elevated Paddle retry volume, or
        anomalous latency are observed after launch, re-evaluate this
        decision against real Production numbers.
      - A "respond then continue processing in the same PHP process"
        approach (e.g. `fastcgi_finish_request`-style) must **not** be
        adopted as a shortcut: a process crash after the response is sent
        means Paddle already saw success and will not retry, silently
        dropping the event. It is unsafe as a naive implementation and is
        rejected as an option.
      - If async processing is adopted in the future, it must use a
        durable, crash-safe queue (e.g. a DB-backed queue table drained by
        a worker/cron step), not the fire-and-continue pattern above.

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

## 8. 2026-09-16 Production validation log

Human-verified Production facts recorded by the AI session for Issue #269,
from direct human report (no AI access to Production, Paddle Dashboard, or
any secret). Only facts that fit existing repo conventions are recorded
here; no secrets, transaction IDs, email addresses, account numbers, or
other personal identifiers are included.

- Paddle KYC/account verification completed.
- Production app domain is `https://app.tamamizu.giganihongo.com/`;
  DNS/HTTPS were already confirmed.
- Live product `Full Tamamizu` exists at USD 5.00 one-time; Live client
  token and Live webhook destination are configured.
- Live webhook destination is
  `https://tamamizu.giganihongo.com/api/paddle-webhook.php` for
  `transaction.completed`, `adjustment.created`, and `adjustment.updated`.
- Live webhook secret/product/price configuration remains Production-side
  only; no secrets were copied into GitHub.
- GitHub Pages was redeployed with Live public Paddle variables; `Default
  payment link` was found blank during validation, then set to
  `https://app.tamamizu.giganihongo.com/` by a human, after which Live
  Checkout opened normally.
- Real Production Magic Link delivery/login had already succeeded.
- Account page product/price/legal links/Buy/Check entitlement UI
  confirmed in Production.
- One authorized real Live purchase completed successfully. Paddle purchase
  email and tax invoice were received. Checkout showed USD 5.00 + Thailand
  VAT USD 0.35 = USD 5.35. Invoice exposed no seller home address.
- Entitlement became `Full Tamamizu: Active`, stayed active after reload
  and sign-out/re-login, and paid content unlocked.
- One separately authorized full refund of USD 5.35 completed successfully.
  No manual DB edit and no webhook replay were used. On page reload,
  entitlement was inactive and paid content was re-locked, confirming the
  real refund webhook path revoked access.
- Paddle payout details were configured by the human.
- Production read-only preflight remains intentionally paused after its
  prior redacted unexpected-response result; this pass did **not** restart
  SSH diagnostics or any other Production read-only check.

**Still genuinely open after the later 2026-09-19/20 validation work:**

- Refund-vs-progress retention policy is decided (retain local progress) but the retained-progress state was not independently re-exercised during the real refund pass (§5).
- Paddle customer-portal link itself (§5) remains optional/non-blocking; only the emailed receipt/invoice path is confirmed and repo audit found no in-app portal integration.
- Production `error_log` location/rotation and exact CORS allowed-origins configuration remain Human checks (§3/§6).
- Final rollback rehearsal/go-no-go decision (§7).
- Final legal review.

## Notes

- Paddle Sandbox → Live cutover, real credential generation, real charges,
  real refunds, and any Paddle Dashboard/API changes are explicitly
  out of scope for AI-only sessions and must be done by a human following
  this checklist.
- This checklist should be kept up to date as auth/purchase/entitlement code
  changes; treat it as living documentation, not a one-time artifact.
