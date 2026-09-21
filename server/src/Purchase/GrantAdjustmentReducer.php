<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

/**
 * Pure deterministic reduction of normalized Paddle adjustment history.
 *
 * Input rows MUST be sorted by precise occurred_at then paddle_event_id.
 * The reducer starts from the transaction.completed grant's original active
 * state and derives the same final status regardless of webhook arrival order.
 * "refunded" is terminal: later chargeback/reversal events never reactivate a
 * fully refunded grant.
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
    public static function reduce(\DateTimeImmutable $grantedAt, array $adjustments): array
    {
        $status = 'active';
        $changedAt = $grantedAt;

        foreach ($adjustments as $adjustment) {
            $occurredAt = new \DateTimeImmutable($adjustment['occurred_at']);
            if ($occurredAt < $grantedAt) {
                continue;
            }

            $next = self::nextStatus($status, $adjustment);
            if ($next !== $status) {
                $status = $next;
                $changedAt = $occurredAt;
            }
        }

        return ['status' => $status, 'changed_at' => $changedAt];
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
