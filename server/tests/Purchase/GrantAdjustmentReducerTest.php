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

    $reduceFresh = static fn (array $rows): array => GrantAdjustmentReducer::reduce(
        'active',
        new \DateTimeImmutable('2026-01-01T00:00:00.000000Z'),
        '',
        $rows,
    );

    return [
        'chargeback reversal restores active when chronological history contains its older predecessor' => function () use ($row, $reduceFresh) {
            $result = $reduceFresh([
                $row('evt_cb', 'chargeback', 'approved', 'full', '2026-01-02 00:00:00.100000'),
                $row('evt_rev', 'chargeback_reverse', 'approved', 'full', '2026-01-02 00:00:00.900000'),
            ]);
            assertSame('active', $result['status'], 'chronological chargeback then reversal should restore active');
        },

        'warning reversal restores active after an older warning' => function () use ($row, $reduceFresh) {
            $result = $reduceFresh([
                $row('evt_warn', 'chargeback_warning', 'approved', 'full', '2026-01-02 00:00:00.100000'),
                $row('evt_warn_rev', 'chargeback_warning_reverse', 'approved', 'full', '2026-01-02 00:00:00.900000'),
            ]);
            assertSame('active', $result['status'], 'warning followed by its reversal should restore active');
        },

        'a full approved refund is terminal even against later refund-family and chargeback-family events' => function () use ($row, $reduceFresh) {
            $result = $reduceFresh([
                $row('evt_refund', 'refund', 'approved', 'full', '2026-01-02 00:00:00.100000'),
                $row('evt_rejected', 'refund', 'rejected', 'full', '2026-01-03 00:00:00.100000'),
                $row('evt_cb', 'chargeback', 'approved', 'full', '2026-01-04 00:00:00.100000'),
                $row('evt_rev', 'chargeback_reverse', 'approved', 'full', '2026-01-05 00:00:00.100000'),
            ]);
            assertSame('refunded', $result['status'], 'fully refunded must never be reactivated by any later adjustment');
        },

        'partial approved or rejected refund resolves refund_pending back to active' => function () use ($row, $reduceFresh) {
            $partial = $reduceFresh([
                $row('evt_pending', 'refund', 'pending_approval', 'full', '2026-01-02 00:00:00.100000'),
                $row('evt_partial', 'refund', 'approved', 'partial', '2026-01-02 00:00:00.900000'),
            ]);
            assertSame('active', $partial['status'], 'partial approval should end a pending full-refund state without revoking entitlement');

            $rejected = $reduceFresh([
                $row('evt_pending', 'refund', 'pending_approval', 'full', '2026-01-02 00:00:00.100000'),
                $row('evt_rejected', 'refund', 'rejected', 'full', '2026-01-02 00:00:00.900000'),
            ]);
            assertSame('active', $rejected['status'], 'rejected refund should restore active from refund_pending');
        },

        'events chronologically before a new-grant baseline are ignored' => function () use ($row) {
            $result = GrantAdjustmentReducer::reduce(
                'active',
                new \DateTimeImmutable('2026-01-02T00:00:00.500000Z'),
                '',
                [
                    $row('evt_old', 'refund', 'approved', 'full', '2026-01-02 00:00:00.100000'),
                ],
            );
            assertSame('active', $result['status'], 'pre-baseline adjustment must not rewrite the grant');
        },

        'legacy baseline preserves already-materialized status and replays only newer normalized history' => function () use ($row) {
            $result = GrantAdjustmentReducer::reduce(
                'chargeback',
                new \DateTimeImmutable('2026-01-03T00:00:00.500000Z'),
                'evt_legacy_highwater',
                [
                    $row('evt_legacy_old', 'chargeback_warning', 'approved', 'full', '2026-01-02 00:00:00.100000'),
                    $row('evt_new_reverse', 'chargeback_reverse', 'approved', 'full', '2026-01-04 00:00:00.100000'),
                ],
            );
            assertSame('active', $result['status'], 'newer post-baseline reverse should apply to the legacy chargeback snapshot');
        },

        'same-timestamp event-id floor excludes legacy rows but permits later ids deterministically' => function () use ($row) {
            $result = GrantAdjustmentReducer::reduce(
                'active',
                new \DateTimeImmutable('2026-01-02T00:00:00.100000Z'),
                'evt_m',
                [
                    $row('evt_a', 'chargeback', 'approved', 'full', '2026-01-02 00:00:00.100000'),
                    $row('evt_z', 'chargeback_warning', 'approved', 'full', '2026-01-02 00:00:00.100000'),
                ],
            );
            assertSame('chargeback_pending', $result['status'], 'only event ids after the baseline tie-breaker should replay');
        },

        'legacy coarse non-entitlement baseline rejects same-second entitlement restoration' => function () {
            $threw = false;
            try {
                GrantAdjustmentReducer::reduce(
                    'chargeback',
                    new \DateTimeImmutable('2026-01-02T00:00:00.000000Z'),
                    '',
                    [[
                        'paddle_event_id' => 'evt_reverse',
                        'action' => 'chargeback_reverse',
                        'adjustment_status' => 'n/a',
                        'adjustment_type' => 'n/a',
                        'items' => null,
                        'occurred_at' => '2026-01-02 00:00:00.900000',
                    ]],
                    true,
                );
            } catch (\LogicException) {
                $threw = true;
            }
            assertTrue($threw, 'whole-second legacy boundary must never guess in the entitlement-restoring direction');
        },

        'legacy coarse baseline still allows same-second conservative entitlement revocation' => function () {
            $result = GrantAdjustmentReducer::reduce(
                'active',
                new \DateTimeImmutable('2026-01-02T00:00:00.000000Z'),
                '',
                [[
                    'paddle_event_id' => 'evt_refund',
                    'action' => 'refund',
                    'adjustment_status' => 'approved',
                    'adjustment_type' => 'full',
                    'items' => null,
                    'occurred_at' => '2026-01-02 00:00:00.900000',
                ]],
                true,
            );
            assertSame('refunded', $result['status'], 'ambiguous legacy second may revoke entitlement conservatively');
        },

        'legacy coarse restoration after the ambiguous baseline second remains allowed' => function () {
            $result = GrantAdjustmentReducer::reduce(
                'chargeback',
                new \DateTimeImmutable('2026-01-02T00:00:00.000000Z'),
                '',
                [[
                    'paddle_event_id' => 'evt_reverse_next_second',
                    'action' => 'chargeback_reverse',
                    'adjustment_status' => 'n/a',
                    'adjustment_type' => 'n/a',
                    'items' => null,
                    'occurred_at' => '2026-01-02 00:00:01.000000',
                ]],
                true,
            );
            assertSame('active', $result['status'], 'precisely later event outside the legacy second is not ambiguous');
        },

    ];
}
