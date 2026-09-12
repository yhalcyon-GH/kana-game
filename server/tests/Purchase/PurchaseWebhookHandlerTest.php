<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\PaddleSignature;
use KanaGame\Paddle\PaymentEventRepository;
use KanaGame\Paddle\Purchase\PendingAdjustmentRepository;
use KanaGame\Paddle\Purchase\PurchaseIntentRepository;
use KanaGame\Paddle\Purchase\PurchaseWebhookHandler;
use KanaGame\Paddle\Purchase\TransactionGrantRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/PaddleSignature.php';
require_once __DIR__ . '/../../src/PaymentEventRepository.php';
require_once __DIR__ . '/../../src/EntitlementRepository.php';
require_once __DIR__ . '/../../src/ProductMatcher.php';
require_once __DIR__ . '/../../src/Purchase/PurchaseIntentRepository.php';
require_once __DIR__ . '/../../src/Purchase/TransactionGrantRepository.php';
require_once __DIR__ . '/../../src/Purchase/PendingAdjustmentRepository.php';
require_once __DIR__ . '/../../src/Purchase/PurchaseWebhookHandler.php';

const PWH_TEST_SECRET = 'test-webhook-secret';
const PWH_TEST_PRICE_ID = 'pri_full_tamamizu';
const PWH_TEST_PRODUCT_ID = 'pro_full_tamamizu';

function makePurchaseWebhookTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE payment_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paddle_event_id TEXT NOT NULL UNIQUE,
            event_type TEXT NOT NULL,
            paddle_transaction_id TEXT NULL,
            occurred_at TEXT NOT NULL,
            processed_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    $pdo->exec(
        'CREATE TABLE entitlements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            internal_user_id TEXT NOT NULL,
            product_key TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 0,
            paddle_transaction_id TEXT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (internal_user_id, product_key)
        )',
    );
    $pdo->exec(
        'CREATE TABLE purchase_intents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_ref_hash TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            product_key TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            consumed_at TEXT NULL,
            paddle_transaction_id TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    $pdo->exec(
        'CREATE TABLE transaction_grants (
            paddle_transaction_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            product_key TEXT NOT NULL,
            purchase_intent_id INTEGER NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT "active",
            granted_at TEXT NOT NULL,
            status_changed_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    $pdo->exec(
        'CREATE TABLE pending_adjustments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paddle_transaction_id TEXT NOT NULL,
            paddle_event_id TEXT NOT NULL UNIQUE,
            action TEXT NOT NULL,
            adjustment_status TEXT NOT NULL,
            adjustment_type TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            reconciled_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

function makePurchaseWebhookHandler(PDO $pdo): PurchaseWebhookHandler
{
    return new PurchaseWebhookHandler(
        new PaddleSignature(PWH_TEST_SECRET),
        new PaymentEventRepository($pdo),
        new PurchaseIntentRepository($pdo),
        new TransactionGrantRepository($pdo),
        new PendingAdjustmentRepository($pdo),
        new EntitlementRepository($pdo),
        PWH_TEST_PRICE_ID,
        PWH_TEST_PRODUCT_ID,
    );
}

function pwhSign(string $rawBody, ?int $timestamp = null): string
{
    $timestamp ??= time();
    $signed = hash_hmac('sha256', "{$timestamp}:{$rawBody}", PWH_TEST_SECRET);
    return "ts={$timestamp};h1={$signed}";
}

/**
 * @param array<mixed> $overridesData
 */
function pwhTransactionCompletedPayload(string $eventId, string $transactionId, string $purchaseRef, string $occurredAt = '2026-01-01T00:00:00Z', array $overridesData = []): string
{
    $data = array_merge([
        'id' => $transactionId,
        'status' => 'completed',
        'items' => [
            ['price' => ['id' => PWH_TEST_PRICE_ID, 'product_id' => PWH_TEST_PRODUCT_ID]],
        ],
        'custom_data' => ['purchase_ref' => $purchaseRef],
    ], $overridesData);

    return json_encode([
        'event_id' => $eventId,
        'event_type' => 'transaction.completed',
        'occurred_at' => $occurredAt,
        'data' => $data,
    ]);
}

function pwhAdjustmentPayload(string $eventId, string $eventType, string $transactionId, string $action, string $status, string $type, string $occurredAt = '2026-01-02T00:00:00Z'): string
{
    return json_encode([
        'event_id' => $eventId,
        'event_type' => $eventType,
        'occurred_at' => $occurredAt,
        'data' => [
            'transaction_id' => $transactionId,
            'action' => $action,
            'status' => $status,
            'type' => $type,
        ],
    ]);
}

/**
 * @return array<string, callable(): void>
 */
function purchaseWebhookHandlerTests(): array
{
    return [
        // -- transaction.completed --

        'correct purchase_ref grants entitlement to the correct user' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-1', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $body = pwhTransactionCompletedPayload('evt_1', 'txn_1', 'raw-ref-1');
            $result = $handler->handle($body, pwhSign($body));

            assertSame(200, $result->statusCode, 'a valid purchase should be processed with 200');
            $entitlements = new EntitlementRepository($pdo);
            $found = $entitlements->find('user-1', 'full_tamamizu');
            assertTrue($found !== null && $found['active'], 'user-1 should now be entitled');
        },

        'a browser-supplied internal_user_id field is ignored -- no code path reads it' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-2', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $body = pwhTransactionCompletedPayload('evt_2', 'txn_2', 'raw-ref-2', overridesData: [
                'custom_data' => ['purchase_ref' => 'raw-ref-2', 'internal_user_id' => 'attacker-controlled-user'],
            ]);
            $handler->handle($body, pwhSign($body));

            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'the real intent owner (user-1) must be entitled');
            assertSame(null, $entitlements->find('attacker-controlled-user', 'full_tamamizu'), 'the attacker-supplied internal_user_id must never receive entitlement');
        },

        'unknown purchase_ref does not unlock anything' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);

            $body = pwhTransactionCompletedPayload('evt_3', 'txn_3', 'never-issued-ref');
            $result = $handler->handle($body, pwhSign($body));

            assertSame(200, $result->statusCode, 'an unknown purchase_ref should still be safely acknowledged');
            $count = (int) $pdo->query('SELECT COUNT(*) FROM transaction_grants')->fetchColumn();
            assertSame(0, $count, 'no grant should be created for an unknown purchase_ref');
        },

        'wrong product does not unlock' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-wrongprod', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $body = pwhTransactionCompletedPayload('evt_4', 'txn_4', 'raw-ref-wrongprod', overridesData: [
                'items' => [['price' => ['id' => PWH_TEST_PRICE_ID, 'product_id' => 'pro_something_else']]],
                'custom_data' => ['purchase_ref' => 'raw-ref-wrongprod'],
            ]);
            $handler->handle($body, pwhSign($body));

            $entitlements = new EntitlementRepository($pdo);
            assertSame(null, $entitlements->find('user-1', 'full_tamamizu'), 'wrong product must not grant entitlement');
        },

        'wrong price does not unlock' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-wrongprice', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $body = pwhTransactionCompletedPayload('evt_5', 'txn_5', 'raw-ref-wrongprice', overridesData: [
                'items' => [['price' => ['id' => 'pri_something_else', 'product_id' => PWH_TEST_PRODUCT_ID]]],
                'custom_data' => ['purchase_ref' => 'raw-ref-wrongprice'],
            ]);
            $handler->handle($body, pwhSign($body));

            $entitlements = new EntitlementRepository($pdo);
            assertSame(null, $entitlements->find('user-1', 'full_tamamizu'), 'wrong price must not grant entitlement');
        },

        'duplicate Paddle event is idempotent -- processed only once' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-dup', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $body = pwhTransactionCompletedPayload('evt_dup', 'txn_dup', 'raw-ref-dup');
            $first = $handler->handle($body, pwhSign($body));
            $second = $handler->handle($body, pwhSign($body));

            assertSame(200, $first->statusCode, 'first delivery should succeed');
            assertSame(200, $second->statusCode, 'duplicate delivery should be safely acknowledged');
            $count = (int) $pdo->query('SELECT COUNT(*) FROM transaction_grants')->fetchColumn();
            assertSame(1, $count, 'exactly one grant should exist despite the duplicate delivery');
        },

        'one purchase intent cannot create two transaction grants' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-oneintent', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $firstBody = pwhTransactionCompletedPayload('evt_a', 'txn_a', 'raw-ref-oneintent');
            $handler->handle($firstBody, pwhSign($firstBody));

            // A second, DISTINCT transaction/event tries to reuse the
            // SAME purchase_ref (already consumed).
            $secondBody = pwhTransactionCompletedPayload('evt_b', 'txn_b', 'raw-ref-oneintent');
            $handler->handle($secondBody, pwhSign($secondBody));

            $count = (int) $pdo->query('SELECT COUNT(*) FROM transaction_grants')->fetchColumn();
            assertSame(1, $count, 'a second transaction reusing an already-consumed purchase_ref must not create a second grant');
        },

        'distinct transactions racing on the same purchase_ref create one grant only' => function () {
            // Race-scenario test (sequential SQLite, not true concurrent
            // MariaDB execution) -- proves the atomic consume prevents
            // a double-grant even when two DIFFERENT transaction ids
            // both attempt to claim the same intent.
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-race', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $bodyA = pwhTransactionCompletedPayload('evt_race_a', 'txn_race_a', 'raw-ref-race');
            $bodyB = pwhTransactionCompletedPayload('evt_race_b', 'txn_race_b', 'raw-ref-race');

            $resultA = $handler->handle($bodyA, pwhSign($bodyA));
            $resultB = $handler->handle($bodyB, pwhSign($bodyB));

            assertSame(200, $resultA->statusCode, 'first racer should be safely acknowledged');
            assertSame(200, $resultB->statusCode, 'second racer should be safely acknowledged (not an error)');

            $count = (int) $pdo->query('SELECT COUNT(*) FROM transaction_grants')->fetchColumn();
            assertSame(1, $count, 'exactly one grant must exist no matter which transaction won the race');
        },

        // -- refund lifecycle --

        'pending full refund does not remove entitlement' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-pending', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);
            $body = pwhTransactionCompletedPayload('evt_p1', 'txn_p1', 'raw-ref-pending');
            $handler->handle($body, pwhSign($body));

            $adjBody = pwhAdjustmentPayload('evt_p2', 'adjustment.created', 'txn_p1', 'refund', 'pending_approval', 'full');
            $handler->handle($adjBody, pwhSign($adjBody));

            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'pending_approval must not revoke entitlement');
        },

        'approved full refund removes that transaction grant and revokes entitlement' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-approved', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);
            $body = pwhTransactionCompletedPayload('evt_a1', 'txn_a1', 'raw-ref-approved');
            $handler->handle($body, pwhSign($body));

            $adjBody = pwhAdjustmentPayload('evt_a2', 'adjustment.created', 'txn_a1', 'refund', 'approved', 'full');
            $handler->handle($adjBody, pwhSign($adjBody));

            $grants = new TransactionGrantRepository($pdo);
            $grant = $grants->findByTransactionId('txn_a1');
            assertSame('refunded', $grant['status'], 'grant status should be refunded');

            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement should be revoked');
        },

        'rejected refund restores active status' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-rejected', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);
            $body = pwhTransactionCompletedPayload('evt_r1', 'txn_r1', 'raw-ref-rejected');
            $handler->handle($body, pwhSign($body));

            $pendingBody = pwhAdjustmentPayload('evt_r2', 'adjustment.created', 'txn_r1', 'refund', 'pending_approval', 'full', '2026-01-02T00:00:00Z');
            $handler->handle($pendingBody, pwhSign($pendingBody));

            $rejectedBody = pwhAdjustmentPayload('evt_r3', 'adjustment.updated', 'txn_r1', 'refund', 'rejected', 'full', '2026-01-03T00:00:00Z');
            $handler->handle($rejectedBody, pwhSign($rejectedBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('active', $grants->findByTransactionId('txn_r1')['status'], 'a rejected refund should restore active status');

            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement should remain/return to active');
        },

        'partial refund does not remove entitlement' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-partial', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);
            $body = pwhTransactionCompletedPayload('evt_pa1', 'txn_pa1', 'raw-ref-partial');
            $handler->handle($body, pwhSign($body));

            $partialBody = pwhAdjustmentPayload('evt_pa2', 'adjustment.created', 'txn_pa1', 'refund', 'approved', 'partial');
            $handler->handle($partialBody, pwhSign($partialBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('active', $grants->findByTransactionId('txn_pa1')['status'], 'a partial refund must not change grant status');

            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'partial refund must not revoke entitlement');
        },

        'refund on transaction A never touches transaction B' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-A', new \DateTimeImmutable('+30 minutes'));
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-B', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $bodyA = pwhTransactionCompletedPayload('evt_txnA', 'txn_A', 'raw-ref-A', '2026-01-01T00:00:00Z');
            $handler->handle($bodyA, pwhSign($bodyA));
            $bodyB = pwhTransactionCompletedPayload('evt_txnB', 'txn_B', 'raw-ref-B', '2026-01-05T00:00:00Z');
            $handler->handle($bodyB, pwhSign($bodyB));

            $refundBody = pwhAdjustmentPayload('evt_refundA', 'adjustment.created', 'txn_A', 'refund', 'approved', 'full', '2026-01-10T00:00:00Z');
            $handler->handle($refundBody, pwhSign($refundBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_A')['status'], 'A should be refunded');
            assertSame('active', $grants->findByTransactionId('txn_B')['status'], 'B must be untouched');

            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'user must remain entitled via B');
        },

        'refund for another user cannot revoke a different user' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-u1', new \DateTimeImmutable('+30 minutes'));
            $intents->create('user-2', 'full_tamamizu', 'raw-ref-u2', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $bodyU1 = pwhTransactionCompletedPayload('evt_u1', 'txn_u1', 'raw-ref-u1');
            $handler->handle($bodyU1, pwhSign($bodyU1));
            $bodyU2 = pwhTransactionCompletedPayload('evt_u2', 'txn_u2', 'raw-ref-u2');
            $handler->handle($bodyU2, pwhSign($bodyU2));

            $refundBody = pwhAdjustmentPayload('evt_refund_u1', 'adjustment.created', 'txn_u1', 'refund', 'approved', 'full');
            $handler->handle($refundBody, pwhSign($refundBody));

            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'user-1 should be revoked');
            assertTrue($entitlements->find('user-2', 'full_tamamizu')['active'], 'user-2 must be unaffected');
        },

        'a stale (older occurred_at) adjustment event is ignored' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-stale', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);
            $body = pwhTransactionCompletedPayload('evt_s1', 'txn_s1', 'raw-ref-stale', '2026-01-01T00:00:00Z');
            $handler->handle($body, pwhSign($body));

            $approvedBody = pwhAdjustmentPayload('evt_s2', 'adjustment.created', 'txn_s1', 'refund', 'approved', 'full', '2026-01-05T00:00:00Z');
            $handler->handle($approvedBody, pwhSign($approvedBody));

            // A stale pending_approval event, occurred_at BEFORE the
            // approved event already applied -- must not move the
            // grant backwards.
            $staleBody = pwhAdjustmentPayload('evt_s3', 'adjustment.created', 'txn_s1', 'refund', 'pending_approval', 'full', '2026-01-02T00:00:00Z');
            $handler->handle($staleBody, pwhSign($staleBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_s1')['status'], 'the stale event must not overwrite the newer refunded status');
        },

        // -- out-of-order webhook delivery --

        'adjustment arriving before its transaction.completed is queued, no entitlement effect yet' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);

            $adjBody = pwhAdjustmentPayload('evt_early', 'adjustment.created', 'txn_notyet', 'refund', 'approved', 'full');
            $result = $handler->handle($adjBody, pwhSign($adjBody));

            assertSame(200, $result->statusCode, 'an early adjustment should be safely queued, not an error');
            $count = (int) $pdo->query('SELECT COUNT(*) FROM transaction_grants')->fetchColumn();
            assertSame(0, $count, 'no grant should exist yet');

            $pending = new PendingAdjustmentRepository($pdo);
            assertSame(1, count($pending->findUnreconciledForTransaction('txn_notyet')), 'the adjustment should be queued as unreconciled');
        },

        'once the matching transaction.completed arrives, the queued adjustment is reconciled' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-ooo', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $adjBody = pwhAdjustmentPayload('evt_ooo_adj', 'adjustment.created', 'txn_ooo', 'refund', 'approved', 'full', '2026-01-05T00:00:00Z');
            $handler->handle($adjBody, pwhSign($adjBody));

            $txnBody = pwhTransactionCompletedPayload('evt_ooo_txn', 'txn_ooo', 'raw-ref-ooo', '2026-01-01T00:00:00Z');
            $handler->handle($txnBody, pwhSign($txnBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_ooo')['status'], 'reconciliation should apply the queued refund');

            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement should reflect the reconciled refund');

            $pending = new PendingAdjustmentRepository($pdo);
            assertSame(0, count($pending->findUnreconciledForTransaction('txn_ooo')), 'the adjustment should now be marked reconciled');
        },

        'multiple queued adjustment states are reconciled in occurred_at order' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-multi', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            // Pending arrives first (chronologically), then approved --
            // but BOTH arrive (out of webhook order) before the
            // transaction.completed itself.
            $pendingBody = pwhAdjustmentPayload('evt_multi_pending', 'adjustment.created', 'txn_multi', 'refund', 'pending_approval', 'full', '2026-01-02T00:00:00Z');
            $handler->handle($pendingBody, pwhSign($pendingBody));
            $approvedBody = pwhAdjustmentPayload('evt_multi_approved', 'adjustment.updated', 'txn_multi', 'refund', 'approved', 'full', '2026-01-03T00:00:00Z');
            $handler->handle($approvedBody, pwhSign($approvedBody));

            $txnBody = pwhTransactionCompletedPayload('evt_multi_txn', 'txn_multi', 'raw-ref-multi', '2026-01-01T00:00:00Z');
            $handler->handle($txnBody, pwhSign($txnBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_multi')['status'], 'the final reconciled status should be refunded (the newest queued state)');
        },

        'a stale queued adjustment event does not override a newer one during reconciliation' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-stalequeue', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            // Approved arrives first, then a STALE (older occurred_at)
            // pending_approval arrives second -- both before the
            // transaction.completed.
            $approvedBody = pwhAdjustmentPayload('evt_stalequeue_approved', 'adjustment.created', 'txn_stalequeue', 'refund', 'approved', 'full', '2026-01-05T00:00:00Z');
            $handler->handle($approvedBody, pwhSign($approvedBody));
            $staleBody = pwhAdjustmentPayload('evt_stalequeue_stale', 'adjustment.updated', 'txn_stalequeue', 'refund', 'pending_approval', 'full', '2026-01-02T00:00:00Z');
            $handler->handle($staleBody, pwhSign($staleBody));

            $txnBody = pwhTransactionCompletedPayload('evt_stalequeue_txn', 'txn_stalequeue', 'raw-ref-stalequeue', '2026-01-01T00:00:00Z');
            $handler->handle($txnBody, pwhSign($txnBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_stalequeue')['status'], 'reconciliation must apply refunded (newest), not be overwritten by the stale pending_approval');
        },

        'reconciliation is idempotent -- redelivering the same transaction.completed does not double-reconcile' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-idem', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $adjBody = pwhAdjustmentPayload('evt_idem_adj', 'adjustment.created', 'txn_idem', 'refund', 'approved', 'full', '2026-01-05T00:00:00Z');
            $handler->handle($adjBody, pwhSign($adjBody));

            $txnBody = pwhTransactionCompletedPayload('evt_idem_txn', 'txn_idem', 'raw-ref-idem', '2026-01-01T00:00:00Z');
            $handler->handle($txnBody, pwhSign($txnBody));
            // Redeliver the SAME transaction.completed event.
            $handler->handle($txnBody, pwhSign($txnBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_idem')['status'], 'status should remain refunded after the redelivery');
        },

        // -- repurchase-after-refund, with a late out-of-order old adjustment --

        'repurchase: A purchased, A refunded, B purchased, then a late old A adjustment arrives -- B remains valid' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-repA', new \DateTimeImmutable('+30 minutes'));
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-repB', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $bodyA = pwhTransactionCompletedPayload('evt_repA', 'txn_repA', 'raw-ref-repA', '2026-01-01T00:00:00Z');
            $handler->handle($bodyA, pwhSign($bodyA));

            $refundBody = pwhAdjustmentPayload('evt_repRefundA', 'adjustment.created', 'txn_repA', 'refund', 'approved', 'full', '2026-01-02T00:00:00Z');
            $handler->handle($refundBody, pwhSign($refundBody));

            $bodyB = pwhTransactionCompletedPayload('evt_repB', 'txn_repB', 'raw-ref-repB', '2026-01-05T00:00:00Z');
            $handler->handle($bodyB, pwhSign($bodyB));

            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'user should be entitled via B after A was refunded');

            // A LATE, duplicate/stale adjustment.updated for A arrives
            // (e.g. a Paddle retry) -- must not affect B.
            $lateBody = pwhAdjustmentPayload('evt_repLateA', 'adjustment.updated', 'txn_repA', 'refund', 'approved', 'full', '2026-01-02T00:00:00Z');
            $handler->handle($lateBody, pwhSign($lateBody));

            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'B must remain valid after the late A adjustment');
            $grants = new TransactionGrantRepository($pdo);
            assertSame('active', $grants->findByTransactionId('txn_repB')['status'], 'B grant must be untouched');
        },

        // -- Phase 2 regression: SandboxUser PoC path is a separate class, untouched --

        'PurchaseWebhookHandler does not import or instantiate SandboxUser' => function () {
            $reflection = new \ReflectionClass(PurchaseWebhookHandler::class);
            $source = file_get_contents($reflection->getFileName());
            // A doc comment may legitimately MENTION "SandboxUser" while
            // documenting that no dependency exists (this file's own
            // class-level comment does exactly that) -- what must never
            // appear is an actual code reference: a `use` import or a
            // `SandboxUser::` static access.
            assertFalse(str_contains($source, 'use KanaGame\\Paddle\\SandboxUser'), 'must not import SandboxUser');
            assertFalse(str_contains($source, 'SandboxUser::'), 'must not statically reference SandboxUser');
        },

        // -- Regression test (explicitly requested): the real deployed
        // webhook entrypoint must construct and invoke
        // PurchaseWebhookHandler ONLY -- it must never construct the
        // legacy Phase 2 WebhookHandler, never branch on any config
        // flag between the two, and never branch on webhook payload
        // contents to decide which handler runs. This is a
        // source-inspection test (this repo's dependency-free test
        // runner has no way to drive a real HTTP request against
        // server/paddle-webhook.php) -- it proves the ENTRYPOINT WIRING
        // itself has no fallback path, complementing the handler-level
        // 'browser-supplied internal_user_id is ignored' test above,
        // which proves the HANDLER'S OWN LOGIC has no fallback either.
        'server/paddle-webhook.php constructs PurchaseWebhookHandler only, never legacy WebhookHandler, with no config-driven or payload-driven handler switch' => function () {
            $entrypointPath = __DIR__ . '/../../paddle-webhook.php';
            $source = file_get_contents($entrypointPath);
            assertTrue($source !== false, 'server/paddle-webhook.php should be readable');

            assertTrue(
                str_contains($source, 'new PurchaseWebhookHandler('),
                'the entrypoint must construct PurchaseWebhookHandler',
            );
            assertFalse(
                str_contains($source, 'new WebhookHandler('),
                'the entrypoint must never construct the legacy Phase 2 WebhookHandler',
            );
            assertFalse(
                str_contains($source, 'use KanaGame\\Paddle\\WebhookHandler;'),
                'the entrypoint must not even import the legacy WebhookHandler class',
            );
            assertFalse(
                str_contains($source, 'PADDLE_HANDLER_MODE'),
                'no config flag may switch between the Phase 2 and Phase 3 handlers at this entrypoint',
            );
            assertFalse(
                str_contains($source, "\$payload['") && str_contains($source, 'WebhookHandler'),
                'the choice of handler must never be derived from webhook payload contents',
            );
        },
    ];
}
