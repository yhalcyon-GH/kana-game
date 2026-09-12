# Phase 3A PR B — secure purchase attribution

Implements the `purchase_intents`/`transaction_grants`/
`pending_adjustments` portion of
[`docs/superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-design.md`](superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-design.md)
(rev. 3). Builds on PR A ([`docs/paddle-auth-phase3a-pr-a.md`](paddle-auth-phase3a-pr-a.md))
and Phase 2 ([`docs/paddle-webhook-poc.md`](paddle-webhook-poc.md))
without altering Phase 2's `payment_events`/`entitlements` tables or
`sandbox-test-user` PoC path.

## Scope

**In this PR:** `purchase_intents` (atomic single-use consume), hashed
`purchase_ref`, the `transaction_grants` per-transaction entitlement
ledger, `pending_adjustments` out-of-order-webhook reconciliation,
`PurchaseWebhookHandler` (the real-user `transaction.completed`/
`adjustment.*` handling), `POST /api/purchase-intent.php`, `GET
/api/entitlement-me.php`.

**Explicitly NOT in this PR:** the `/account-test` frontend harness,
real SMTP, XServer deployment, production session transport decision,
curriculum locking, chargeback/dispute handling, proportional/partial
entitlement policy. These are PR C scope or explicitly deferred per the
design spec.

## Two webhook handlers — an explicit, permanent separation

| Class | Role | Reachable via |
|---|---|---|
| `server/src/WebhookHandler.php` | **Legacy Phase 2 PoC.** Fixed `SandboxUser::ID`, `custom_data.internal_user_id`. Unmodified except one behavior-preserving refactor (delegates its price/product check to the new shared `ProductMatcher`). | `server/tests/WebhookHandlerTest.php` only — **not wired to any live entrypoint as of this PR.** |
| `server/src/Purchase/PurchaseWebhookHandler.php` | **Phase 3 real-user path.** `custom_data.purchase_ref` only, resolves the buyer from an authenticated-user-created `purchase_intents` row, writes `transaction_grants`. | `server/paddle-webhook.php` — the one real deployed webhook URL. |

`server/paddle-webhook.php` constructs `PurchaseWebhookHandler`
exclusively. There is no config flag (no `PADDLE_HANDLER_MODE` or
equivalent) and no payload-derived branch choosing between the two
handlers — a source-inspection regression test
(`server/tests/Purchase/PurchaseWebhookHandlerTest.php`) asserts this
directly. Absence or invalidity of `purchase_ref` never falls back to
`internal_user_id` or any other identity source; it only ever results
in "safely acknowledged, no entitlement grant."

## New endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/purchase-intent.php` | POST | `Authorization: Bearer` | Create a purchase intent for the current authenticated user; returns the raw `purchase_ref` once. Depends only on `CurrentUserService` (PR A). |
| `/api/entitlement-me.php` | GET | `Authorization: Bearer` | Entitlement for the current authenticated user only — no `?user_id=` parameter exists. `CurrentUserEntitlementService::lookupForSession()` takes only a session token, so cross-user lookup is impossible by construction, not by a bypassable check. |

`server/entitlement.php` (Phase 2's fixed-`SandboxUser` PoC endpoint)
is unchanged.

## New tables

See [`server/sql/migrations/0002_purchase_attribution.sql`](../server/sql/migrations/0002_purchase_attribution.sql):
`purchase_intents`, `transaction_grants`, `pending_adjustments`.
Additive only.

- `purchase_intents.purchase_ref_hash` — SHA-256 only; the raw
  `purchase_ref` is never persisted or logged by this codebase (it is
  intentionally sent to Paddle and legitimately appears in Paddle's own
  systems — see the design spec, section 1).
- `transaction_grants` — one row **per Paddle transaction**, not per
  (user, product). `UNIQUE(purchase_intent_id)` prevents one intent
  from ever producing two grants. Entitlement-bearing statuses:
  `active`, `refund_pending`. Non-entitlement-bearing: `refunded`.
  Chargeback statuses exist in the schema, reserved, unused.
- `pending_adjustments` — queues an `adjustment.*` event that arrives
  before its `transaction.completed` (Paddle does not guarantee
  delivery order). Reconciled in `occurred_at` order once the matching
  grant is created.

## Entitlement derivation (never "last event wins")

`entitlements` (Phase 2's table) is a **materialized cache**, always
recomputed as:

```
EXISTS(transaction_grants WHERE user_id = ? AND product_key = ?
       AND status IN ('active', 'refund_pending'))
```

A refund on an old transaction can only ever change **that
transaction's own row** — a later, still-valid transaction's grant is
untouched, so the user remains entitled. Proven by dedicated tests at
every layer (`TransactionGrantRepository`, `PurchaseWebhookHandler`,
`CurrentUserEntitlementService`).

## Refund lifecycle

| `data.status` | `data.type` | Effect |
|---|---|---|
| `pending_approval` | any | Grant → `refund_pending` (still entitlement-bearing) |
| `approved` | `full` | Grant → `refunded` (revokes) |
| `approved` | `partial` | Recorded/idempotent only — **no status change**, no revoke. Partial-refund entitlement policy remains an explicit deferred product decision. |
| `rejected` | any | Grant → `active` (restored) |

A status transition whose `occurred_at` is not newer than the grant's
current `status_changed_at` is discarded — a late-arriving out-of-order
event can never undo a more recent one.

Chargeback/dispute actions are recognized (`action` values confirmed
against current Paddle Billing docs) but not acted upon — explicitly
deferred, matching Phase 2's own scope.

## Out-of-order webhook handling

An `adjustment.*` event for a transaction not yet in `transaction_
grants` is queued in `pending_adjustments` and safely acknowledged
(200, no entitlement effect). When the matching `transaction.completed`
later creates the grant, all queued adjustments for that transaction
are applied in `occurred_at` order, then marked reconciled. Reconciling
the same `transaction.completed` twice (a Paddle redelivery) does not
re-reconcile already-reconciled adjustments.

## Deployment status

**Not deployed.** This PR contains code, migrations, and tests only. No
XServer deployment, no schema execution against the real
`giganihongo_tmzp` database, and no Paddle Sandbox interaction happen in
this PR.

## Known remaining verification: real-MariaDB concurrency (required before Live)

Same caveat as PR A: the "distinct transactions racing on the same
purchase_ref create one grant only" test and similar concurrency
proofs in this PR are **race-scenario tests** — sequential SQLite, not
true simultaneous multi-connection MariaDB execution. Before any Live
Paddle rollout, a human must additionally verify against a real
deployed MariaDB instance that two genuinely concurrent
`transaction.completed` deliveries racing on the same `purchase_ref`
produce exactly one `transaction_grants` row. Not performed in this PR.

## Tests

Run `php server/tests/run-tests.php` — all PR A tests plus this PR's
new tests must pass together.
