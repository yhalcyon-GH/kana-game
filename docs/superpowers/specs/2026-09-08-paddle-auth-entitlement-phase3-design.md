# Phase 3A design — real-user identity + secure purchase attribution foundation

Status: approved for implementation (2026-09-08). Supersedes nothing;
extends [`docs/paddle-webhook-poc.md`](../../paddle-webhook-poc.md) (Phase 2)
and [`docs/paddle-sandbox-checkout.md`](../../paddle-sandbox-checkout.md)
(Phase 1).

## Goal

Replace Phase 2's fixed `sandbox-test-user` attribution with a real,
minimal identity and secure purchase-attribution foundation:

- real internal users, keyed by an unguessable public id;
- Magic Link authentication (request → verify → session);
- server-generated, hashed-at-rest `purchase_ref` binding an authenticated
  user to a Paddle Checkout attempt — never a browser-supplied user id;
- a `paddle_transactions` mapping so `transaction.completed` and refund
  (`adjustment.*`) events resolve to the *correct* user, not a hardcoded one;
- authenticated entitlement lookup (current user only).

Explicitly **not** in Phase 3A: real Paddle Live, actual curriculum
locking, production email sending, XServer deployment/migration, hosting
architecture changes, subscriptions. These remain deferred per the task
brief (Sections 0, 23, 28, 33).

## Non-goals / do-not-touch

- Learning progress (`localStorage`/Zustand) is not migrated to the
  server. Purchase identity and learning progress stay separate systems.
- Phase 2's PoC path (`SandboxUser::ID`, `entitlement.php?user_id=...`)
  is preserved as a **development-only compatibility path** so the
  existing verified Phase 2 E2E flow keeps working; it is not deleted or
  repurposed as production identity.
- No production hosting migration decision is made in this phase (see
  ADR below) — the browser session **transport** is deferred, not the
  backend identity/session **model**.

## PR structure

Three stacked PRs, in order, off `codex/paddle-webhook-entitlement-poc`
(HEAD `150488a6ee227b74147932dff8f0ade587c7401c`). None are merged.

- **PR A** — `claude/paddle-user-identity-foundation`
  Users, magic-link lifecycle, sessions, DB-backed rate limiting,
  migrations, backend tests, the cross-site-auth-transport ADR.
- **PR B** — `claude/paddle-purchase-attribution` (base = PR A branch)
  `purchase_intents`, hashed `purchase_ref`, `paddle_transactions`
  mapping, corrected transaction/refund attribution, atomic/idempotent
  webhook DB behavior, backend tests.
- **PR C** — `claude/paddle-account-test-harness` (base = PR B branch)
  Dev-only `/account-test` integration harness exercising the
  authenticated flow end-to-end, in-memory bearer token only, production
  build exclusion, frontend/integration tests, docs.

## Architecture overview

```
Browser (dev-only /account-test route, PR C)
  │ 1. POST /api/auth/request-link.php {email}
  │ 2. (out of band) magic link URL, consumed via GET/POST verify.php
  │ 3. Authorization: Bearer <session_token>  (in-memory only)
  ▼
XServer PHP (server/src/Auth/*, server/src/Purchase/*)
  │ users, magic_link_tokens, sessions, rate_limits          (PR A)
  │ purchase_intents, paddle_transactions                    (PR B)
  ▼
MariaDB (giganihongo_tmzp — additive migrations only)
  ▲
  │ verified Paddle webhook (unchanged trust model from Phase 2)
Paddle Sandbox --signed webhook--> server/paddle-webhook.php
```

The Phase 2 principle carries forward unchanged: **only a
signature-verified server-side webhook can write entitlement state.**
Nothing in Phase 3A weakens that — it only replaces *which user* the
webhook resolves to.

## 1. Data model

All additive migrations under `server/sql/migrations/`, numbered
sequentially after the Phase 2 baseline schema. Existing `payment_events`
and `entitlements` tables are unchanged in shape; `entitlements`/
`payment_events` rows created by Phase 2's PoC path keep working.

### `users`

| column | type | notes |
|---|---|---|
| `id` | `CHAR(36)` | UUIDv4, PK. Public-facing; never a sequential integer. |
| `email_normalized` | `VARCHAR(255)` | UNIQUE. Normalization: lowercase + trim only (see below). |
| `created_at` | `DATETIME` | |
| `updated_at` | `DATETIME` | |

