<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Purchase\GrantAdjustmentReducer;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Purchase/RefundCompleteness.php';
require_once __DIR__ . '/../../src/Purchase/GrantAdjustmentReducer.php';

/**
 * @return array<string, callable(): void>
 */
function grantAdjustmentReducerTests(): array
{
    $row = static fn (
        string $eventId,
        string $action,
        string $status,
        string $type,
        string $occurredAt,
        mixed $items = null,
    ): array => [
        'paddle_event_id' => $eventId,
        'action' => $action,
        'adjustment_status' => $status,
        'adjustment_type' => $type,
        'items' => $items,
        'occurred_at' => $occurredAt,
    ];

    return [
        'chargeback reversal restores active when chronological history contains its older predecessor' => function () use ($row) {
            $result = GrantAdjustmentReducer::reduce(
                new \DateTimeImmutable('2026-01-01T00:00:00.000000Z'),
                [
                    $row('evt_cb', 'chargeback', 'approved', 'full', '2026-01-02 00:00:00.100000'),
                    $row('evt_rev', 'chargeback_reverse', 'approved', 'full', '2026-01-02 00:00:00.900000'),
                ],
            );
            assertSame('active', $result['status'], 'chronological chargeback then reversal should restore active');
        },

        'warning reversal restores active after an older warning' => function () use ($row) {
            $result = GrantAdjustmentReducer::reduce(
                new \DateTimeImmutable('2026-01-01T00:00:00.000000Z'),
                [
                    $row('evt_warn', 'chargeback_warning', 'approved', 'full', '2026-01-02 00:00:00.100000'),
                    $row('evt_warn_rev', 'chargeback_warning_reverse', 'approved', 'full', '2026-01-02 00:00:00.900000'),
                ],
            );
            assertSame('active', $result['status'], 'warning followed by its reversal should restore active');
        },

        'a full approved refund is terminal even when later chargeback-family events exist' => function () use ($row) {
            $result = GrantAdjustmentReducer::reduce(
                new \DateTimeImmutable('2026-01-01T00:00:00.000000Z'),
                [
                    $row('evt_refund', 'refund', 'approved', 'full', '2026-01-02 00:00:00.100000'),
                    $row('evt_cb', 'chargeback', 'approved', 'full', '2026-01-03 00:00:00.100000'),
                    $row('evt_rev', 'chargeback_reverse', 'approved', 'full', '2026-01-04 00:00:00.100000'),
                ],
            );
            assertSame('refunded', $result['status'], 'fully refunded must never be reactivated by chargeback lifecycle');
        },

        'partial approved or rejected refund resolves refund_pending back to active' => function () use ($row) {
            $partial = GrantAdjustmentReducer::reduce(
                new \DateTimeImmutable('2026-01-01T00:00:00.000000Z'),
                [
                    $row('evt_pending', 'refund', 'pending_approval', 'full', '2026-01-02 00:00:00.100000'),
                    $row('evt_partial', 'refund', 'approved', 'partial', '2026-01-02 00:00:00.900000'),
                ],
            );
            assertSame('active', $partial['status'], 'partial approval should end a pending full-refund state without revoking entitlement');

            $rejected = GrantAdjustmentReducer::reduce(
                new \DateTimeImmutable('2026-01-01T00:00:00.000000Z'),
                [
                    $row('evt_pending', 'refund', 'pending_approval', 'full', '2026-01-02 00:00:00.100000'),
                    $row('evt_rejected', 'refund', 'rejected', 'full', '2026-01-02 00:00:00.900000'),
                ],
            );
            assertSame('active', $rejected['status'], 'rejected refund should restore active from refund_pending');
        },

        'an adjustment chronologically older than the granting transaction is ignored' => function () use ($row) {
            $result = GrantAdjustmentReducer::reduce(
                new \DateTimeImmutable('2026-01-02T00:00:00.500000Z'),
                [
                    $row('evt_old', 'refund', 'approved', 'full', '2026-01-02 00:00:00.100000'),
                ],
            );
            assertSame('active', $result['status'], 'pre-grant adjustment must not rewrite the grant');
        },
    ];
}
