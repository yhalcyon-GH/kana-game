<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

/**
 * Pure deterministic reduction of normalized Paddle adjustment history.
 *
 * Input rows MUST be sorted by precise occurred_at then paddle_event_id.
 * Reduction starts from an immutable per-transaction replay baseline.
 * For grants created by the current code that baseline is the original
 * transaction.completed active state. For a pre-0009 grant it is a one-time
 * snapshot of the already-materialized legacy state plus the latest previously
 * processed adjustment sort key; events at/before that key cannot safely be
 * reconstructed because the old direct path did not retain their payloads.
 * A pre-0009 status_changed_at also had only whole-second precision. Such a
 * baseline is marked legacy/coarse: within that ambiguous baseline second the
 * reducer may conservatively remove entitlement, but it refuses any transition
 * from a non-entitlement state back to an entitlement-bearing state.
 *
 * A fully approved refund is terminal across ALL later normalized adjustment
 * events. Rejected/partial refund events restore active only from
 * refund_pending; they never resurrect an already fully-refunded grant.
 */
final class GrantAdjustmentReducer
{
    /**
     * @param list<array{
     *   paddle_event_id: string,
     *   action: string,
     *   adjustment_status: string,
     *   adjustment_type: string,
     *   items: mixed,
     *   occurred_at: string
     * }> $adjustments
     * @return array{status: string, changed_at: \DateTimeImmutable}
     */
    public static function reduce(
        string $baselineStatus,
        \DateTimeImmutable $baselineAt,
        string $baselineEventId,
        array $adjustments,
        bool $baselineIsLegacyCoarse = false,
    ): array {
        $status = $baselineStatus;
        $changedAt = $baselineAt;

        foreach ($adjustments as $adjustment) {
            $occurredAt = new \DateTimeImmutable($adjustment['occurred_at']);
            if (self::isAtOrBeforeBaseline(
                $occurredAt,
                $adjustment['paddle_event_id'],
                $baselineAt,
                $baselineEventId,
            )) {
                continue;
            }

            $next = self::nextStatus($status, $adjustment);
            if ($baselineIsLegacyCoarse
                && self::isInSameWholeSecond($occurredAt, $baselineAt)
                && self::restoresEntitlement($status, $next)
            ) {
                throw new \LogicException('ambiguous legacy coarse replay would restore entitlement');
            }
            if ($next !== $status) {
                $status = $next;
                $changedAt = $occurredAt;
            }
        }

        return ['status' => $status, 'changed_at' => $changedAt];
    }

    private static function isAtOrBeforeBaseline(
        \DateTimeImmutable $occurredAt,
        string $eventId,
        \DateTimeImmutable $baselineAt,
        string $baselineEventId,
    ): bool {
        if ($occurredAt < $baselineAt) {
            return true;
        }
        if ($occurredAt > $baselineAt) {
            return false;
        }

        // Empty means "there was no baseline adjustment event at this exact
        // timestamp" (the normal baseline for a newly-created grant), so
        // same-timestamp real adjustment ids remain eligible for replay.
        return $baselineEventId !== '' && strcmp($eventId, $baselineEventId) <= 0;
    }

    private static function isInSameWholeSecond(\DateTimeImmutable $a, \DateTimeImmutable $b): bool
    {
        return $a->format('Y-m-d H:i:s') === $b->format('Y-m-d H:i:s');
    }

    private static function restoresEntitlement(string $from, string $to): bool
    {
        return !self::isEntitlementBearing($from) && self::isEntitlementBearing($to);
    }

    private static function isEntitlementBearing(string $status): bool
    {
        return in_array($status, ['active', 'refund_pending'], true);
    }

    /**
     * @param array{action: string, adjustment_status: string, adjustment_type: string, items: mixed} $adjustment
     */
    private static function nextStatus(string $current, array $adjustment): string
    {
        if ($current === 'refunded') {
            return 'refunded';
        }

        $action = $adjustment['action'];
        if ($action === 'refund') {
            $status = $adjustment['adjustment_status'];
            $isFullRefund = RefundCompleteness::isFullRefund(
                $adjustment['adjustment_type'],
                $adjustment['items'],
            );

            if ($status === 'approved' && $isFullRefund) {
                return 'refunded';
            }

            if ($status === 'pending_approval') {
                return in_array($current, ['active', 'refund_pending'], true)
                    ? 'refund_pending'
                    : $current;
            }

            if (($status === 'approved' && !$isFullRefund) || $status === 'rejected') {
                return $current === 'refund_pending' ? 'active' : $current;
            }

            return $current;
        }

        return match ($action) {
            'chargeback_warning' => in_array($current, ['active', 'refund_pending'], true)
                ? 'chargeback_pending'
                : $current,
            'chargeback' => in_array($current, ['active', 'refund_pending', 'chargeback_pending', 'chargeback'], true)
                ? 'chargeback'
                : $current,
            'chargeback_warning_reverse' => $current === 'chargeback_pending' ? 'active' : $current,
            'chargeback_reverse' => $current === 'chargeback' ? 'active' : $current,
            default => $current,
        };
    }
}
