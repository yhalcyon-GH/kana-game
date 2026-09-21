# Observability — minimal pre-Live logging

Scope: a personal/solo-developer level of "can I tell what went wrong
after the fact," not a monitoring platform. No external monitoring or
log-shipping service is introduced. Security Audit v1 adds one local,
non-PII `paddle_reconciliation_blocks` quarantine table so deterministic
reconciliation failures survive beyond Paddle's finite retry window.

All logging described here uses PHP's built-in `error_log()`. There is
no log-shipping/aggregation configured in this repo.

**Production verified 2026-09-20:** the XServer error log for `giganihongo.com`
was reachable in Server Panel and reviewed for the launch-critical Tamamizu
tags without copying request/customer data into the repository. No
`paddle-webhook: stage=`, `request-code: mailer_unconfigured`,
`request-link: mailer_unconfigured`, or PHP fatal/warning/parse/notice
entries were found in the supplied log. XServer's "user-area save" setting
for `giganihongo.com` was then set by the human operator to **9 weeks**.
Treat that as the current operational retention setting; future changes in
XServer should be reflected here. See Issue #326 for the redacted review
record.

## Logging convention

Every entrypoint in `server/` follows the same rule: on a caught
exception, log only a fixed tag plus `get_class($e)` (the exception's
class name) — never `$e->getMessage()`, never the raw request body,
never an email address, token, or other payload-derived value. An
exception message or payload can itself carry sensitive data (a DSN
fragment, a normalized email, a magic-link token), so only the class
name is safe to persist. This applies to `server/paddle-webhook.php`,
`server/auth/*.php`, `server/entitlement.php`, `server/entitlement-me.php`,
`server/purchase-intent.php`, and `server/dev-only/last-magic-link.php`.

## Tags to watch

### `paddle-webhook: stage=<stage> error=<ExceptionClass>`

Logged once, from `server/paddle-webhook.php`, when a `\Throwable` is
caught at one of four distinct stages — this is what lets a human tell
apart "misconfigured Paddle environment" from "DB unreachable" from
"handler code broke," after the fact, without any secret/payload
content in the log line:

