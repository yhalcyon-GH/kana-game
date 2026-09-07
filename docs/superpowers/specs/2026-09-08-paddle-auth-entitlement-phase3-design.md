# Phase 3A design — real-user identity + secure purchase attribution foundation

Status: revised per ChatGPT review (2026-09-08 rev. 2). Supersedes
rev. 1 of this same file (revision history at the bottom). Extends
[`docs/paddle-webhook-poc.md`](../../paddle-webhook-poc.md) (Phase 2) and
[`docs/paddle-sandbox-checkout.md`](../../paddle-sandbox-checkout.md)
(Phase 1).

## Goal

Replace Phase 2's fixed `sandbox-test-user` attribution with a real,
minimal identity and secure purchase-attribution foundation:

- real internal users, keyed by an unguessable public id, created only
  after a successful Magic Link verification;
- Magic Link authentication (request → verify → session) with a token
  transport that never lands in an HTTP server access log;
- server-generated, hashed-at-rest `purchase_ref` binding an authenticated
  user to a Paddle Checkout attempt — never a browser-supplied user id;
- a per-transaction grant ledger so entitlement is *derived* from the set
  of currently-valid purchases for a user/product, correctly surviving
  out-of-order webhook delivery, repurchase-after-refund, and partial
  refunds — not a single boolean flipped by "whichever event arrived
  most recently";
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
  Users (created at verify-time), magic-link lifecycle (atomic
  consume + session issuance), sessions, DB-backed rate limiting
  (HMAC-keyed for both email and IP), migrations, backend tests, the
  cross-site-auth-transport ADR.
- **PR B** — `claude/paddle-purchase-attribution` (base = PR A branch)
  `purchase_intents` (atomic single-use consume), hashed `purchase_ref`,
  the transaction-grant ledger, pending-adjustment reconciliation for
  out-of-order webhooks, corrected transaction/refund attribution,
  atomic/idempotent webhook DB behavior, backend tests.
- **PR C** — `claude/paddle-account-test-harness` (base = PR B branch)
  Dev-only `/account-test` integration harness exercising the
  authenticated flow end-to-end, in-memory bearer token only, a
  dev-only out-of-band link-retrieval path that is never part of the
  production deployment, production build exclusion, frontend/
  integration tests, docs.

## Architecture overview

```
Browser (dev-only /account-test route, PR C)
  │ 1. POST /api/auth/request-link.php {email}
  │ 2. Magic link URL, fragment-encoded token: .../#/verify?token=...
  │    Frontend reads the fragment, clears it from history, then
  │    POSTs the token in the request body to verify.php.
  │ 3. Authorization: Bearer <session_token>  (in-memory only)
  ▼
XServer PHP (server/src/Auth/*, server/src/Purchase/*)
  │ users, magic_link_tokens, sessions, rate_limits          (PR A)
  │ purchase_intents, transaction_grants, pending_adjustments (PR B)
  ▼
MariaDB (giganihongo_tmzp — additive migrations only)
  ▲
  │ verified Paddle webhook (unchanged trust model from Phase 2)
Paddle Sandbox --signed webhook--> server/paddle-webhook.php
```

The Phase 2 principle carries forward unchanged: **only a
signature-verified server-side webhook can write entitlement state.**
Nothing in Phase 3A weakens that — it only replaces *which user* the
webhook resolves to, and replaces "last event wins" with "entitlement is
recomputed from the full set of currently-valid grants."

## 1. Data model

All additive migrations under `server/sql/migrations/`, numbered
sequentially after the Phase 2 baseline schema. Existing `payment_events`
and `entitlements` tables are unchanged in shape; `entitlements`/
`payment_events` rows created by Phase 2's PoC path keep working.
`entitlements` becomes a **materialized cache** recomputed from
`transaction_grants` (see Section 4) rather than a value any single event
writes directly.

### `users`

| column | type | notes |
|---|---|---|
| `id` | `CHAR(36)` | UUIDv4, PK. Public-facing; never a sequential integer. |
| `email_normalized` | `VARCHAR(255)` | UNIQUE. Normalization: lowercase + trim only (see below). |
| `created_at` | `DATETIME` | |
| `updated_at` | `DATETIME` | |

