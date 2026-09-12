-- Paddle Sandbox entitlement PoC — minimal MySQL schema.
--
-- Scope: this is a Phase 2 proof-of-concept schema, not a production
-- payments/customer database. It intentionally stores the fewest fields
-- needed to prove "a server-side verified Paddle webhook can safely flip
-- an entitlement to active" — see docs/paddle-webhook-poc.md. Do not add
-- customer PII (email, address, card data) to either table; Paddle itself
-- is the system of record for that.
--
-- Run this once against a fresh MySQL 8+ database on Xserver (see
-- docs/paddle-webhook-poc.md's deployment section for exact steps).

CREATE TABLE IF NOT EXISTS payment_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Paddle's top-level webhook `event_id` (format `evt_...`) — the
  -- idempotency key. UNIQUE enforces "process each logical event once"
  -- even if Paddle retries delivery (see docs/paddle-webhook-poc.md's
  -- retry-behavior notes).
  paddle_event_id VARCHAR(64) NOT NULL,
  -- Paddle's `event_type` (e.g. `transaction.completed`, `adjustment.created`).
  event_type VARCHAR(64) NOT NULL,
  -- The related transaction id (`txn_...`) when the event carries one;
  -- NULL for event types with no transaction (kept nullable rather than
  -- widening scope with a second table for this PoC).
  paddle_transaction_id VARCHAR(64) NULL,
  -- Paddle's own `occurred_at` for the underlying event.
  occurred_at DATETIME NOT NULL,
  -- When this server finished processing the event (entitlement write
  -- committed, or the event was recognized as safely ignorable).
  processed_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_paddle_event_id (paddle_event_id),
  KEY idx_transaction_id (paddle_transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS entitlements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Sandbox PoC only — see docs/paddle-webhook-poc.md. This is NOT a real
  -- account system; every Sandbox purchase in this PoC is attributed to a
  -- single fixed test identifier (see server/src/SandboxUser.php), never a
  -- real end-user id. Do not repurpose this column as a production user
  -- id without first building real account/Magic Link identity (Phase 3+).
  internal_user_id VARCHAR(64) NOT NULL,
  -- Stable key for the product this entitlement covers. Only
  -- 'full_tamamizu' is used in this PoC.
  product_key VARCHAR(64) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 0,
  -- The transaction that most recently changed this entitlement's state
  -- (purchase or refund) — kept for audit/debugging, not required for
  -- entitlement logic itself.
  paddle_transaction_id VARCHAR(64) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- One entitlement row per (user, product) — purchases/refunds/webhook
  -- retries all UPSERT into this same row rather than creating duplicates.
  UNIQUE KEY uniq_user_product (internal_user_id, product_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
