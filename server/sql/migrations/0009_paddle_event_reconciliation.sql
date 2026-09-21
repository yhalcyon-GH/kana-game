-- Security hardening: deterministic Paddle event reconciliation.
--
-- Run after Production migration 0008_magic_link_browser_binding.sql.
-- No rows are deleted. Event timestamps used for ordering are widened from
-- whole-second DATETIME to DATETIME(6), and a tiny per-transaction lock/state
-- table is added so distinct event ids for the same Paddle transaction
-- serialize. The nullable replay_base_* fields are initialized lazily by the
-- matching backend while it holds that transaction's row lock. A baseline
-- snapped from a pre-0009 grant is explicitly marked legacy/coarse because its
-- status_changed_at only had whole-second precision. This preserves the already-
-- materialized status of pre-0009 grants whose historical direct adjustment
-- payloads were not retained, while giving all post-baseline normalized events
-- a fixed deterministic replay origin. Existing unreconciled grant-backed rows
-- are reconciled by the guarded cutover operation; migration SQL itself does not
-- guess or synthesize missing legacy adjustment payloads. Safety invariants that
-- cannot be auto-resolved are durably quarantined in
-- paddle_reconciliation_blocks instead of relying on finite Paddle retries.

CREATE TABLE IF NOT EXISTS transaction_event_locks (
  paddle_transaction_id VARCHAR(64) NOT NULL,
  replay_base_status VARCHAR(24) NULL,
  replay_base_at DATETIME(6) NULL,
  replay_base_event_id VARCHAR(64) NULL,
  -- 1 only when the baseline was snapped from a pre-0009 whole-second
  -- status_changed_at. The reducer uses this to refuse ambiguous same-second
  -- entitlement restoration while still allowing conservative revocation.
  replay_base_is_legacy_coarse TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (paddle_transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS paddle_reconciliation_blocks (
  paddle_event_id VARCHAR(64) NOT NULL,
  paddle_transaction_id VARCHAR(64) NOT NULL,
  reason_code VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  adjustment_status VARCHAR(32) NOT NULL,
  adjustment_type VARCHAR(32) NOT NULL,
  occurred_at DATETIME(6) NOT NULL,
  -- When 1, this unresolved transaction is ignored by entitlement-bearing
  -- grant queries until an operator resolves the block after manual review.
  force_exclude_transaction TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME(6) NULL,
  PRIMARY KEY (paddle_event_id),
  KEY idx_reconciliation_block_txn (paddle_transaction_id),
  KEY idx_reconciliation_block_unresolved (resolved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE payment_events
  MODIFY COLUMN occurred_at DATETIME(6) NOT NULL;

ALTER TABLE transaction_grants
  MODIFY COLUMN granted_at DATETIME(6) NOT NULL,
  MODIFY COLUMN status_changed_at DATETIME(6) NOT NULL;

ALTER TABLE pending_adjustments
  MODIFY COLUMN occurred_at DATETIME(6) NOT NULL;