A `users` row is created **only inside a successful `verify.php` call**,
not at `request-link.php` time (see Section 2 — "durable user creation
timing"). There is deliberately no unauthenticated code path that creates
a durable user record.

**Email normalization** is deliberately minimal: lowercase the whole
address, trim whitespace. No Gmail dot/plus-alias folding is performed,
and **none is planned as an automatic future change** — merging two
existing `users` rows because they're judged to be "the same person"
would move purchase history and entitlement between accounts, which is a
data-integrity/security decision requiring an explicit, reviewed,
human-approved migration if it's ever wanted, not a mechanical default.
Uniqueness is enforced on the normalized (lowercase+trim) form only, so
two request-link calls that differ only in casing resolve to the same
pending/created user.

No address, name, or payment data is stored. Email is login identity
only, never the entitlement primary key (entitlements/transactions key
on `users.id`).

### `magic_link_tokens`

| column | type | notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED` | PK, autoincrement |
| `email_normalized` | `VARCHAR(255)` | the pending identity — see below |
| `user_id` | `CHAR(36) NULL` | FK → `users.id`; NULL until a matching user exists |
| `token_hash` | `CHAR(64)` | SHA-256 hex digest, UNIQUE. Raw token never stored. |
| `expires_at` | `DATETIME` | short-lived (15 minutes) |
| `used_at` | `DATETIME NULL` | set atomically on first successful verify; enforces single-use |
| `created_at` | `DATETIME` | |

**Durable user creation timing (point 7)**: `request-link.php` stores the
normalized email directly on the `magic_link_tokens` row (`user_id`
left `NULL`) — it does **not** create or touch a `users` row, so an
unauthenticated caller who merely requests a link for an email address
can never cause a durable account to exist. `verify.php` is the only
place a `users` row is created: inside the same DB transaction as the
atomic token-consume (see below), it looks up `users` by
`email_normalized`, creates the row if absent, then proceeds to session
creation. This means "requesting a link" is fully reversible/side-effect
-free at the identity layer; only a completed verification durably
creates an account.

Raw token: `random_bytes(32)`, base64url-encoded. Transport is specified
in Section 5 (point 5) — never a query string logged by a standard HTTP
access log. Verify looks up `SHA-256(candidate)` and additionally uses
`hash_equals()` for the final comparison against the fetched hash, to
avoid any timing signal beyond what the indexed lookup itself leaks.

**Atomic single-use consume (point 4)**: verification does not
SELECT-then-UPDATE. It runs, inside one DB transaction:

```sql
UPDATE magic_link_tokens
SET used_at = NOW()
WHERE token_hash = :hash AND used_at IS NULL AND expires_at > NOW()
```

and checks the driver-reported **affected row count**. Exactly one
concurrent request can ever see `affected_rows = 1` for a given token;
every other simultaneous request (retry, double-click, replay) sees `0`
and is rejected as invalid/expired/used (same generic error, no
distinction — see Section 2). Only the winner proceeds, within the same
transaction, to resolve/create the `users` row and insert the `sessions`
row, then commits. This closes the race a plain
"check `used_at`, then separately `UPDATE`" pattern would allow.

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

**This is a real account credential, not merely an "entitlement flag"
token** — see the ADR revision in Section 3: a valid session can read the
account's own email (`me.php`) and authorize creation of a new purchase
intent bound to that account. It is treated with the same care as any
authentication session (short-lived, hash-only at rest, revocable),
not as a low-value token.

### `rate_limits`

| column | type | notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED` | PK |
| `bucket` | `VARCHAR(32)` | `magic_link_email` \| `magic_link_ip` |
| `identifier` | `VARCHAR(128)` | HMAC-SHA256(value, pepper) hex — **never** the raw email or raw IP |
| `window_start` | `DATETIME` | start of the current fixed window |
| `count` | `INT UNSIGNED` | requests seen in this window |

**HMAC for both buckets (point 7)**: both the email-keyed bucket and the
IP-keyed bucket store `HMAC-SHA256(value, RATE_LIMIT_PEPPER)`, not the
raw email or a plain/salted hash. Using HMAC uniformly (rather than
storing the normalized email directly for one bucket and hashing only
the IP) means a `rate_limits` table leak alone does not reveal which
real email addresses have requested links — consistent with treating
both identifiers as sensitive lookup keys, not display data. Reusing one
pepper for both buckets is acceptable because the two bucket namespaces
(`magic_link_email` vs `magic_link_ip`) are already domain-separated in
the HMAC input (see below), so cross-bucket collision isn't a concern;
`RATE_LIMIT_PEPPER` is a new required config key, real value supplied
via `server/config.php`/environment, never committed, empty placeholder
in `config.example.php`. Rotating the pepper only resets everyone's
window (harmless), never any stored identity.

Fixed-window counter (not sliding-log) keyed on `(bucket, identifier)`
with a UNIQUE constraint on that pair — simple `SELECT` +
`INSERT ... ON DUPLICATE KEY UPDATE count = count + 1` when
`window_start` is still current, otherwise a fresh row replaces the
window. Expired rows are pruned lazily (deleted opportunistically when a
new window starts for that identifier) — no cron dependency.

**Client IP resolution (point 7)**: the raw client IP used to compute
the HMAC is taken from `$_SERVER['REMOTE_ADDR']` only. **`X-Forwarded-
For` (or any other proxy header) is not trusted unless and until a
specific trusted-proxy configuration is added** — an untrusted
`X-Forwarded-For` is trivially attacker-controlled and would let an
attacker pick their own IP-rate-limit bucket, defeating the limiter
entirely. If XServer deployment turns out to sit behind a proxy that
makes `REMOTE_ADDR` the proxy's own address (a real possibility worth
checking during deployment, out of scope for this phase's local
verification), that is a deployment-time finding requiring an explicit,
reviewed trusted-proxy allowlist change — not an assumption made here.

