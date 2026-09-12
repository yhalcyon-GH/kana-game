-- Additive migration. Adds pending_adjustments.items_json so a
-- refund/adjustment event queued because it arrived before its
-- transaction.completed (see PendingAdjustmentRepository) can later be
-- reconciled with the same RefundCompleteness (item-scoped full-refund)
-- check the direct path uses. Does not alter any other table.
--
-- Run this once against the same database as 0002_purchase_attribution.sql.

ALTER TABLE pending_adjustments
  ADD COLUMN items_json TEXT NULL AFTER adjustment_type;
