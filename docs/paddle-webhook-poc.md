# Paddle Sandbox entitlement PoC — Phase 2 (server-side webhook)

Builds on [`docs/paddle-sandbox-checkout.md`](./paddle-sandbox-checkout.md)
(Phase 1: client-side Sandbox overlay checkout only, no server, no
entitlement). Phase 2 adds a minimal PHP/MySQL backend, deployable to
Xserver, that safely recognizes a completed Paddle Sandbox payment
server-side and stores an entitlement.

**Scope discipline:** this is still a proof of concept. It does **not**
add Magic Link, real accounts, production Paddle, real paid-content
locking, a restore-purchase UI, cross-device login, subscriptions, or a
production paywall — see "Scope外" in the task and "Deferred to a later
phase" below. Learning logic, curriculum, progress, audio, analytics, and
feedback are all untouched by this PR.

## Goal

Prove, end to end:

> Sandbox payment → Paddle webhook → Xserver signature verification →
> MySQL entitlement write → `entitlement.active = true`

without ever trusting the client-side `checkout.completed` event as a
source of truth.

## Architecture

```
Browser (kana-game, /paddle-test dev route)
  │  Paddle.js Checkout.open({ customData: { internal_user_id: "sandbox-test-user" } })
  ▼
Paddle Sandbox (hosted checkout + payment)
  │  server-to-server webhook POST, signed with Paddle-Signature
  ▼
Xserver: server/paddle-webhook.php
  │  1. Read raw body (php://input) — never re-serialize before verifying
  │  2. Verify HMAC-SHA256 signature (server/src/PaddleSignature.php)
  │  3. Parse envelope, check idempotency (payment_events.paddle_event_id)
  │  4. For transaction.completed: verify status, price/product id, and
  │     custom_data.internal_user_id, then UPSERT entitlements
  │  5. For adjustment.created (action=refund): revoke entitlement
  ▼
MySQL (server/sql/schema.sql: payment_events, entitlements)
  ▲
  │  read-only GET
Xserver: server/entitlement.php  ←── Browser (dev-only "Check entitlement" button)
```

## Security model

- **Client-side `checkout.completed` is never trusted.** It only updates
  a diagnostic on-page message (unchanged from Phase 1) — see
  `src/routes/PaddleTestPage.tsx`'s handler comment. It cannot write to
  the database and has no code path that touches entitlement state.
- **The only entitlement writer is `server/paddle-webhook.php`, gated on
  a verified signature.** `WebhookHandler::handle()`
  (`server/src/WebhookHandler.php`) checks the signature before it does
  anything else with the payload — an invalid/missing signature returns
  401 immediately, before JSON parsing.
- **Raw body only.** `paddle-webhook.php` reads `php://input` once and
  passes that exact string to `PaddleSignature::verify()`. It is never
  decoded-then-reencoded before verification — Paddle's own docs warn
  this changes the signed bytes (see "Official Paddle docs checked"
  below). `server/tests/PaddleSignatureTest.php` has a dedicated
  regression test for this exact mistake.