| `stage=` value        | What it means if it appears |
|------------------------|------------------------------|
| `config_load`          | `Config::load()` itself threw — extremely unlikely (it doesn't validate), treat as a bug if seen. |
| `paddle_environment`   | `PaddleEnvironmentConfig::resolve()` threw — `PADDLE_ENVIRONMENT` is missing/invalid, or the selected environment's webhook-secret/price-id/product-id triplet is incomplete. **Every webhook call will 500 until fixed.** Check `server/config.php` (or the real env vars) for the four `PADDLE_ENVIRONMENT`/`PADDLE_{SANDBOX,LIVE}_*` keys. |
| `db_connect`           | `Db::connect()` threw — DB host/name/user/password wrong, or the DB is unreachable. **Every webhook call will 500 until fixed.** |
| `handle`               | `PurchaseWebhookHandler::handle()` itself threw an uncaught exception — a bug in signature verification, payload parsing, or the purchase/entitlement transaction. Needs code-level investigation; the error class name is the only clue logged. |

### `paddle-webhook: environment=<sandbox\|live> outcome=<tag> status=<code>`

Logged once per successfully-handled request (i.e. no exception was
thrown), from `server/paddle-webhook.php`. `outcome` is one of a fixed
set of tags — never the raw `WebhookResult::$message`, which can embed
a Paddle event-type string:

| `outcome=` value    | HTTP status | What it means |
|----------------------|:---:|----------------|
| `processed`          | 200 | A `transaction.completed`/adjustment/chargeback event was matched and applied. Normal, expected traffic. |
| `quarantined`        | 200 | A signature-valid adjustment hit a known deterministic reconciliation invariant. Its event claim/history are durably retained, a non-PII quarantine row is created, and entitlement is conservatively recomputed. **Investigate unresolved quarantine rows promptly; this is not a normal success.** |
| `duplicate`           | 200 | Paddle redelivered an event whose `event_id` was already claimed — normal retry behavior, already handled once. |
| `ignored`             | 200 | A well-formed, signature-valid event that this deployment doesn't act on (wrong product/event type). If this appears at a high, sustained rate, it can mean the configured price/product ID no longer matches what Paddle is actually sending — worth checking manually. |
| `malformed_payload`   | 400 | The request body didn't parse as the expected shape. Isolated occurrences are likely a Paddle-side anomaly; sustained occurrences suggest a payload-shape mismatch worth investigating. |
| `invalid_signature`   | 401 | HMAC signature check failed — either the configured webhook secret is wrong for this environment, or a non-Paddle request hit this endpoint. A sustained run of these is worth checking against the Paddle dashboard's notification-destination secret. |
| `server_error`        | 500 | Reached only if `handle()` returns `WebhookResult::serverError()` without throwing (rare path); check for an adjacent `stage=handle` line, since most 500s come from the stage-tagged catch blocks above instead. |
| `unknown`             | — | The classifier didn't recognize the status/message combination — should not happen; treat as a bug in the classifier itself if seen. |

**If `paddle-webhook` 500s (`stage=*` lines) appear repeatedly:**
investigate immediately — these are transient/unknown failures and Paddle's
retry/redelivery mechanism remains the recovery path.

**If `outcome=quarantined` appears:** the handler deliberately returned 200
because retrying the same deterministic invariant would be a poison loop.
The `payment_events` claim, normalized adjustment row, and a row in
`paddle_reconciliation_blocks` are durable. The quarantine row stores only
Paddle identifiers/action metadata, a fixed reason code, and whether that
transaction must be excluded from entitlement; no customer email, raw payload,
or secret is stored. Any unresolved deterministic reconciliation block sets
`force_exclude_transaction=1`, so that transaction stops counting toward
entitlement until operator resolution while a separate healthy repurchase
remains valid.
Do not mark such a block resolved until the underlying transaction history has
been manually reviewed/corrected under the appropriate Production DB Human Gate.

### `request-link: mailer_unconfigured` / `request-code: mailer_unconfigured`

The first tag is logged from `server/auth/request-link.php`; the second
is logged from the Production-primary OTP endpoint
`server/auth/request-code.php`. Each appears when a request falls
through to the safe no-op mailer because `DEV_HARNESS_ENABLED` is not
`'true'` **and** the Resend triplet (`RESEND_API_KEY`,
`MAGIC_LINK_FROM_EMAIL`, `MAGIC_LINK_FROM_NAME`) is incomplete or
absent. No PII, secret, one-time code, or config value is included — the
tag alone is the signal.

**If either tag appears repeatedly in Production, treat it as a go-live
blocker.** The affected request is deliberately enumeration-safe and may
look superficially successful to the client while no email is sent.
`production:preflight` already checks the same mailer configuration
without exposing secret values, but the runtime tags remain useful for
detecting later drift or failures.

### `entitlement.php: lookup failure: <ExceptionClass>`

Logged from the legacy Sandbox-PoC `server/entitlement.php` on a DB
lookup failure. Not reachable from any live user-facing flow (Phase 3A
uses `entitlement-me.php` instead), but now uses the same
class-name-only convention as every other endpoint.

## If HTTP 500s appear repeatedly

A sustained run of any `stage=*` or `outcome=server_error` line from
`paddle-webhook`, or any `<endpoint>.php: <ExceptionClass>` line from
the auth/purchase-intent/entitlement endpoints, means real requests are
failing. For the webhook specifically, Paddle will keep retrying failed
deliveries for a period (visible in the Paddle dashboard's webhook
event log) — but only if the underlying cause (bad config, unreachable
DB) is fixed before Paddle gives up retrying.

## Design tradeoff not resolved by this change

`request-link.php`'s no-op-mailer fallback is a **silent fail-open**:
a misconfigured deployment still returns a normal 200
`{"status":"ok"}` to every request, forever, with no user-visible
signal — only the `mailer_unconfigured` log tag above. Failing closed
instead (e.g. a 5xx once no real mailer is configured in a
Production-flagged deployment) would surface this faster, but doing so
safely needs an explicit, deliberate environment signal (e.g. a new
`APP_ENV=production` flag) that does not exist yet — introducing one
was out of scope for this change, per the instruction not to add a new
environment concept as a side effect of an observability pass. This is
recorded here as an open design question for a future, explicitly-scoped
change, not fixed in this PR.
