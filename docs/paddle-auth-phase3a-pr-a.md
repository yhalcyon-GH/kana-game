# Phase 3A PR A — real-user identity + Magic Link auth foundation

Implements the users/magic_link_tokens/sessions/rate_limits portion of
[`docs/superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-design.md`](superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-design.md)
(rev. 3). Builds on Phase 2 ([`docs/paddle-webhook-poc.md`](paddle-webhook-poc.md))
without altering its `payment_events`/`entitlements` tables or
`sandbox-test-user` PoC path in any way.

## Scope

**In this PR:** users, Magic Link request/verify, sessions, DB-backed
HMAC-keyed concurrency-safe rate limiting, CORS preflight support, the
cross-site auth transport ADR.

**Explicitly NOT in this PR:** `purchase_intents`, `transaction_grants`,
`pending_adjustments`, any Paddle webhook/purchase-attribution changes,
the `/account-test` frontend harness, real SMTP, XServer deployment,
production session transport, curriculum locking.

## New endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/request-link.php` | POST | none | Request a Magic Link email. Always `200 {"status":"ok"}`. |
| `/api/auth/verify.php` | POST | none (token in body) | Consume a token, create/resolve the user, issue a session. |
| `/api/auth/me.php` | GET | `Authorization: Bearer` | Resolve the current user. Depends only on `CurrentUserService`. |
| `/api/auth/logout.php` | POST | `Authorization: Bearer` | Revoke the current session. `500` on genuine failure, not a silent `200`. |

## New tables

See [`server/sql/migrations/0001_users_auth_foundation.sql`](../server/sql/migrations/0001_users_auth_foundation.sql):
`users`, `magic_link_tokens`, `sessions`, `rate_limits`. Additive only —
no existing table is altered. `magic_link_tokens.user_id` and
`sessions.user_id` carry real `FOREIGN KEY` constraints to `users.id`.

## New config keys

`RATE_LIMIT_PEPPER` (required), `RATE_LIMIT_EMAIL_PER_HOUR` (default
5), `RATE_LIMIT_IP_PER_HOUR` (default 20),
`MAGIC_LINK_TOKEN_EXPIRY_MINUTES` (default 15), `SESSION_EXPIRY_HOURS`
(default 24, explicitly provisional — see the ADR),
`MAGIC_LINK_FRONTEND_BASE_URL` (required — frontend origin/path prefix
only, never a `#/verify` route; the fragment route is built in code by
`MagicLinkUrlBuilder`, not read from config).

## Magic-link token transport

Fragment-based: `.../#/verify?token=...`, never sent to any HTTP server
by the browser, then POSTed in a request body to `verify.php`.
`MagicLinkUrlBuilder` guarantees this by construction — the fragment
route is a literal in that class's source, not a config value.

## Mailer

`server/src/Auth/Mailer.php` is an interface. Its only implementation
anywhere in this codebase is `FakeMailer`, under `server/tests/Auth/`
(test-only — not part of the production deployment). No real email is
sent by any code in this PR; the four entrypoints use an inline
anonymous no-op `Mailer` where one is structurally required.

## CORS / preflight

`server/src/Cors.php` gained `applyPreflightHeaders()` (additive — the
existing `applyHeaders()` used by Phase 2's `entitlement.php` is
unchanged, including its call site, which passes no second
constructor argument). Preflight responses for an allowed origin
include `Access-Control-Allow-Methods` (GET, POST, OPTIONS) and
`Access-Control-Allow-Headers` (Content-Type, Authorization). No
`Access-Control-Allow-Credentials` is ever emitted — a production
cookie transport remains deferred. `Cors`'s constructor also gained an
optional injected header-sending callable purely for testability (PHP's
CLI SAPI does not record `header()` calls the way a real web server
does); it defaults to calling PHP's real `header()`, so no production
call site needed to change.

## Rate limiting

Atomic MariaDB upsert-based counting (`INSERT ... ON DUPLICATE KEY
UPDATE` plus a `SELECT ... FOR UPDATE` re-read inside one transaction),
replacing an earlier SELECT-then-UPDATE draft that could let concurrent
requests both read a stale count and both exceed the limit. Both the
email and IP buckets are HMAC-keyed; raw values are never persisted.
The IP bucket is recorded even for a malformed email request.

## Deployment status

**Not deployed.** This PR contains code, migrations, and tests only. No
XServer deployment, no schema execution against the real
`giganihongo_tmzp` database, and no Paddle Sandbox interaction happen in
this PR.

## Known remaining verification: real-MariaDB concurrency (required before Live)

This PR's concurrency tests (see
`server/tests/Auth/MagicLinkAuthServiceTest.php` and
`server/tests/Auth/RateLimiterTest.php`) are **race-scenario tests /
atomicity-idempotency semantic tests** — they run sequentially against
a single in-process SQLite connection and prove that the SQL patterns
used (atomic conditional UPDATE, atomic upsert) cannot be won twice or
double-inserted under repeated/simulated-sequential invocation. They do
**not** prove true simultaneous multi-connection MariaDB execution.

Before any Live Paddle rollout, a human must additionally verify, against
a real deployed MariaDB instance (not covered by this PR):

1. **Simultaneous consume of one magic-link token** from two real,
   concurrent HTTP requests (e.g. two curl processes launched at once)
   — expected: exactly one succeeds and creates exactly one session;
   the other receives the generic invalid/expired/used response.
2. **Simultaneous verification of two different valid links for one
   email** from two real, concurrent HTTP requests — expected: one
   user row, two valid sessions, no HTTP 500 from either request.

Neither check is performed in PR A. This is an explicit, documented gap
— not silently assumed to be covered by the SQLite-backed unit tests
above.

## Tests

Run `php server/tests/run-tests.php` — all Phase 2 tests (32) plus this
PR's new tests must pass together.
