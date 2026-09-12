<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

/**
 * Determines whether an adjustment.created/updated event's `data`
 * represents a refund that fully cancels the grant this system created.
 *
 * Current domain model (see TransactionGrantRepository): a
 * transaction_grants row is one row per Paddle transaction, with no
 * per-item tracking, because every entitlement-granting transaction in
 * this system has exactly one line item -- the configured Full Tamamizu
 * price at quantity 1 (the only Checkout.open() call in this codebase,
 * src/routes/AccountTestPage.tsx, always sends `items: [{ priceId,
 * quantity: 1 }]`). There is no multi-item purchase flow.
 *
 * Paddle's adjustment-level `data.type` is `full` only for a
 * whole-transaction adjustment; an item-scoped adjustment (refunding
 * specific item(s), even at their full amount) is reported as `partial`
 * at the adjustment level, with the per-item completeness carried in
 * `data.items[].type`. Given this system's single-item transactions,
 * an adjustment whose `items` contains exactly that one item, fully
 * refunded, is a full refund of the whole grant even though the
 * adjustment-level type reads `partial`.
 *
 * This intentionally does NOT treat "any item is `full`" as sufficient
 * -- multiple items, or items alongside a non-`full` item, cannot be
 * safely mapped onto "the entire grant was refunded" without also
 * storing which transaction item a grant corresponds to. If this system
 * ever sells multi-item transactions, transaction_grants (and this
 * helper) need to track the entitlement-bearing item id explicitly.
 */
final class RefundCompleteness
{
    /**
     * @param mixed $items The adjustment's `data.items`, if present.
     */
    public static function isFullRefund(string $adjustmentType, mixed $items): bool
    {
        if ($adjustmentType === 'full') {
            return true;
        }

        if ($adjustmentType !== 'partial' || !is_array($items) || count($items) !== 1) {
            return false;
        }

        $item = $items[0] ?? null;
        if (!is_array($item)) {
            return false;
        }

        return ($item['type'] ?? null) === 'full';
    }

    private function __construct()
    {
    }
}