**Email normalization** is deliberately minimal: lowercase the whole
address, trim whitespace. No Gmail dot/plus-alias folding — that is a
product decision (whether `a.b+x@gmail.com` and `ab@gmail.com` are "the
same person") independent of security, and can be added later without
breaking existing rows (it would only ever merge, not split, identities,
so it's a safe additive change). Uniqueness is enforced on the
normalized form, so two request-link calls with different casing resolve
to the same user.

No address, name, or payment data is stored. Email is login identity
only, never the entitlement primary key (entitlements/transactions key
on `users.id`).

### `magic_link_tokens`

| column | type | notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED` | PK, autoincrement |
| `user_id` | `CHAR(36)` | FK → `users.id` |
| `token_hash` | `CHAR(64)` | SHA-256 hex digest, UNIQUE. Raw token never stored. |
| `expires_at` | `DATETIME` | short-lived (15 minutes) |
| `used_at` | `DATETIME NULL` | set on first successful verify; enforces single-use |
| `created_at` | `DATETIME` | |

Raw token: `random_bytes(32)`, base64url-encoded, returned only in the
magic-link URL sent to the user (never persisted, never logged). Verify
looks up `SHA-256(candidate)` and additionally uses `hash_equals()` for
the final comparison against the fetched hash, to avoid any timing
signal beyond what the indexed lookup itself leaks.

### `sessions`

| column | type | notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED` | PK, autoincrement |
| `token_hash` | `CHAR(64)` | SHA-256 hex digest, UNIQUE. Raw token never stored. |
| `user_id` | `CHAR(36)` | FK → `users.id` |
| `expires_at` | `DATETIME` | |
| `revoked_at` | `DATETIME NULL` | set by logout |
| `created_at` | `DATETIME` | |
| `last_seen_at` | `DATETIME` | updated on each authenticated request |

Same hash-only pattern as magic-link tokens. `me.php` resolves
`Authorization: Bearer <raw>` → `SHA-256` → row lookup → checks
`revoked_at IS NULL AND expires_at > now()`.

### `rate_limits`

| column | type | notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED` | PK |
| `bucket` | `VARCHAR(32)` | `magic_link_email` \| `magic_link_ip` |
| `identifier` | `VARCHAR(128)` | normalized email, or HMAC-SHA256(ip, pepper) hex — **never** raw IP |
| `window_start` | `DATETIME` | start of the current fixed window |
| `count` | `INT UNSIGNED` | requests seen in this window |

Fixed-window counter (not sliding-log) keyed on `(bucket, identifier)`
with a UNIQUE constraint on that pair — simple `SELECT` +
`INSERT ... ON DUPLICATE KEY UPDATE count = count + 1` when
`window_start` is still current, otherwise a fresh row replaces the
window. Expired rows are pruned lazily (deleted opportunistically when a
new window starts for that identifier) — no cron dependency.

**IP handling**: the raw client IP is used only transiently in-memory to
compute `HMAC-SHA256(ip, RATE_LIMIT_IP_PEPPER)`; it is never written to
any column, log line, or error message. `RATE_LIMIT_IP_PEPPER` is a new
required config key (alongside `PADDLE_WEBHOOK_SECRET` etc.) — real
value supplied via `server/config.php`/environment, never committed;
`config.example.php` gets an empty placeholder. Rotating the pepper
invalidates only the *rate-limit key derivation* (harmless — it just
resets everyone's window), not any stored identity, so rotation is safe
and cheap.

Thresholds are configurable, not hardcoded: `RATE_LIMIT_EMAIL_PER_HOUR`
(default 5) and `RATE_LIMIT_IP_PER_HOUR` (default 20), read through the
same `Config` mechanism as other values.

### `purchase_intents` (PR B)

| column | type | notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED` | PK |
| `purchase_ref_hash` | `CHAR(64)` | SHA-256 hex digest, UNIQUE. Raw ref never stored. |
| `user_id` | `CHAR(36)` | FK → `users.id` |
| `product_key` | `VARCHAR(64)` | `full_tamamizu` (only value used) |
| `expires_at` | `DATETIME` | short-lived (e.g. 30 minutes — long enough to complete a Checkout) |
| `consumed_at` | `DATETIME NULL` | set exactly once, by the webhook, when it resolves this intent |
| `paddle_transaction_id` | `VARCHAR(64) NULL` | filled in when consumed |
| `created_at` | `DATETIME` | |

Raw `purchase_ref`: `random_bytes(32)`, base64url. Returned **once**, in
the JSON response body of `POST /api/purchase-intent.php`, to the
authenticated caller only. Never persisted, never logged (see Section 5
for the exact log-safety argument and its test).

### `paddle_transactions` (PR B)

| column | type | notes |
|---|---|---|
| `paddle_transaction_id` | `VARCHAR(64)` | PK/UNIQUE, Paddle's `txn_...` id |
| `user_id` | `CHAR(36)` | FK → `users.id` — resolved once, at first-seen time, from the intent |
| `product_key` | `VARCHAR(64)` | |
| `purchase_intent_id` | `BIGINT UNSIGNED` | FK → `purchase_intents.id` |
| `created_at` | `DATETIME` | |
| `updated_at` | `DATETIME` | |

This table is what makes refund attribution correct: a later
`adjustment.*` event carries only `data.transaction_id`, which now
resolves to a real `user_id` via this table instead of Phase 2's
hardcoded `SandboxUser::ID`.

## 2. Auth flow (PR A)

Endpoints (mirroring the existing `server/*.php` flat-file convention):

- `POST /api/auth/request-link.php` `{email}` → normalize, rate-limit
  check (email bucket, then IP bucket) **before** touching the mailer or
  the users table, generate-or-reuse the user row, issue a magic-link
  token, send via the `Mailer` interface. **Always** returns the same
  generic `200 {"status":"ok"}` regardless of whether the email exists,
  is rate-limited-and-silently-dropped-after-recording, or is malformed
  at the normalization stage — enumeration must not be distinguishable
  from response shape or (within reason) timing. Rate-limit rejection is
  recorded but not revealed to the caller.
- `POST /api/auth/verify.php` `{token}` → hash, look up, check
  `used_at IS NULL AND expires_at > now()`, mark `used_at`, create a
  session row, return `{"session_token": "<raw>", "user": {...}}` once.
  Invalid/expired/used token → generic 400, no distinction between the
  three reasons in the response (distinguishable reasons would help an
  attacker fingerprint token state).
- `GET /api/auth/me.php` → `Authorization: Bearer` → resolve session →
  `{"user_id": "...", "email_normalized": "..."}` or 401.
- `POST /api/auth/logout.php` → resolve session → set `revoked_at`.

### Mailer interface

`server/src/Auth/Mailer.php` (interface) with `FakeMailer` (records sent
messages in-memory, used by tests) as the only implementation in Phase
3A. A real SMTP/XServer-mail transport is a documented future
implementation of the same interface — **not** built now, since it needs
a real credential (human checkpoint, Section 21). No production email is
ever sent by this phase's code.

## 3. Session transport abstraction (the deferred part)

Per your instruction, only the **backend** session model is built now;
the **browser transport** decision (bearer-with-refresh vs.
`SameSite=None` cookie vs. same-site hosting migration) is deferred.

Frontend: `src/lib/auth/sessionTransport.ts` defines a small
`SessionTransport` interface (`getToken()`, `setToken()`, `clear()`).
The only implementation built in Phase 3A is `InMemorySessionTransport`
— a module-scoped variable, cleared on page reload, **never**
`localStorage`/`sessionStorage`. This is used exclusively by PR C's
dev-only harness to hold the bearer token for manual
`Authorization: Bearer` headers, explicitly as a test harness for the
backend flow — not a production transport decision. A future phase
swaps in whichever transport the ADR below resolves to, behind the same
interface, without touching `server/src/Auth/*`.

### ADR: cross-site auth transport (PR A)

`docs/adr/0001-cross-site-auth-transport.md` records:

- **Context**: frontend on `github.io`, API on `giganihongo.com` —
  genuinely cross-site. SameSite cookie restrictions, Safari/iOS ITP,
  PWA storage-partitioning behavior, and mobile browser quirks all bear
  on this.
- **Option A — Bearer token, browser-held**: no cookies; avoids
  SameSite/ITP entirely; residual risk is XSS-driven token theft,
  mitigated by short-lived/rotating tokens and the fact that the only
  thing behind a session is an entitlement flag (no PII, no payment
  data). Silent on *where* the browser holds it long-term — that's
  still open (in-memory-only loses the session on reload, which is a
  real UX cost a production choice must weigh).
- **Option B — `SameSite=None; Secure` cookie**: keeps the
  familiar cookie model, but the task brief's own research flag (Section
  11) and current browser vendor direction (Safari ITP, Chrome's
  third-party cookie changes) make this an increasingly fragile bet for
  a cross-site PWA-capable app.
- **Option C — migrate frontend to `tamamizu.giganihongo.com`**: makes
  the problem disappear (same-site), but is a hosting/deployment
  decision (GitHub Pages → XServer or a proxy) outside this phase's
  scope and cost.
- **Recommendation stated, decision deferred**: leans toward A for
  reliability across Safari/iOS/PWA, but explicitly leaves the concrete
  choice (and the "where does a bearer token live across reloads"
  sub-question) as the human checkpoint from Section 33(A) of the task
  brief.

## 4. Purchase attribution (PR B)

### `POST /api/purchase-intent.php` (authenticated only)

1. Resolve current user from session (401 if absent/invalid).
2. Generate raw `purchase_ref = random_bytes(32)` → base64url.
3. Insert `purchase_intents` row: `purchase_ref_hash = SHA-256(raw)`,
   `user_id` = current user, `product_key = 'full_tamamizu'`,
   `expires_at = now() + 30min`.
4. Return `{"purchase_ref": raw}` — **this is the only place the raw
   value ever exists outside the caller's process memory.** It is never
   written to a log line (grep-tested, see Section 6) and never appears
   in an exception message.

Frontend (PR C) passes it to Paddle: `customData: { purchase_ref }`.
`internal_user_id` is removed from the Phase 3A path entirely — the
browser cannot specify who receives entitlement.

### Webhook changes (`WebhookHandler`, PR B)

`transaction.completed` handling adds, before activating entitlement:

1. Extract `custom_data.purchase_ref` (was `internal_user_id`).
2. `SHA-256` it, look up `purchase_intents` by `purchase_ref_hash`.
3. Reject (safely ignore, HTTP 200, no unlock) if: not found, already
   `consumed_at`, or `expires_at` has passed.
4. Confirm `product_key` on the intent matches the transaction's
   verified price/product (existing `matchesFullTamamizu()` check is
   unchanged and still required — the intent's `product_key` and the
   transaction's actual line items must **both** independently match;
   an intent alone is not sufficient proof of what was purchased).
5. In one DB transaction: mark the intent `consumed_at`, insert into
   `paddle_transactions` (`paddle_transaction_id`, `user_id` from the
   intent, `product_key`, `purchase_intent_id`), record `payment_events`
   (unchanged shape), UPSERT `entitlements` for that resolved `user_id`.

This replaces trusting a browser-supplied `internal_user_id` with
trusting only what the intent row (created earlier by an authenticated
server call) says — the browser only ever gets to say "attempt this
specific pre-authorized intent," never "credit this user."

**Atomicity (Section 17)**: Phase 2 used a portable
SELECT-then-INSERT/UPDATE specifically so tests could run against
SQLite. Phase 3A keeps that same repository working for SQLite-backed
tests, but the production MariaDB path additionally uses
`INSERT ... ON DUPLICATE KEY UPDATE` for the entitlement upsert,
selected via a small capability check on the PDO driver name
(`sqlite` → old portable path for tests; `mysql` → atomic upsert). The
whole intent-consume → transaction-insert → entitlement-upsert sequence
runs inside a single `PDO` transaction (`beginTransaction`/`commit`/
`rollBack`), so a mid-sequence failure leaves no partial state — the
event is retried safely by Paddle (any exception before commit surfaces
as a 500, not a 200, so Paddle retries; the idempotency check on
`payment_events.paddle_event_id` still prevents double-processing on
that retry once the first attempt's transaction *did* commit).

### Refund handling (PR B)

`adjustment.*` (action=refund): `data.transaction_id` → look up
`paddle_transactions` → resolve `user_id` → revoke **that** user's
`(user_id, product_key)` entitlement. Unknown `transaction_id` (not in
`paddle_transactions` — e.g. a Phase 2 PoC-path transaction, or a
transaction for a different product this system doesn't track) is
safely acknowledged (200, event recorded for idempotency) without
touching any entitlement row. This directly fixes Phase 2's known
limitation: refunds now attribute to the transaction's actual buyer,
not a fixed constant.

## 5. Dev-only integration harness (PR C)

`/account-test` (parallel convention to `/paddle-test`): request a magic
link (using `FakeMailer`'s recorded output, surfaced only in this
dev-only page, to self-serve the link without real email), verify it,
receive a session token held in `InMemorySessionTransport`, exercise
`me.php`, `purchase-intent.php`, and pass the returned `purchase_ref`
into the existing `/paddle-test` Paddle Sandbox Checkout flow's
`customData`, then check `entitlement.php` for the authenticated user.

Excluded from production builds via the same mechanism already proven
for `/paddle-test` (dynamic import + route guard checked by
`src/App.paddle.test.tsx`'s existing pattern) — PR C extends that same
test file/pattern rather than inventing a new one.

## 6. Security self-review checklist (applied before each PR is opened)

- Client-supplied user id cannot influence entitlement (`purchase_ref`
  is opaque, server-generated, pre-bound to a user at authenticated
  intent-creation time).
- Magic-link and session tokens: hash-only at rest, `hash_equals()` on
  final comparison, single-use enforced by `used_at`/`consumed_at`,
  short expiry.
- `purchase_ref`: hash-only at rest (test asserts no raw value appears
  in any table dump across the full request-intent → webhook-consume
  flow); never logged (test greps `error_log`/exception-message call
  sites in the touched files for accidental interpolation of the raw
  value).
- Rate limiting: no raw IP ever persisted (test asserts the `identifier`
  column never equals or contains the plain IP used in the test); email
  enumeration-safe generic responses.
- CORS allowlist unchanged in shape (explicit list, no wildcard);
  extended only with new same-origin-pattern entries if needed for
  `/account-test` (expected: none, since it's the same frontend origin).
- Refund cannot cross-revoke another user's entitlement (direct test).
- No secret (pepper, webhook secret, DB credentials) enters git, an
  example config, a log line, or this document.

## Tests (both PHP `server/tests/` and Vitest, extending existing patterns)

**PR A** — users (create, lookup, email normalization, duplicate
rejection), magic-link (secure generation, hash storage, expiry,
single-use, replay rejection, invalid-token generic response,
enumeration-safe request-link response), sessions (create, expire,
revoke/logout, invalid-token rejection), rate limiter (per-email limit,
per-IP limit, one-IP-cycling-many-emails still blocked, one-email-
across-many-IPs still blocked, raw IP never persisted, generic response
under rate-limiting).

**PR B** — purchase intent (authenticated-user-only issuance, random/
unpredictable ref, wrong-product rejected, expired rejected, consumed
(single-use) rejected, another user cannot claim someone else's intent,
**raw `purchase_ref` never appears in any persisted row** — asserted by
dumping the relevant tables after a full flow and asserting the raw
value is absent while its hash is present), webhook (correct
`purchase_ref` grants the correct user; a browser-supplied
`internal_user_id`-shaped field is ignored/has no code path; unknown
`purchase_ref` → no unlock; wrong price/product → no unlock; duplicate
event → idempotent; `paddle_transactions` row created; refund resolves
`transaction_id` → correct user; refund cannot revoke a different user;
unknown `transaction_id` on refund is safe/no-op).

**PR C** — dev-only route excluded from production build (extends
`App.paddle.test.tsx`); purchase-intent fetch happens only when
authenticated; `purchase_ref` (and never `internal_user_id`) is what
reaches Paddle's `customData`; auth/session errors render as recoverable
UI state, not unhandled exceptions; token is never written to
`localStorage`/`sessionStorage` (test spies on both Storage APIs across
the flow and asserts zero writes).

## Verification

Each PR: `php server/tests/run-tests.php` (all passing, count reported),
`npm run verify`, `git diff --check`, full self-diff review per
`docs/definition-of-done.md`. No XServer deployment is performed in any
of the three PRs — all verification is local/CI.

## Deferred to later phases

- Concrete browser session transport decision (ADR leaves it open).
- Real SMTP/email credential and any real customer email send.
- XServer migration/deployment of the new schema and endpoints.
- Actual curriculum paywall/locking, restore-purchase UI, subscriptions.
- Cross-device learning-progress sync.
- Gmail-style email alias normalization (safe additive follow-up).
- Chargeback/dispute action handling beyond Phase 2's existing
  safely-ignored behavior.
