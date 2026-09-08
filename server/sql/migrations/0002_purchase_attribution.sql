-- Phase 3A, PR B — additive migration. Adds secure purchase attribution
-- (purchase_intents, transaction_grants, pending_adjustments). Does NOT
-- alter, drop, or rename payment_events, entitlements (Phase 2), or
-- users/magic_link_tokens/sessions/rate_limits (PR A). Phase 2's
-- sandbox-test-user PoC path is completely untouched by this migration.
--
-- Run this once, after 0001_users_auth_foundation.sql, against the same
-- MariaDB 10.5+ database used by Phase 2/PR A. This migration is NOT
-- deployed to Xserver as part of this PR.

CREATE TABLE IF NOT EXISTS purchase_intents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- SHA-256 hex digest of the server-generated purchase_ref. The raw
  -- purchase_ref is NEVER stored here — it is intentionally sent to
  -- Paddle in customData and legitimately appears in Paddle's own
  -- systems, but our guarantee is that it never appears in our DB or
  -- logs. See docs/superpowers/specs/2026-09-08-paddle-auth-
  -- entitlement-phase3-design.md, section 1 ("Corrected purchase_ref
  -- guarantee").
  purchase_ref_hash CHAR(64) NOT NULL,
  -- Resolved from the AUTHENTICATED caller at intent-creation time —
  -- the browser never supplies this. See server/auth-purchase/
  -- purchase-intent.php.
  user_id CHAR(36) NOT NULL,
  product_key VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  -- Set atomically, exactly once, by the webhook, when it resolves
  -- this intent. NULL means still unconsumed/available.
  consumed_at DATETIME NULL,
  paddle_transaction_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_purchase_ref_hash (purchase_ref_hash),
  KEY idx_user_id (user_id),
  CONSTRAINT fk_purchase_intents_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transaction_grants (
  -- One row per Paddle transaction that ever granted entitlement — NOT
  -- one row per (user, product). This is what makes refund attribution
  -- correct: an old transaction's refund can only ever change ITS OWN
  -- row, never a later transaction's grant for the same user/product.
  paddle_transaction_id VARCHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  product_key VARCHAR(64) NOT NULL,
  -- UNIQUE: a second transaction can never attach to an intent already
  -- claimed by another transaction — belt-and-suspenders alongside the
  -- intent's own atomic consume (see purchase_intents.consumed_at).
  purchase_intent_id BIGINT UNSIGNED NOT NULL,
  -- Entitlement-bearing: 'active', 'refund_pending'.
  -- Non-entitlement-bearing: 'refunded'.
  -- Reserved, schema-only, NOT acted upon in PR B: 'chargeback_pending',
  -- 'chargeback' — chargeback/dispute handling remains explicitly
  -- deferred; these values exist only so a future phase does not need
  -- another migration to add them.
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  -- The occurred_at of the granting transaction.completed event (not
  -- wall-clock processing time).
  granted_at DATETIME NOT NULL,
  -- The occurred_at of the event that most recently changed `status` —
  -- used to discard a stale out-of-order adjustment (an older event
  -- arriving after a newer one must never overwrite it).
  status_changed_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (paddle_transaction_id),
  UNIQUE KEY uniq_purchase_intent_id (purchase_intent_id),
  KEY idx_user_product (user_id, product_key),
  CONSTRAINT fk_transaction_grants_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_transaction_grants_intent
    FOREIGN KEY (purchase_intent_id) REFERENCES purchase_intents (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pending_adjustments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- The transaction this adjustment refers to; not yet present in
  -- transaction_grants when this row is created (Paddle does not
  -- guarantee webhook delivery order — an adjustment.* event can
  -- arrive before the transaction.completed event it refers to).
  paddle_transaction_id VARCHAR(64) NOT NULL,
  -- The specific adjustment.* event, for idempotent reconciliation.
  paddle_event_id VARCHAR(64) NOT NULL,
  -- 'refund' (only action reconciled in PR B). Other actions
  -- (chargeback family, credit) are recorded for completeness but not
  -- reconciled — see WebhookHandler's adjustment handling.
  action VARCHAR(24) NOT NULL,
  -- Paddle's own data.status on the adjustment: pending_approval |
  -- approved | rejected | reversed.
  adjustment_status VARCHAR(24) NOT NULL,
  -- Paddle's own data.type: full | partial.
  adjustment_type VARCHAR(16) NOT NULL,
  -- Paddle's occurred_at for this event — used for ordering at
  -- reconciliation time.
  occurred_at DATETIME NOT NULL,
  -- Set once a matching transaction_grants row appears and this
  -- adjustment has been applied to it. NULL means still queued.
  reconciled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_paddle_event_id (paddle_event_id),
  KEY idx_transaction_id (paddle_transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
