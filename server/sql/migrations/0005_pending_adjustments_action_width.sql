-- Additive migration. Widens pending_adjustments.action from
-- VARCHAR(24) to VARCHAR(32) -- Phase H1-3 (chargeback/dispute
-- handling) queues chargeback-family actions verbatim, and
-- 'chargeback_warning_reverse' is 26 characters, which does not fit
-- in VARCHAR(24). Every value already stored ('refund', 8 chars) is
-- unaffected. Does not alter any other column or table.
--
-- Run this once against the same database as 0002_purchase_attribution.sql
-- and 0004_pending_adjustment_items.sql.

ALTER TABLE pending_adjustments
  MODIFY COLUMN action VARCHAR(32) NOT NULL;