- **No unknown price/product can grant entitlement.** `matchesFullTamamizu()`
  in `WebhookHandler.php` requires the transaction's line items to match
  BOTH `PADDLE_FULL_TAMAMIZU_PRICE_ID` and `PADDLE_FULL_TAMAMIZU_PRODUCT_ID`
  from server config — a purchase of anything else is safely acknowledged
  (HTTP 200, so Paddle doesn't retry) but never activates entitlement.
- **Idempotent by Paddle's own event id.** `payment_events.paddle_event_id`
  is `UNIQUE`; a re-delivered webhook (Paddle retries on anything other
  than a 200 response) is recognized and safely re-acknowledged, never
  reprocessed.
- **Entitlement writes UPSERT**, not insert — a repeat purchase or a
  webhook retry for the same `(internal_user_id, product_key)` converges
  on the same row.

## Official Paddle docs checked (2026-09, current Paddle Billing — not Paddle Classic)

All of the following were read directly from `developer.paddle.com`
during this task, not guessed or taken from third-party sources:

- **Signature verification**: [Signature verification](https://developer.paddle.com/webhooks/about/signature-verification) —
  `Paddle-Signature` header format `ts=...;h1=...`, HMAC-SHA256 over
  `{ts}:{raw_body}`, secret from the notification destination (shown once,
  `pdl_ntfset_...`), explicit warning against re-serializing the body
  before verification, 5-second default timestamp tolerance, and that
  `h1` may appear more than once during a secret-rotation window.
- **Webhook envelope structure**: [Transaction completed](https://developer.paddle.com/webhooks/transactions/transaction-completed) —
  top-level `event_id`, `event_type`, `occurred_at`, `notification_id`,
  `data`.
- **Purchase-completion event**: same page — `transaction.completed` is
  the event that fires once Paddle finishes backend processing of a
  transaction (as distinct from `transaction.paid`, which fires earlier,
  once payment is captured but before that processing finishes). This PoC
  uses `transaction.completed`.
- **Transaction fields**: same page — `data.status`, `data.id`,
  `data.items[].price.id`, `data.items[].price.product_id`,
  `data.custom_data`.
- **customData**: [Custom data](https://developer.paddle.com/build/transactions/custom-data) —
  client-side Paddle.js uses camelCase `customData`; the webhook/API
  payload echoes it back as snake_case `data.custom_data`, at the
  top level of the transaction object.
- **Refunds/adjustments**: [Adjustment created](https://developer.paddle.com/webhooks/adjustments/adjustment-created) —
  Paddle Billing has **no** dedicated `transaction.refunded` event.
  Refunds (and chargebacks) are both modeled as `adjustment.created` /
  `adjustment.updated` events, distinguished by `data.action` (`refund`,
  `credit`, `chargeback`, `chargeback_reverse`, `chargeback_warning`,
  `chargeback_warning_reverse`), with `data.transaction_id` linking back
  to the original transaction.
- **Retry/response behavior**: [Respond to webhooks](https://developer.paddle.com/webhooks/about/respond-to-webhooks) —
  respond within 5 seconds; return exactly HTTP 200 to stop retries;
  anything else (any other status code, or a timeout) triggers Paddle's
  exponential-backoff retry schedule (Sandbox: 3 retries within 15
  minutes; Live: up to 60 retries over 3 days).
- **Notification destination setup**: [Notification destinations](https://developer.paddle.com/webhooks/about/notification-destinations) —
  dashboard path **Paddle → Developer tools → Notifications → New
  destination**; the signing secret is shown once at creation and cannot
  be retrieved again (rotate it if lost).

### Explicitly unconfirmed / not assumed

- Paddle's docs do not state whether a 4xx vs. a 5xx response code causes
  different retry behavior — the documented mechanism is "any non-200
  status triggers a retry." This PoC still returns 401 for bad signatures
  and 500 for genuine server errors as a sensible default, but does not
  rely on Paddle treating those differently.
- Whether Paddle recommends deduplicating on `event_id` vs. `notification_id`
  is not stated explicitly in the pages reviewed. This PoC dedupes on
  `event_id` (the logical event), which is the more conservative choice
  for "don't process the same underlying purchase twice."
- Whether the Sandbox dashboard's notification-destination navigation is
  identical to Live was not independently re-confirmed on a Sandbox-only
  doc page (only inferred from Paddle's general Sandbox/Live parity
  model). If the Sandbox dashboard UI differs, use whatever the current
  Sandbox dashboard actually shows under Developer tools.
- The full canonical enum of `adjustment.action` and `adjustment.status`
  values was only confirmed from the webhook example payloads, not a
  dedicated schema/reference page — chargeback-family actions
  (`chargeback`, `chargeback_reverse`, `chargeback_warning`,
  `chargeback_warning_reverse`) are recognized as existing but are
  **explicitly not handled** in this PoC (see "Refund / dispute /
  reversal handling" below) — future/unconfirmed, not implemented.

## Webhook events used

| Event | Used for |
|---|---|
| `transaction.completed` | Activates entitlement, only when status=`completed`, price+product match config, and `custom_data.internal_user_id` is present. |
| `adjustment.created` (action=`refund`) | Revokes entitlement. |
| `adjustment.updated` (action=`refund`) | Same handling as `adjustment.created` — Phase 2 does not distinguish refund lifecycle stages (see Known limitations). |
| Anything else (e.g. `transaction.paid`, `transaction.billed`, `subscription.*`, chargeback-action adjustments) | Signature is still verified and the event id is still recorded for idempotency, but no entitlement change happens — the response is HTTP 200 ("safely ignored"). |

## customData design

Paddle.js `Checkout.open()` is called (see `src/routes/PaddleTestPage.tsx`)
with:

```ts
customData: { internal_user_id: 'sandbox-test-user' }
```

`sandbox-test-user` is a **fixed constant** (`SANDBOX_TEST_USER_ID` in the
frontend, `KanaGame\Paddle\SandboxUser::ID` in PHP) — not a real,
per-person identifier. There is no Magic Link / account system yet. Every
Sandbox purchase made through this PoC page is attributed to this one
identifier. **Do not repurpose this as a production user id** — a real
identity system is required first (see "Deferred to a later phase").

## DB schema

See [`server/sql/schema.sql`](../server/sql/schema.sql) for the full,
commented DDL. Summary:

- **`payment_events`** — idempotency ledger. One row per Paddle
  `event_id` ever safely processed, `UNIQUE`. Also stores `event_type`,
  the related `paddle_transaction_id` (nullable), and timestamps.
- **`entitlements`** — one row per `(internal_user_id, product_key)`,
  `UNIQUE`. `active` (boolean), the most recent `paddle_transaction_id`,
  and timestamps.

Neither table stores email, address, card data, or any other customer
PII — see "Privacy" below.

## Entitlement state model

- **Activate**: `transaction.completed`, status=`completed`, price+product
  match, `custom_data.internal_user_id` present → UPSERT
  `(internal_user_id, 'full_tamamizu', active=true, paddle_transaction_id)`.
- **Revoke**: `adjustment.created`/`adjustment.updated` with
  `action=refund` → UPSERT the same row to `active=false`. Because a
  refund's own adjustment payload does not carry the original
  transaction's `custom_data`, Phase 2's single-fixed-Sandbox-test-user
  scope is what makes this safe: the refund handler revokes the one
  entitlement row Phase 2 ever creates for `SandboxUser::ID`. A real
  multi-user system (Phase 3+) would need to resolve which user a
  refunded transaction belongs to independently (e.g. by keeping a
  transaction→user mapping recorded at purchase time, or querying the
  Paddle API for the transaction) — not implemented here, see Known
  limitations.
- Both operations are UPSERTs (`server/src/EntitlementRepository.php`) —
  safe to run repeatedly for the same user/product without creating
  duplicate rows or erroring.

## Refund / dispute / reversal handling

Per the official docs checked above:

- **Refund**: `adjustment.created` with `data.action == "refund"`.
  **Implemented** — see Entitlement state model. `data.type` (`full` vs
  `partial`) exists in the payload but Phase 2 does not distinguish it —
  any refund action revokes the entitlement entirely (documented
  simplification, not a Paddle spec gap).
- **Chargeback/dispute**: `adjustment.created`/`updated` with
  `data.action` in `chargeback`, `chargeback_reverse`,
  `chargeback_warning`, `chargeback_warning_reverse`. **Confirmed to
  exist in Paddle's docs, but NOT implemented in Phase 2** — these
  actions are safely ignored (event id recorded for idempotency, HTTP
  200 returned, entitlement untouched). See
  `server/tests/WebhookHandlerTest.php`'s "chargeback ... is safely
  ignored" test.
- **Successful chargeback reversal** (`chargeback_reverse`): confirmed to
  exist as an action value in the docs' adjustment examples, but its
  precise semantics (does it restore an entitlement that a `chargeback`
  had revoked?) were **not independently confirmed** against a canonical
  status/action reference page. **Future phase** — do not implement this
  without re-reading Paddle's current adjustment docs directly.
- **Adjustment `status` lifecycle** (e.g. `pending_approval` → some
  approved/rejected terminal state): the exact enum was only seen in
  example payloads, not a schema reference. Phase 2 treats any
  `action=refund` adjustment as an immediate revoke regardless of
  `status` — this is a deliberate simplification for PoC purposes, not a
  confirmed mapping to Paddle's actual approval lifecycle. **Future
  phase**: only revoke once `status` reaches a confirmed "approved"/
  terminal state, once that enum is verified.

## CORS

`server/src/Cors.php` is an explicit allowlist, read from
`ALLOWED_ORIGINS` in server config (comma-separated). It never emits
`Access-Control-Allow-Origin: *`. Only `entitlement.php` applies CORS
headers — `paddle-webhook.php` is server-to-server only and does not need
them (a browser is never the caller of that endpoint).

Suggested Phase 2 allowlist (adjust to whatever your actual dev/test
setup uses):

```
http://localhost:5173,http://localhost:4173,https://yhalcyon-gh.github.io
```

## Tests

### PHP (server/tests/, run with `php server/tests/run-tests.php`)

No PHPUnit/composer dependency — this PoC intentionally stays
dependency-free on the PHP side; each `*Test.php` file returns an
associative array of test name → callable, and `run-tests.php` executes
them. 32 tests, covering:

- **`PaddleSignatureTest.php`** (9 tests): valid signature accepted;
  wrong secret rejected; signature over a re-serialized body rejected
  (the exact mistake Paddle's docs warn against); stale timestamp
  rejected; timestamp within tolerance accepted; malformed headers (no
  `h1`, no `ts`, empty) rejected; multiple `h1` values (rotation window)
  — a matching one anywhere is accepted.
- **`WebhookHandlerTest.php`** (11 tests): invalid/missing signature
  rejected (401); malformed JSON rejected (400); missing envelope fields
  rejected (400); valid Full Tamamizu purchase activates entitlement
  (200); duplicate `event_id` is safely re-acknowledged without
  reprocessing; wrong price/product does not unlock; non-`completed`
  status does not unlock; missing `custom_data.internal_user_id` does not
  unlock; an unsupported event type is safely ignored (200); a refund
  revokes entitlement; a chargeback action is safely ignored (entitlement
  untouched, not silently revoked).
- **`EntitlementRepositoryTest.php`** (6 tests): create, idempotent
  re-activation (no duplicate row), revoke, revoke-with-no-prior-row,
  and independence across different `product_key`s for the same user.
  Uses an in-memory SQLite DB — `EntitlementRepository`'s SQL is written
  portably (a SELECT-then-INSERT/UPDATE, not MySQL-only
  `ON DUPLICATE KEY UPDATE`) specifically so these tests don't need a
  real MySQL server.
- **`CorsTest.php`** (5 tests): allowlisted origin allowed; unlisted
  origin rejected; null/empty origin rejected; a literal `"*"` allowlist
  entry never wildcard-matches; origin comparison is exact (not
  prefix/substring).

Run:

```bash
php server/tests/run-tests.php
```

### Frontend (Vitest, existing patterns from Phase 1)

`src/routes/PaddleTestPage.test.tsx` gained tests for:

- `customData: { internal_user_id: 'sandbox-test-user' }` is always
  attached to `Checkout.open()`, never a different/real identifier.
- The entitlement-check button/status is absent entirely when
  `VITE_PADDLE_ENTITLEMENT_API_URL` is unset (dev-only, sandbox-only
  guard).
- It's absent even in development when `VITE_PADDLE_ENTITLEMENT_API_URL`
  is set but the build is not `DEV` (production boundary).
- A successful entitlement check requests the fixed test user id and
  displays active/inactive correctly.
- Both an HTTP-error and a network-failure response are shown as a
  recoverable error, not an unhandled exception.

`src/App.paddle.test.tsx` (unchanged from Phase 1) still proves the whole
`/paddle-test` route — and therefore the entitlement-check UI living
inside it — is excluded from production builds.

## npm run verify

Run from a fresh worktree at this branch's HEAD (see the PR body for the
exact recorded result and HEAD SHA):

```bash
npm run verify
```

## Xserver deployment

1. **Upload PHP files.** Copy the `server/` directory to a location Xserver
   serves over HTTPS, e.g. `public_html/api/` (adjust to your actual
   Xserver document root). At minimum you need:
   - `server/paddle-webhook.php`
   - `server/entitlement.php`
   - `server/src/*.php`
   - `server/config.php` (see step 3 — **not** `config.example.php`)

   Do **not** upload `server/tests/` or `server/sql/schema.sql` into a
   public web-servable directory if your hosting serves the whole
   directory tree by default — keep them outside `public_html`, or block
   direct access via `.htaccess`/hosting panel rules. `server/sql/` and
   `server/tests/` contain no secrets, but they're not meant to be
   publicly reachable HTTP endpoints.

2. **Create the MySQL schema.** In Xserver's MySQL admin (phpMyAdmin or
   equivalent), create a dedicated database and user for this PoC, then
   run [`server/sql/schema.sql`](../server/sql/schema.sql) against it —
   creates `payment_events` and `entitlements`.

3. **Create server config.** Copy
   [`server/config.example.php`](../server/config.example.php) to
   `server/config.php` on the server (never commit this file — it's
   gitignored) and fill in:
   - `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — the database from
     step 2.
   - `PADDLE_WEBHOOK_SECRET` — see the Paddle Sandbox webhook setup
     section below.
   - `PADDLE_FULL_TAMAMIZU_PRICE_ID`, `PADDLE_FULL_TAMAMIZU_PRODUCT_ID` —
     the same Sandbox Full Tamamizu price used in Phase 1
     (`docs/paddle-sandbox-checkout.md`); find the product id in the same
     Sandbox catalog entry as the price id.
   - `ALLOWED_ORIGINS` — see CORS above.

   Alternatively, if your Xserver plan supports setting real environment
   variables for PHP (e.g. via `.htaccess` `SetEnv` or a php-fpm pool
   config), `Config::load()` reads the same key names from the
   environment first — use whichever mechanism your hosting actually
   supports.

4. **Set file permissions.** `server/config.php` should be readable only
   by the web server process (not world-readable) — follow Xserver's
   standard PHP file-permission guidance for files containing credentials
   (commonly `640` or equivalent, owned by the appropriate user/group for
   your specific Xserver plan).

5. **Webhook endpoint URL** (example — replace with your actual domain):
   ```
   https://<your-domain>/api/paddle-webhook.php
   ```

6. **Entitlement endpoint URL** (example):
   ```
   https://<your-domain>/api/entitlement.php?user_id=sandbox-test-user
   ```

## Paddle Sandbox webhook destination setup (human steps)

Confirmed navigation per
[developer.paddle.com/webhooks/about/notification-destinations](https://developer.paddle.com/webhooks/about/notification-destinations)
— if the current Sandbox dashboard UI has since renamed these menu items,
use whatever the live dashboard actually shows under Developer tools:

1. In the Paddle **Sandbox** dashboard, go to **Developer tools →
   Notifications**.
2. Click **New destination**.
3. Set the destination URL to your deployed webhook endpoint:
   `https://<your-domain>/api/paddle-webhook.php`.
4. Subscribe to at least:
   - `transaction.completed`
   - `adjustment.created`
   - `adjustment.updated`
5. Save the destination. **Immediately copy the shown signing secret**
   (`pdl_ntfset_...`) — Paddle's docs state this is shown only once and
   cannot be retrieved again. Put it in `server/config.php`'s
   `PADDLE_WEBHOOK_SECRET`.
6. Use Paddle's dashboard "send test event" feature (if available in the
   current UI) to send a test delivery and confirm your endpoint returns
   HTTP 200 before attempting a real Sandbox purchase.

## Human end-to-end verification

This cannot be fully automated (it needs a real Xserver deployment and a
real Paddle Sandbox account) — a human must perform and record these
steps, referencing the exact HEAD SHA tested:

1. Run `server/sql/schema.sql` against the Xserver MySQL database.
2. Create `server/config.php` on Xserver with real DB credentials, the
   Paddle Sandbox webhook secret, and the Full Tamamizu Sandbox
   price/product ids.
3. Register the Paddle Sandbox webhook destination (steps above),
   subscribing to `transaction.completed`, `adjustment.created`,
   `adjustment.updated`.
4. From the Tamamizu Sandbox Checkout PoC (`/paddle-test`, per
   `docs/paddle-sandbox-checkout.md`), complete a Sandbox purchase using
   Paddle's test card (`4242 4242 4242 4242`).
5. Confirm the transaction shows **Complete** in the Paddle Sandbox
   dashboard's Transactions view.
6. Confirm the webhook endpoint received the event — check Xserver's PHP
   error log (should show no errors) and, if the current Paddle dashboard
   exposes per-notification delivery logs/status, confirm a 200 response
   was recorded there.
7. Confirm signature verification succeeded — a rejected/invalid
   signature would show as a 401 in Paddle's delivery log, and no new row
   in `payment_events`.
8. Query `payment_events` directly (or via phpMyAdmin) and confirm a new
   row exists with `event_type = 'transaction.completed'` and the correct
   `paddle_transaction_id`.
9. Query `entitlements` and confirm a row exists with
   `internal_user_id = 'sandbox-test-user'`, `product_key = 'full_tamamizu'`,
   `active = 1`.
10. `curl` (or open in a browser)
    `https://<your-domain>/api/entitlement.php?user_id=sandbox-test-user`
    and confirm the JSON response shows `"active": true`.
11. From the `/paddle-test` PoC page (with `VITE_PADDLE_ENTITLEMENT_API_URL`
    set in `.env.local` to the deployed entitlement endpoint), click
    **Check entitlement** and confirm the page shows "Entitlement:
    active".

Optional, if verifying refund handling:

12. In the Paddle Sandbox dashboard, issue a refund for the test
    transaction.
13. Confirm the webhook endpoint receives an `adjustment.created`
    (action=refund) event — new row in `payment_events`.
14. Re-check `entitlements` (or the entitlement endpoint / PoC page) and
    confirm `active` is now `0`/`false`.

Record the tested HEAD SHA and the actual results (pass/fail per step) in
the PR when this verification is performed.

## Privacy

Per the task's explicit requirement, this PoC stores the minimum needed
and nothing more:

- `payment_events`: Paddle event id, event type, related transaction id,
  timestamps. No customer name/email/address/card data.
- `entitlements`: the fixed Sandbox test user id, product key, active
  flag, related transaction id, timestamps. Same — no customer PII.
- The full Paddle webhook payload is **not** persisted anywhere — only
  the specific fields above are extracted and stored.
- Error logs (`error_log()` calls in `paddle-webhook.php`/`entitlement.php`)
  log only exception messages, never the raw webhook payload or any
  customer/payment data.

## Secret handling

- `server/config.php` (real DB credentials, real Paddle webhook secret,
  real price/product ids) is **gitignored** (see `.gitignore`) and was
  never committed — only `server/config.example.php`, which contains
  empty placeholder values, is checked in.
- No Paddle API key/secret is used anywhere in this PoC — only the
  webhook signing secret (itself not an API key) and public
  Sandbox price/product ids.
- `.env.local` (frontend `VITE_PADDLE_ENTITLEMENT_API_URL`, etc.) remains
  gitignored per the existing `*.local` rule and Phase 1's precedent.

## Known limitations

- **Refund attribution assumes the single fixed Sandbox test user.** A
  refund event's payload does not carry the original transaction's
  `custom_data`, so this PoC's refund handler revokes
  `SandboxUser::ID`'s entitlement directly rather than resolving the
  refunded transaction's actual buyer. This only works because Phase 2
  has exactly one possible buyer. A real (multi-user) system needs a
  transaction→user mapping recorded at purchase time, or a lookup against
  the Paddle API, before this handler can generalize.
- **A first-ever insert race is possible** for the same `(user, product)`
  pair under truly concurrent webhook deliveries (`EntitlementRepository`
  uses a portable SELECT-then-INSERT/UPDATE rather than a single atomic
  `INSERT ... ON DUPLICATE KEY UPDATE`, specifically so the same code
  works against SQLite in tests). For Phase 2's single fixed Sandbox test
  user this is a very low-probability, low-consequence race (worst case:
  a duplicate-key exception on the losing writer, not a data-integrity
  bug, since the UNIQUE constraint still prevents actual duplicate rows).
  Acceptable for this PoC's scope; a production system should decide
  explicitly whether to use MySQL's atomic upsert instead.
- **Chargeback/dispute events are recognized but not acted on** (see
  "Refund / dispute / reversal handling").
- **No local MySQL was available to test against a real MySQL server in
  this environment** — `server/sql/schema.sql` was written directly from
  the official MySQL 8 InnoDB/UTF8MB4 conventions already used elsewhere
  in this task's research, and `EntitlementRepository`/`PaymentEventRepository`'s
  SQL was verified against a real PDO SQLite connection (same PDO API
  surface, portable SQL). It has **not** been executed against a real
  MySQL server as part of this task — Xserver deployment step 2 (running
  the schema) is the first real MySQL execution, and should be the first
  thing verified during human end-to-end testing.
- **PHP tests run without PHPUnit** — this repository has no existing PHP
  dependency-management setup, so a small dependency-free test runner was
  written instead of introducing composer/PHPUnit for a PoC. If the
  server code grows past PoC scope, adopting PHPUnit would be a
  reasonable follow-up.

## Deferred to a later phase

Explicitly not in Phase 2, per the task's scope:

- Magic Link / real account system.
- Attributing entitlement to anything other than the single fixed
  Sandbox test user.
- Production Paddle (Live environment) configuration.
- Any actual curriculum/content lock or unlock UI.
- A restore-purchase flow.
- Cross-device login / entitlement sync.
- Migrating any real customer's entitlement.
- A full refund-support UI for end users.
- Live chargeback automation beyond safely ignoring the event.
- Subscriptions, ads, or Google Play billing.
- Resolving the adjustment `status` lifecycle (pending/approved/rejected)
  precisely — Phase 2 revokes on any `action=refund` regardless of
  `status`.
