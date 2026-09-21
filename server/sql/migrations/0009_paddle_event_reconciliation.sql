-- Security hardening: deterministic Paddle event reconciliation.
--
-- Run after Production migration 0008_magic_link_browser_binding.sql.
-- No rows are deleted. Event timestamps used for ordering are widened from
-- whole-second DATETIME to DATETIME(6), and a tiny per-transaction lock table
-- is added so distinct event ids for the same Paddle transaction serialize.

CREATE TABLE IF NOT EXISTS transaction_event_locks (
  paddle_transaction_id VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (paddle_transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE payment_events
  MODIFY COLUMN occurred_at DATETIME(6) NOT NULL;

ALTER TABLE transaction_grants
  MODIFY COLUMN granted_at DATETIME(6) NOT NULL,
  MODIFY COLUMN status_changed_at DATETIME(6) NOT NULL;

ALTER TABLE pending_adjustments
  MODIFY COLUMN occurred_at DATETIME(6) NOT NULL;