Thresholds are configurable, not hardcoded: `RATE_LIMIT_EMAIL_PER_HOUR`
(default 5) and `RATE_LIMIT_IP_PER_HOUR` (default 20), read through the
same `Config` mechanism as other values.

### `purchase_intents` (PR B)

| column | type | notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED` | PK |
| `purchase_ref_hash` | `CHAR(64)` | SHA-256 hex digest, UNIQUE. Raw ref never stored **in our DB**. |
| `user_id` | `CHAR(36)` | FK → `users.id` |
| `product_key` | `VARCHAR(64)` | `full_tamamizu` (only value used) |
| `expires_at` | `DATETIME` | short-lived (e.g. 30 minutes — long enough to complete a Checkout) |
| `consumed_at` | `DATETIME NULL` | set atomically, exactly once, by the webhook, when it resolves this intent |
| `paddle_transaction_id` | `VARCHAR(64) NULL` | filled in atomically with `consumed_at` |
| `created_at` | `DATETIME` | |

**Corrected purchase_ref guarantee (point 6)**: the raw `purchase_ref`
is **intentionally** sent to Paddle as `customData.purchase_ref` and
Paddle stores it in the transaction's `custom_data` on Paddle's own
systems — it is not a secret from Paddle, and it is not true that it
"exists only in caller memory." **Our guarantee is narrower and is the
one that actually matters for this design**: the raw `purchase_ref` is
never persisted in *our* database and never written to *our* logs — only
`SHA-256(purchase_ref)` is ever stored, in `purchase_intents
.purchase_ref_hash`. The webhook re-hashes the value Paddle echoes back
and looks it up by that hash; it never needs the raw value for anything
but computing that one comparison. This preserves every other property:
32-byte cryptographically random generation, hash-only storage on our
side, expiry, user/product binding at issuance time, and single-use
enforcement.

**Atomic single-use consume (point 4)**: exactly like magic-link tokens,
the webhook does not SELECT-then-UPDATE. It runs:

```sql
UPDATE purchase_intents
SET consumed_at = NOW(), paddle_transaction_id = :txn_id
WHERE purchase_ref_hash = :hash AND consumed_at IS NULL AND expires_at > NOW()
```

and checks affected-row-count. Only one of two concurrent
`transaction.completed` deliveries racing on the same `purchase_ref` (a
genuine possibility if, for instance, a user double-submits a Checkout
attempt reusing a client-side-cached intent, or Paddle redelivers
concurrently with a legitimate first delivery) can ever win this UPDATE;
the loser sees `0` affected rows and is treated as "intent already
consumed" — safely ignored, no second grant created. See Section 6 for
the dedicated test.

### `transaction_grants` (PR B, replaces the flatter `paddle_transactions` from rev. 1)

Point 2 requires tracking entitlement per Paddle transaction rather than
a single mutable row per user/product, so that a refund/adjustment tied
to an *old* transaction can never revoke a *later, still-valid*
transaction's grant for the same user/product.

| column | type | notes |
|---|---|---|
| `paddle_transaction_id` | `VARCHAR(64)` | PK/UNIQUE, Paddle's `txn_...` id |
| `user_id` | `CHAR(36)` | FK → `users.id` — resolved once, at first-seen time, from the intent |
| `product_key` | `VARCHAR(64)` | |
| `purchase_intent_id` | `BIGINT UNSIGNED` | FK → `purchase_intents.id`. **`UNIQUE`** (point 4) — a second transaction can never attach to an intent already claimed by another transaction; combined with the intent's own atomic consume above, this is belt-and-suspenders against any double-grant from one intent. |
| `status` | `VARCHAR(24)` | `active` \| `refund_pending` \| `refunded` \| `chargeback_pending` \| `chargeback` — see Section 4's lifecycle. Starts `active` on creation. |
| `granted_at` | `DATETIME` | the `occurred_at` of the granting `transaction.completed` event (not wall-clock processing time) |
| `status_changed_at` | `DATETIME` | the `occurred_at` of the event that most recently changed `status`, used for out-of-order comparison (point 1) |
| `created_at` | `DATETIME` | |
| `updated_at` | `DATETIME` | |

A user/product's current entitlement is **derived**: active if and only
if at least one `transaction_grants` row for that `(user_id,
product_key)` has `status = 'active'`. This directly satisfies point 2 —
refunding old transaction A never touches transaction B's row, so a
repurchase after a refund (a new transaction, a new grant row, status
`active`) keeps the user entitled regardless of what happens to A's
row, and an out-of-order arrival of A's refund after B's purchase still
only ever updates A's row.

### `pending_adjustments` (PR B, new — point 1)

Paddle does not guarantee webhook delivery order. An `adjustment.*`
event can arrive before the `transaction.completed` event for the
transaction it refers to (Paddle retries independently per notification;
there is no documented ordering guarantee between distinct event
deliveries — treating arrival order as delivery order would be an
unverified assumption, which the task brief requires not making). This
table lets such an adjustment be safely held and reconciled once its
transaction becomes known, instead of being permanently no-op'd.

| column | type | notes |
|---|---|---|
| `id` | `BIGINT UNSIGNED` | PK |
| `paddle_transaction_id` | `VARCHAR(64)` | the transaction this adjustment refers to; not yet in `transaction_grants` when this row is created |
| `paddle_event_id` | `VARCHAR(64)` | UNIQUE — the specific `adjustment.*` event, for idempotent reconciliation |
| `action` | `VARCHAR(24)` | `refund` (only handled value; others recorded, not reconciled — see Section 4) |
| `adjustment_status` | `VARCHAR(24)` | Paddle's own `data.status` on the adjustment (see Section 4) |
| `occurred_at` | `DATETIME` | Paddle's `occurred_at` for this event — used for ordering at reconciliation time |
| `reconciled_at` | `DATETIME NULL` | set once a matching `transaction_grants` row appears and this adjustment has been applied to it |
| `created_at` | `DATETIME` | |

**Reconciliation**: whenever a `transaction.completed` event creates a
new `transaction_grants` row, the webhook handler — in the same DB
transaction — checks `pending_adjustments` for any unreconciled row
matching that `paddle_transaction_id`. If the pending adjustment's
`occurred_at` is after the grant's `granted_at` (the normal case — a
refund logically follows its purchase), it is applied immediately
(status transition per Section 4) and marked `reconciled_at`. Any
adjustment additionally received for an already-known transaction
follows the immediate (non-pending) path described in Section 4 and
never touches this table. See Section 6 for the required
adjustment-before-transaction test.

## 2. Auth flow (PR A)

Endpoints (mirroring the existing `server/*.php` flat-file convention):

- `POST /api/auth/request-link.php` `{email}` → normalize, rate-limit
  check (email bucket, then IP bucket) **before** touching the mailer or
  the users table, issue a magic-link token bound to the normalized
  email (no `users` row touched — see "durable user creation timing"
  above), send via the `Mailer` interface. **Always** returns the same
  generic `200 {"status":"ok"}` regardless of whether the email is
  already registered, is rate-limited-and-silently-dropped-after-
  recording, or is malformed at the normalization stage — enumeration
  must not be distinguishable from response shape or (within reason)
  timing. Rate-limit rejection is recorded but not revealed to the
  caller.
- `POST /api/auth/verify.php` `{token}` → atomic conditional consume
  (see above), resolve-or-create the `users` row from the token's
  `email_normalized`, create a session row, return
  `{"session_token": "<raw>", "user": {...}}` once, all inside one DB
  transaction. Invalid/expired/already-used token (affected-row-count
  0) → generic 400, no distinction between the three reasons in the
  response (distinguishable reasons would help an attacker fingerprint
  token state).
- `GET /api/auth/me.php` → `Authorization: Bearer` → resolve session →
  `{"user_id": "...", "email_normalized": "..."}` or 401.
- `POST /api/auth/logout.php` → resolve session → set `revoked_at`.

### Mailer interface

`server/src/Auth/Mailer.php` (interface) with `FakeMailer` (records sent
messages in an in-memory array, used only by same-process PHP unit
tests) as the only implementation in Phase 3A. **`FakeMailer`'s
in-memory state does not and cannot survive across separate HTTP
requests** — each PHP-FPM/CGI request is a fresh process, so a
`request-link.php` call and a later browser action are different
processes with no shared memory. `FakeMailer` is therefore explicitly
scoped to `server/tests/` only; see Section 5 for how the dev-only
harness actually retrieves a generated link across real HTTP requests.

A real SMTP/XServer-mail transport is a documented future implementation
of the `Mailer` interface — **not** built now, since it needs a real
credential (human checkpoint, Section 21 of the task brief). No
production email is ever sent by this phase's code.

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

### ADR: cross-site auth transport (PR A) — revised threat framing

`docs/adr/0001-cross-site-auth-transport.md` records:

- **Context**: frontend on `github.io`, API on `giganihongo.com` —
  genuinely cross-site. SameSite cookie restrictions, Safari/iOS ITP,
  PWA storage-partitioning behavior, and mobile browser quirks all bear
  on this.
- **What the session token actually is (corrected framing, point on
  ADR)**: a Phase 3A session is a **real account authentication
  credential**, not merely a flag saying "entitlement active/inactive."
  A valid session can read the account's own email
  (`GET /api/auth/me.php`) and can authorize creation of a new purchase
  intent bound to that account
  (`POST /api/purchase-intent.php`). The transport decision must
  therefore be evaluated with the same rigor as any account-session
  transport decision — XSS-driven theft of this token is account
  takeover for a low-PII account, not merely "someone finds out an
  entitlement flag" — not treated as low-stakes because the account
  holds no payment/address data itself.
- **Option A — Bearer token, browser-held**: no cookies; avoids
  SameSite/ITP entirely; the residual risk is XSS-driven token theft,
  which is account takeover (see above) — mitigated by short-lived,
  rotating tokens, but this is a real mitigation for a real risk, not a
  reason to discount the risk. Silent on *where* the browser holds it
  long-term — that's still open (in-memory-only loses the session on
  reload, which is a real UX cost a production choice must weigh).
- **Option B — `SameSite=None; Secure` cookie**: keeps the familiar
  cookie model, but the task brief's own research flag (Section 11) and
  current browser vendor direction (Safari ITP, Chrome's third-party
  cookie changes) make this an increasingly fragile bet for a
  cross-site PWA-capable app.
- **Option C — migrate frontend to `tamamizu.giganihongo.com`**: makes
  the problem disappear (same-site), but is a hosting/deployment
  decision (GitHub Pages → XServer or a proxy) outside this phase's
  scope and cost.
- **Recommendation stated, decision deferred**: leans toward A for
  reliability across Safari/iOS/PWA, but explicitly leaves the concrete
  choice (and the "where does a bearer token live across reloads"
  sub-question) as the human checkpoint from Section 33(A) of the task
  brief. The production browser transport is not chosen in Phase 3A.

## 4. Purchase attribution and entitlement derivation (PR B)

### `POST /api/purchase-intent.php` (authenticated only)

1. Resolve current user from session (401 if absent/invalid).
2. Generate raw `purchase_ref = random_bytes(32)` → base64url.
3. Insert `purchase_intents` row: `purchase_ref_hash = SHA-256(raw)`,
   `user_id` = current user, `product_key = 'full_tamamizu'`,
   `expires_at = now() + 30min`.
4. Return `{"purchase_ref": raw}`. Per Section 1's corrected guarantee:
   this raw value is deliberately sent onward to Paddle by the caller —
   our commitment is only that it is never written to our DB or logs.

Frontend (PR C) passes it to Paddle: `customData: { purchase_ref }`.
`internal_user_id` is removed from the Phase 3A path entirely — the
browser cannot specify who receives entitlement.

### Webhook: `transaction.completed`

1. Extract `custom_data.purchase_ref` (was `internal_user_id`).
2. `SHA-256` it, attempt the atomic consume UPDATE from Section 1.
   Affected rows = 0 → safely ignore (not found, already consumed, or
   expired) — HTTP 200, event still recorded in `payment_events` for
   idempotency, no grant created.
3. Confirm `product_key` on the intent matches the transaction's
   verified price/product (existing `matchesFullTamamizu()` check is
   unchanged and still required — the intent's `product_key` and the
   transaction's actual line items must **both** independently match).
4. In the same DB transaction as step 2's UPDATE: insert a
   `transaction_grants` row (`status = 'active'`,
   `granted_at = occurred_at`, `status_changed_at = occurred_at`),
   record `payment_events` (unchanged shape), then **recompute**
   `entitlements` for `(user_id, product_key)` (see "Entitlement
   recomputation" below), then check `pending_adjustments` for this
   `paddle_transaction_id` and reconcile any found (Section 1).

This replaces trusting a browser-supplied `internal_user_id` with
trusting only what the intent row (created earlier by an authenticated
server call) says.

### Webhook: `adjustment.created` / `adjustment.updated`

Point 3 requires modeling Paddle's actual adjustment status lifecycle
instead of treating every `action=refund` event as an immediate,
irreversible revoke:

1. Extract `data.transaction_id`, `data.action`, `data.status` (Paddle's
   adjustment status — confirmed values from the docs re-read for this
   revision: `pending_approval`, `approved`, `rejected` are the
   documented lifecycle states on an adjustment; see "Explicitly
   unconfirmed" below for what remains unverified).
2. If `action` is not `refund`: same as Phase 2 — chargeback-family
   actions are recognized but not acted on (safely ignored, event
   recorded, no entitlement effect). **Not changed by this revision** —
   still explicitly deferred, see Phase 2's "Known limitations."
3. If `action == 'refund'`:
   - Look up `transaction_grants` by `paddle_transaction_id`.
   - **Not found** (transaction unknown — could be a not-yet-arrived
     `transaction.completed`, a Phase 2 PoC-path transaction, or an
     unrelated product): insert into `pending_adjustments`
     (unreconciled) rather than permanently dropping it — this is
     exactly point 1's requirement. Return HTTP 200 (safely queued, not
     an error Paddle should retry for).
   - **Found**: apply the status transition:
     - `data.status == 'pending_approval'` → set
       `transaction_grants.status = 'refund_pending'`. **Entitlement is
       not revoked yet** — a pending refund is not a confirmed refund
       (point 3's explicit requirement not to treat every `action=
       refund` event as an irreversible final revoke). Recompute
       `entitlements` anyway (a no-op here, since `refund_pending` is
       not `active` in isolation — see below).
     - `data.status == 'approved'` → set
       `transaction_grants.status = 'refunded'`. Recompute
       `entitlements`.
     - `data.status == 'rejected'` → set `transaction_grants.status`
       back to `'active'` (the refund attempt did not succeed; the
       original grant stands). Recompute `entitlements`.
   - Every transition only ever updates **that one transaction's** row,
     compares the incoming event's `occurred_at` against the row's
     `status_changed_at` and **discards (safely ignores, still records
     `payment_events` for idempotency) any event older than the row's
     current `status_changed_at`** — this is point 1's ordering rule
     applied to updates, not just to the pending case, so a
     late-arriving stale status transition can't undo a newer one.

**Entitlement recomputation**: after any `transaction_grants` write,
recompute `entitlements.active` for that `(user_id, product_key)` as
`EXISTS(SELECT 1 FROM transaction_grants WHERE user_id = :u AND
product_key = :p AND status = 'active')` and UPSERT the cached
`entitlements` row to that result (point 2's explicit requirement:
recompute from valid non-revoked purchases, not "trust the last event"). Because
this recomputation only ever reads the full current set of grant rows
for that user/product, a refund on old transaction A can never revoke a
later transaction B's grant — B's row is untouched, so the `EXISTS`
check still finds it.

**Partial refunds (point 3, explicit deferral)**: Paddle's
`data.type` on an adjustment (`full` vs `partial`) is read and recorded,
but Phase 3A's status model above treats `approved` the same way
regardless of `type` — a partial refund still moves that transaction's
grant to `refunded` (all-or-nothing per transaction, matching Phase 2's
existing simplification). **This is an explicit, documented
simplification, not partial-refund support** — proportional/partial
entitlement is out of scope for a binary "owns Full Tamamizu or not"
product and is not needed unless a future product introduces partial-
value tiers. **Live rollout must not reuse Phase 2's even-simpler
"any refund event = instant final revoke, no status check at all"
behavior** — Phase 3A's `pending_approval`/`approved`/`rejected`
handling above is required before any Live Paddle rollout, per your
explicit instruction.

**Explicitly unconfirmed** (carried forward and extended from Phase 2's
own docs, not newly guessed for this revision): whether
`chargeback_reverse` should restore a grant a `chargeback` had revoked
remains unconfirmed against a canonical reference and is **not**
implemented — chargeback-family actions stay fully deferred, unchanged
from Phase 2. Re-verify current Paddle docs directly before ever
implementing chargeback handling.

## 5. Magic-link token transport and the dev-only harness (point 5)

**Production-shaped transport** (built and tested in PR A, used by PR C
regardless of what real email delivery looks like later):

1. The link sent to a user has the form
   `https://<frontend-origin>/kana-game/#/verify?token=<raw>` — the
   token lives in the **URL fragment** (`#...`), which browsers never
   send to any HTTP server, so it cannot appear in an XServer/CDN access
   log no matter how the link is eventually delivered.
2. On load, the `/verify` route (HashRouter-compatible, matching this
   app's existing routing) reads the token from
   `window.location.hash`/the router's own fragment parsing, then
   immediately calls `history.replaceState` (or the router's
   equivalent) to strip the token from the visible URL and browser
   history **before** making any network request — so it isn't left
   sitting in history, and a screenshot/shoulder-surf of the address
   bar after the initial render no longer shows it.
3. The frontend then `POST`s the token in the **request body** to
   `verify.php` (never a query string) — so it doesn't appear in a
   server access log for *that* request either, and isn't repeatable
   from browser history/back-button.

**Dev-only harness link retrieval (point 5's second half)**: since
`FakeMailer` cannot bridge separate HTTP requests, and this phase sends
no real email, PR C needs its own explicit, clearly-dev-only path to
surface a generated link for manual testing:

- A new dev-only endpoint, e.g. `server/dev-only/last-magic-link.php`,
  gated on a `DEV_HARNESS_ENABLED` config flag that **defaults to
  absent/false** and must be explicitly set truthy in a local dev
  config — never set on any deployed XServer config by default. When
  enabled, `request-link.php` additionally writes the just-issued raw
  token to a small dev-only, gitignored local store (a single-row table
  or a gitignored local file — exact mechanism decided at
  implementation time, documented in the PR) purely so
  `last-magic-link.php` can hand the current `/account-test` session
  the link it just requested, without needing real email.
- This endpoint is **excluded from the production server deployment
  manifest** documented for Xserver upload (Section 28 of the task
  brief) — the deployment doc explicitly lists `server/dev-only/` as
  "do not upload," the same way `server/tests/` already is in Phase 2's
  docs.
- A startup/self-check test (PR C) asserts `DEV_HARNESS_ENABLED` is
  false-by-default when no config value is set, so a forgotten config
  flag can't silently ship this in production.
- This is a test harness for exercising the real backend flow — it does
  not change what `verify.php`/`request-link.php` do for a real caller,
  and does not weaken the fragment/body-only transport used by the
  actual link.

## 6. Concurrency and idempotency tests (point 4, consolidated)

In addition to the tests listed in Section 7, the atomic-consume designs
above require:

- **Magic link**: two simulated concurrent `verify.php` calls for the
  same raw token — exactly one succeeds (creates exactly one session,
  exactly one `users` row even on first-ever verification for that
  email), the other is rejected with the generic invalid/expired/used
  response.
- **Purchase intent / webhook race (explicitly requested)**: two
  different simulated `transaction.completed` events (distinct
  `paddle_transaction_id`s, distinct `event_id`s) both racing on the
  same `purchase_ref` — exactly one succeeds in consuming the intent and
  creates exactly one `transaction_grants` row; the other affects 0 rows
  on its conditional UPDATE and is safely ignored (HTTP 200, its own
  `payment_events` row still recorded for idempotency, no second grant,
  no error). Additionally assert the `UNIQUE(purchase_intent_id)`
  constraint on `transaction_grants` would independently reject a
  hypothetical second insert attempting to reuse the same intent, as a
  second, schema-level guarantee beyond the application-level UPDATE
  race protection.
- **Adjustment-before-transaction (explicitly requested, point 1)**: an
  `adjustment.created` (`action=refund`) event for a
  `paddle_transaction_id` that has no `transaction_grants` row yet is
  received first; it lands in `pending_adjustments`, unreconciled, no
  entitlement effect, no error. The corresponding `transaction.
  completed` event then arrives; reconciliation applies the pending
  refund's status transition to the newly-created grant row in the same
  transaction that creates it. Final state: grant reflects the refund
  (not left `active`), matching what should have happened had events
  arrived in the "expected" order.
- **Repurchase + delayed old refund/update (explicitly requested, point
  2)**: user completes transaction A (grant A, `active`). Later, user
  repurchases and completes transaction B for the same product (grant B,
  `active`) — `entitlements.active` stays true throughout, keyed by
  `EXISTS(any active grant)`, not by "the most recent transaction." A
  refund for **A** then arrives (`adjustment.created`, `approved`) —
  grant A moves to `refunded`; grant B is untouched;
  `entitlements.active` recomputes to **still true** because B is still
  `active`. This is the exact scenario point 2 names and must not
  regress.

## 7. Dev-only integration harness (PR C)

`/account-test` (parallel convention to `/paddle-test`): request a magic
link, retrieve it via the dev-only harness endpoint (Section 5) when
`DEV_HARNESS_ENABLED`, follow the fragment-based verify flow, receive a
session token held in `InMemorySessionTransport`, exercise `me.php`,
`purchase-intent.php`, and pass the returned `purchase_ref` into the
existing `/paddle-test` Paddle Sandbox Checkout flow's `customData`,
then check `entitlement.php` for the authenticated user.

Excluded from production builds via the same mechanism already proven
for `/paddle-test` (dynamic import + route guard checked by
`src/App.paddle.test.tsx`'s existing pattern) — PR C extends that same
test file/pattern rather than inventing a new one.

## 8. Security self-review checklist (applied before each PR is opened)

- Client-supplied user id cannot influence entitlement (`purchase_ref`
  is opaque, server-generated, pre-bound to a user at authenticated
  intent-creation time).
- Magic-link and session tokens: hash-only at rest, `hash_equals()` on
  final comparison, single-use enforced by an atomic conditional
  UPDATE + affected-row-count check (not SELECT-then-UPDATE), short
  expiry.
- Magic-link token transport never appears in a query string or an HTTP
  access log — fragment-delivered, stripped from history before use,
  POSTed in a request body.
- `purchase_ref`: hash-only in **our** storage (test asserts no raw
  value appears in any table dump across the full request-intent →
  webhook-consume flow); never logged (test greps `error_log`/
  exception-message call sites in the touched files for accidental
  interpolation of the raw value); documented accurately as
  "not persisted/logged by us," not "exists only in caller memory"
  (corrected from rev. 1 — Paddle itself legitimately receives and
  stores it).
- Purchase-intent and magic-link consume are race-safe (dedicated tests,
  Section 6); `transaction_grants.purchase_intent_id` is `UNIQUE`.
- Entitlement is derived from `transaction_grants`, never set directly
  by a single event handler — a refund can only ever change its own
  transaction's row.
- Adjustment status lifecycle (`pending_approval`/`approved`/`rejected`)
  is modeled explicitly; a pending refund does not revoke; only
  `approved` does. Out-of-order adjustments are queued and reconciled,
  never permanently dropped.
- Rate limiting: HMAC-keyed identifiers for both email and IP buckets,
  raw values never persisted; `X-Forwarded-For` is not trusted without
  an explicit trusted-proxy configuration (not present in this phase);
  email enumeration-safe generic responses.
- A `users` row is created only by a successful, atomically-consumed
  magic-link verification — never by an unauthenticated request-link
  call.
- CORS allowlist unchanged in shape (explicit list, no wildcard);
  extended only with new same-origin-pattern entries if needed for
  `/account-test` (expected: none, since it's the same frontend origin).
- The dev-only harness link-retrieval endpoint defaults to disabled and
  is excluded from the documented production deployment file list.
- No secret (rate-limit pepper, webhook secret, DB credentials) enters
  git, an example config, a log line, or this document.

## 9. Tests (both PHP `server/tests/` and Vitest, extending existing patterns)

**PR A** — users (create-on-verify only, lookup, email normalization,
duplicate rejection, no user created by request-link alone), magic-link
(secure generation, hash storage, expiry, atomic single-use with the
concurrent-verify race test from Section 6, invalid-token generic
response, enumeration-safe request-link response), sessions (create,
expire, revoke/logout, invalid-token rejection, `me.php` exposes only
`user_id`+`email_normalized`), rate limiter (per-email limit, per-IP
limit, one-IP-cycling-many-emails still blocked, one-email-across-many-
IPs still blocked, raw email/IP never persisted — only HMAC output is,
generic response under rate-limiting, `X-Forwarded-For` is ignored
absent trusted-proxy config).

**PR B** — purchase intent (authenticated-user-only issuance, random/
unpredictable ref, wrong-product rejected, expired rejected, consumed
(single-use, including the racing-webhooks test from Section 6)
rejected, another user cannot claim someone else's intent, **raw
`purchase_ref` never appears in any persisted row**), webhook
(correct `purchase_ref` grants the correct user; a browser-supplied
`internal_user_id`-shaped field is ignored/has no code path; unknown
`purchase_ref` → no unlock; wrong price/product → no unlock; duplicate
event → idempotent; `transaction_grants` row created with
`UNIQUE(purchase_intent_id)` enforced; **adjustment-before-transaction
reconciliation** (Section 6); **repurchase-survives-old-refund**
(Section 6); `pending_approval` does not revoke; `approved` revokes only
that transaction's grant; `rejected` restores `active`; stale
out-of-order status update is discarded by `occurred_at` comparison;
refund cannot revoke a different user's or a different transaction's
grant; unknown `transaction_id` on refund with no eventual match is
safely queued, never errors).

**PR C** — dev-only route excluded from production build (extends
`App.paddle.test.tsx`); dev-only harness link-retrieval endpoint
defaults disabled and is asserted absent from the deployment file list;
purchase-intent fetch happens only when authenticated; `purchase_ref`
(and never `internal_user_id`) is what reaches Paddle's `customData`;
magic-link token is read from the URL fragment, never a query string,
and is stripped from history before the verify POST; auth/session
errors render as recoverable UI state, not unhandled exceptions; token
is never written to `localStorage`/`sessionStorage` (test spies on both
Storage APIs across the flow and asserts zero writes).

## Verification

Each PR: `php server/tests/run-tests.php` (all passing, count reported),
`npm run verify`, `git diff --check`, full self-diff review per
`docs/definition-of-done.md`. No XServer deployment is performed in any
of the three PRs — all verification is local/CI.

## Deferred to later phases

- Concrete browser session transport decision (ADR leaves it open).
- Real SMTP/email credential and any real customer email send.
- XServer migration/deployment of the new schema and endpoints,
  including verifying `REMOTE_ADDR` behavior behind XServer's actual
  network path before trusting any proxy header.
- Actual curriculum paywall/locking, restore-purchase UI, subscriptions.
- Cross-device learning-progress sync.
- Any future Gmail-style (or similar) email-alias identity merging —
  explicitly requires its own reviewed migration design, not an
  automatic normalization change (corrected from rev. 1, which
  incorrectly called this "a safe additive change").
- Chargeback/dispute action handling beyond Phase 2's existing
  safely-ignored behavior (unchanged scope from Phase 2/rev. 1).
- Proportional/partial-value entitlement for partial refunds (Phase 3A
  treats any approved refund on a transaction as fully revoking that
  transaction's grant, regardless of `data.type`).

## Revision history

- **rev. 1** (2026-09-08): initial design, approved for spec-writing.
- **rev. 2** (2026-09-08): revised per ChatGPT review. Replaced the
  single-row-per-user/product `paddle_transactions` + direct-UPSERT
  entitlement model with a per-transaction `transaction_grants` ledger
  and derived/recomputed `entitlements` cache; added `pending_
  adjustments` for out-of-order webhook reconciliation; modeled Paddle's
  adjustment status lifecycle (`pending_approval`/`approved`/
  `rejected`) instead of treating every `action=refund` as an immediate
  final revoke; replaced SELECT-then-UPDATE single-use enforcement with
  atomic conditional UPDATE + affected-row-count for both magic-link
  tokens and purchase intents; added `UNIQUE(purchase_intent_id)` on
  the grant table; specified a URL-fragment + history-strip + POST-body
  magic-link token transport and a clearly-gated dev-only out-of-band
  link-retrieval path (replacing reliance on cross-request `FakeMailer`
  state); corrected the `purchase_ref` guarantee to "never persisted/
  logged by us" rather than "exists only in caller memory"; moved
  durable `users` row creation from request-link time to verify time;
  retracted the "Gmail alias folding is safe additive" claim; switched
  both rate-limit buckets to HMAC-keyed identifiers and restricted IP
  resolution to `REMOTE_ADDR` only, absent an explicit trusted-proxy
  config; revised the ADR to frame the session token as a full account
  credential, not merely an entitlement flag.
