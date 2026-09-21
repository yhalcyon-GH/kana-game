<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\PaddleSignature;
use KanaGame\Paddle\PaymentEventRepository;
use KanaGame\Paddle\Purchase\PendingAdjustmentRepository;
use KanaGame\Paddle\Purchase\PurchaseIntentRepository;
use KanaGame\Paddle\Purchase\PurchaseWebhookHandler;
use KanaGame\Paddle\Purchase\TransactionEventLockRepository;
use KanaGame\Paddle\Purchase\TransactionGrantRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/PaddleSignature.php';
require_once __DIR__ . '/../../src/PaddleEventTime.php';
require_once __DIR__ . '/../../src/PaymentEventRepository.php';
require_once __DIR__ . '/../../src/EntitlementRepository.php';
require_once __DIR__ . '/../../src/ProductMatcher.php';
require_once __DIR__ . '/../../src/Purchase/PurchaseIntentRepository.php';
require_once __DIR__ . '/../../src/Purchase/TransactionEventLockRepository.php';
require_once __DIR__ . '/../../src/Purchase/GrantAdjustmentReducer.php';
require_once __DIR__ . '/../../src/Purchase/TransactionGrantRepository.php';
require_once __DIR__ . '/../../src/Purchase/PendingAdjustmentRepository.php';
require_once __DIR__ . '/../../src/Purchase/RefundCompleteness.php';
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
        'CREATE TABLE transaction_event_locks (
            paddle_transaction_id TEXT PRIMARY KEY,
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
            items_json TEXT NULL,
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
        $pdo,
        new PaddleSignature(PWH_TEST_SECRET),
        new PaymentEventRepository($pdo),
        new TransactionEventLockRepository($pdo),
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

/**
 * Builds an adjustment.created/adjustment.updated payload. `$items`
 * mirrors Paddle's real `data.items` shape (a list of
 * `['type' => 'full'|'partial', 'item_id' => ..., 'totals' => [...]]`
 * entries) -- omit it (default null) for tests that don't care about
 * item-level detail, e.g. a whole-transaction ($type = 'full') refund.
 *
 * @param list<array<string, mixed>>|null $items
 */
function pwhAdjustmentPayload(string $eventId, string $eventType, string $transactionId, string $action, string $status, string $type, string $occurredAt = '2026-01-02T00:00:00Z', ?array $items = null, string $adjustmentId = 'adj_test'): string
{
    $data = [
        'id' => $adjustmentId,
        'transaction_id' => $transactionId,
        'action' => $action,
        'status' => $status,
        'type' => $type,
    ];
    if ($items !== null) {
        $data['items'] = $items;
    }

    return json_encode([
        'event_id' => $eventId,
        'event_type' => $eventType,
        'occurred_at' => $occurredAt,
        'data' => $data,
    ]);
}

/**
 * Test helper: creates a purchase intent and delivers its
 * transaction.completed event, producing an 'active' transaction_grants
 * row -- the common starting point for the Phase H1-3 chargeback tests
 * below, which are about what happens to an EXISTING grant.
 */
function pwhMakeActiveGrant(PDO $pdo, PurchaseWebhookHandler $handler, string $userId, string $rawRef, string $eventId, string $transactionId, string $productKey = 'full_tamamizu'): void
{
    $intents = new PurchaseIntentRepository($pdo);
    $intents->create($userId, $productKey, $rawRef, new \DateTimeImmutable('+30 minutes'));
    $body = pwhTransactionCompletedPayload($eventId, $transactionId, $rawRef, '2026-01-01T00:00:00Z');
    $handler->handle($body, pwhSign($body));
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
            $eventCount = (int) $pdo->query('SELECT COUNT(*) FROM payment_events')->fetchColumn();
            assertSame(1, $eventCount, 'exactly one payment_events row should exist -- the second delivery must lose the claim, not record a second row');
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

        // -- item-scoped refund completeness (real Paddle Sandbox shape:
        // adjustment-level type=partial, items[].type=full) --

        'approved item-scoped refund of the single entitlement item revokes entitlement (real payload regression)' => function () {
            // Regression for the Tamamizu Sandbox refund that stayed
            // active: Paddle's real payload for a full-item refund has
            // adjustment-level data.type = "partial" with exactly one
            // items[] entry whose type = "full" -- not adjustment-level
            // type = "full".
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-itemfull', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);
            $body = pwhTransactionCompletedPayload('evt_if1', 'txn_itemfull', 'raw-ref-itemfull');
            $handler->handle($body, pwhSign($body));

            $items = [['type' => 'full', 'item_id' => 'txnitm_1', 'totals' => ['total' => '534']]];
            $createdBody = pwhAdjustmentPayload('evt_if2', 'adjustment.created', 'txn_itemfull', 'refund', 'pending_approval', 'partial', '2026-01-02T00:00:00Z', $items, 'adj_itemfull');
            $handler->handle($createdBody, pwhSign($createdBody));

            $updatedBody = pwhAdjustmentPayload('evt_if3', 'adjustment.updated', 'txn_itemfull', 'refund', 'approved', 'partial', '2026-01-03T00:00:00Z', $items, 'adj_itemfull');
            $result = $handler->handle($updatedBody, pwhSign($updatedBody));

            assertSame(200, $result->statusCode, 'the adjustment.updated event should be safely acknowledged');

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_itemfull')['status'], 'the single entitlement item being fully refunded should refund the grant');

            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement should be revoked once the single item is fully refunded');
        },

        'approved refund with a partially-refunded item does not revoke entitlement' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-itempartial', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);
            $body = pwhTransactionCompletedPayload('evt_ip1', 'txn_itempartial', 'raw-ref-itempartial');
            $handler->handle($body, pwhSign($body));

            $items = [['type' => 'partial', 'item_id' => 'txnitm_1', 'totals' => ['total' => '100']]];
            $adjBody = pwhAdjustmentPayload('evt_ip2', 'adjustment.created', 'txn_itempartial', 'refund', 'approved', 'partial', '2026-01-02T00:00:00Z', $items);
            $handler->handle($adjBody, pwhSign($adjBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('active', $grants->findByTransactionId('txn_itempartial')['status'], 'a partially-refunded item must not change grant status');

            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain active for a partially-refunded item');
        },

        'approved refund with multiple items, only one fully refunded, does not revoke entitlement' => function () {
            // The current domain model has no per-item tracking on
            // transaction_grants (single-item transactions only), so a
            // multi-item adjustment can never be safely mapped onto
            // "the whole grant was refunded" -- this must stay
            // conservative even though it should not arise in practice
            // today.
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-multi', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);
            $body = pwhTransactionCompletedPayload('evt_mi1', 'txn_multiitem', 'raw-ref-multi');
            $handler->handle($body, pwhSign($body));

            $items = [
                ['type' => 'full', 'item_id' => 'txnitm_1', 'totals' => ['total' => '534']],
                ['type' => 'partial', 'item_id' => 'txnitm_2', 'totals' => ['total' => '10']],
            ];
            $adjBody = pwhAdjustmentPayload('evt_mi2', 'adjustment.created', 'txn_multiitem', 'refund', 'approved', 'partial', '2026-01-02T00:00:00Z', $items);
            $handler->handle($adjBody, pwhSign($adjBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('active', $grants->findByTransactionId('txn_multiitem')['status'], 'an ambiguous multi-item adjustment must not be treated as a full refund');

            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain active when full-refund coverage cannot be safely determined');
        },

        'adjustment.created and adjustment.updated for the same adjustment id but different event_ids are both processed' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-sameadj', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);
            $body = pwhTransactionCompletedPayload('evt_sa1', 'txn_sameadj', 'raw-ref-sameadj');
            $handler->handle($body, pwhSign($body));

            $items = [['type' => 'full', 'item_id' => 'txnitm_1', 'totals' => ['total' => '534']]];
            $createdBody = pwhAdjustmentPayload('evt_sa_created', 'adjustment.created', 'txn_sameadj', 'refund', 'pending_approval', 'partial', '2026-01-02T00:00:00Z', $items, 'adj_shared_id');
            $createdResult = $handler->handle($createdBody, pwhSign($createdBody));

            $updatedBody = pwhAdjustmentPayload('evt_sa_updated', 'adjustment.updated', 'txn_sameadj', 'refund', 'approved', 'partial', '2026-01-03T00:00:00Z', $items, 'adj_shared_id');
            $updatedResult = $handler->handle($updatedBody, pwhSign($updatedBody));

            assertSame(200, $createdResult->statusCode, 'adjustment.created should be processed even though it shares data.id with a later adjustment.updated');
            assertSame(200, $updatedResult->statusCode, 'adjustment.updated should be processed despite sharing data.id with adjustment.created');

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_sameadj')['status'], 'both events, keyed by their distinct event_id, should be applied in order');
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

        'same-second microsecond ordering keeps newer full refund terminal when older pending arrives later' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-micro', new \DateTimeImmutable('+30 minutes'));
            $handler = makePurchaseWebhookHandler($pdo);

            $txnBody = pwhTransactionCompletedPayload(
                'evt_micro_txn',
                'txn_micro_order',
                'raw-ref-micro',
                '2026-01-01T00:00:00.000000Z',
            );
            $handler->handle($txnBody, pwhSign($txnBody));

            // Newer full approval arrives first.
            $approved = pwhAdjustmentPayload(
                'evt_micro_approved',
                'adjustment.updated',
                'txn_micro_order',
                'refund',
                'approved',
                'full',
                '2026-01-02T00:00:00.900000Z',
            );
            $handler->handle($approved, pwhSign($approved));

            // Older pending state arrives later. Whole-second truncation
            // would make these compare equal and let delivery order leak into
            // state; DATETIME(6)+full replay must keep refunded.
            $olderPending = pwhAdjustmentPayload(
                'evt_micro_pending',
                'adjustment.created',
                'txn_micro_order',
                'refund',
                'pending_approval',
                'full',
                '2026-01-02T00:00:00.100000Z',
            );
            $handler->handle($olderPending, pwhSign($olderPending));

            $grant = (new TransactionGrantRepository($pdo))->findByTransactionId('txn_micro_order');
            assertSame('refunded', $grant['status'], 'older same-second pending event must never overwrite newer full refund');
            assertSame('2026-01-02 00:00:00.900000', $grant['status_changed_at'], 'newer fractional timestamp must remain materialized');
        },

        'chargeback_reverse delivered before its older chargeback is replayed to active once both events exist' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-revfirst', 'evt_revfirst_txn', 'txn_revfirst');

            $reverseFirst = pwhAdjustmentPayload(
                'evt_revfirst_reverse',
                'adjustment.created',
                'txn_revfirst',
                'chargeback_reverse',
                'n/a',
                'n/a',
                '2026-01-03T00:00:00.900000Z',
            );
            $handler->handle($reverseFirst, pwhSign($reverseFirst));
            assertSame('active', (new TransactionGrantRepository($pdo))->findByTransactionId('txn_revfirst')['status'], 'reversal alone has no predecessor and should leave active');

            $olderChargeback = pwhAdjustmentPayload(
                'evt_revfirst_chargeback',
                'adjustment.created',
                'txn_revfirst',
                'chargeback',
                'n/a',
                'n/a',
                '2026-01-03T00:00:00.100000Z',
            );
            $handler->handle($olderChargeback, pwhSign($olderChargeback));

            $grant = (new TransactionGrantRepository($pdo))->findByTransactionId('txn_revfirst');
            assertSame('active', $grant['status'], 'full chronological replay must apply older chargeback then newer reversal');
            assertTrue((new EntitlementRepository($pdo))->find('user-1', 'full_tamamizu')['active'], 'entitlement should remain active after replayed reversal');
        },

        'chargeback_warning_reverse delivered before older warning is replayed to active once warning arrives' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-warnrev', 'evt_warnrev_txn', 'txn_warnrev');

            $reverseFirst = pwhAdjustmentPayload(
                'evt_warnrev_reverse',
                'adjustment.created',
                'txn_warnrev',
                'chargeback_warning_reverse',
                'n/a',
                'n/a',
                '2026-01-03T00:00:00.900000Z',
            );
            $handler->handle($reverseFirst, pwhSign($reverseFirst));

            $warningLaterDelivery = pwhAdjustmentPayload(
                'evt_warnrev_warning',
                'adjustment.created',
                'txn_warnrev',
                'chargeback_warning',
                'n/a',
                'n/a',
                '2026-01-03T00:00:00.100000Z',
            );
            $handler->handle($warningLaterDelivery, pwhSign($warningLaterDelivery));

            assertSame('active', (new TransactionGrantRepository($pdo))->findByTransactionId('txn_warnrev')['status'], 'warning history must replay before its chronologically newer reversal');
        },

        'fully refunded grant stays terminal through later chargeback and reversal events' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-terminal', 'evt_terminal_txn', 'txn_terminal');

            $refund = pwhAdjustmentPayload('evt_terminal_refund', 'adjustment.updated', 'txn_terminal', 'refund', 'approved', 'full', '2026-01-02T00:00:00.100000Z');
            $handler->handle($refund, pwhSign($refund));
            $chargeback = pwhAdjustmentPayload('evt_terminal_cb', 'adjustment.created', 'txn_terminal', 'chargeback', 'n/a', 'n/a', '2026-01-03T00:00:00.100000Z');
            $handler->handle($chargeback, pwhSign($chargeback));
            $reverse = pwhAdjustmentPayload('evt_terminal_rev', 'adjustment.created', 'txn_terminal', 'chargeback_reverse', 'n/a', 'n/a', '2026-01-04T00:00:00.100000Z');
            $handler->handle($reverse, pwhSign($reverse));

            assertSame('refunded', (new TransactionGrantRepository($pdo))->findByTransactionId('txn_terminal')['status'], 'refunded is terminal under deterministic history replay');
            assertFalse((new EntitlementRepository($pdo))->find('user-1', 'full_tamamizu')['active'], 'terminal refund must keep entitlement revoked');
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

        // -- Regression test (explicitly requested): PurchaseWebhookHandler
        // calls RefundCompleteness::isFullRefund(...), but PHP has no
        // autoloader registered here -- a bare `use` statement does not
        // load the class, only require/require_once does. The real
        // deployed entrypoint omitted this require, which is invisible to
        // every other test in this file because
        // makePurchaseWebhookHandler() (via this test file's own
        // require_once list) already loads RefundCompleteness.php
        // unconditionally, masking the entrypoint's own wiring gap. This
        // is a source-inspection test on server/paddle-webhook.php itself
        // (same rationale as the "constructs PurchaseWebhookHandler only"
        // test above) -- it proves the ENTRYPOINT actually requires the
        // class its own handler depends on, in an order where the
        // dependency is available before it's used.
        'server/paddle-webhook.php requires RefundCompleteness.php before requiring PurchaseWebhookHandler.php' => function () {
            $entrypointPath = __DIR__ . '/../../paddle-webhook.php';
            $source = file_get_contents($entrypointPath);
            assertTrue($source !== false, 'server/paddle-webhook.php should be readable');

            $refundCompletenessPos = strpos($source, "require __DIR__ . '/src/Purchase/RefundCompleteness.php';");
            $handlerPos = strpos($source, "require __DIR__ . '/src/Purchase/PurchaseWebhookHandler.php';");

            assertTrue($refundCompletenessPos !== false, 'the entrypoint must require src/Purchase/RefundCompleteness.php');
            assertTrue($handlerPos !== false, 'the entrypoint must require src/Purchase/PurchaseWebhookHandler.php');
            assertTrue(
                $refundCompletenessPos < $handlerPos,
                'RefundCompleteness.php must be required before PurchaseWebhookHandler.php, which calls RefundCompleteness::isFullRefund(...) at class-definition-load time',
            );
        },

        // -- Phase H1-2: webhook transaction atomicity --
        //
        // handle() now runs the event claim (PaymentEventRepository::
        // claim(), the UNIQUE (paddle_event_id) constraint) as the FIRST
        // write inside one PDO transaction that also covers every
        // business-logic write and the entitlement recompute. True
        // concurrent-thread testing isn't feasible against a single
        // SQLite in-memory connection (same accepted limitation as the
        // Phase H1-1 EntitlementRepository tests) -- these tests use the
        // same accepted proxies: sequential calls for the duplicate/race
        // case, and a deliberately broken table to force a mid-
        // transaction exception for the rollback/retry cases.

        'a concurrent delivery that loses the event claim never reaches business logic -- no grant, no intent consumption' => function () {
            // Simulates "another request already committed the claim a
            // moment ago": pre-insert the payment_events row directly
            // (bypassing handle() entirely) rather than calling handle()
            // twice, so this exercises the transactional claim() check
            // itself, not any separate pre-check.
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-concurrent', new \DateTimeImmutable('+30 minutes'));

            $pdo->prepare(
                'INSERT INTO payment_events (paddle_event_id, event_type, paddle_transaction_id, occurred_at, processed_at)
                 VALUES (:event_id, :event_type, :txn_id, :occurred_at, :processed_at)',
            )->execute([
                'event_id' => 'evt_concurrent',
                'event_type' => 'transaction.completed',
                'txn_id' => 'txn_concurrent',
                'occurred_at' => '2026-01-01T00:00:00Z',
                'processed_at' => '2026-01-01T00:00:00Z',
            ]);

            $handler = makePurchaseWebhookHandler($pdo);
            $body = pwhTransactionCompletedPayload('evt_concurrent', 'txn_concurrent', 'raw-ref-concurrent');
            $result = $handler->handle($body, pwhSign($body));

            assertSame(200, $result->statusCode, 'the losing claim must be safely acknowledged, not an error');
            assertSame('duplicate event, already processed', $result->message, 'must report as a duplicate event');

            $grantCount = (int) $pdo->query('SELECT COUNT(*) FROM transaction_grants')->fetchColumn();
            assertSame(0, $grantCount, 'no grant may be created for a delivery that lost the event claim');

            $consumedAt = $pdo->query("SELECT consumed_at FROM purchase_intents WHERE purchase_ref_hash = '" . hash('sha256', 'raw-ref-concurrent') . "'")->fetchColumn();
            assertSame(null, $consumedAt, 'the purchase_intent must remain unconsumed -- business logic must never run for a delivery that lost the claim');
        },

        'a mid-transaction failure after the event claim rolls back the claim, the grant, and the consumed purchase_intent together' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-crash', new \DateTimeImmutable('+30 minutes'));

            // Force a failure AFTER the intent is consumed and the grant
            // is created, but during the entitlement recompute step, by
            // removing the table EntitlementRepository::activate()
            // writes to. This is a deliberately broken-environment proxy
            // for "the process crashes partway through" -- the important
            // property under test is what handle() leaves behind in the
            // OTHER tables when this step fails, not the specific cause.
            $pdo->exec('DROP TABLE entitlements');

            $handler = makePurchaseWebhookHandler($pdo);
            $body = pwhTransactionCompletedPayload('evt_crash', 'txn_crash', 'raw-ref-crash');

            $threw = false;
            try {
                $handler->handle($body, pwhSign($body));
            } catch (\Throwable $e) {
                $threw = true;
            }
            assertTrue($threw, 'a failure inside the transaction must propagate as an exception, not be swallowed as a normal result -- server/paddle-webhook.php turns this into a 500 so Paddle retries');

            $grantCount = (int) $pdo->query('SELECT COUNT(*) FROM transaction_grants')->fetchColumn();
            assertSame(0, $grantCount, 'the grant write must be rolled back when a later step in the same transaction fails');

            $eventCount = (int) $pdo->query('SELECT COUNT(*) FROM payment_events')->fetchColumn();
            assertSame(0, $eventCount, 'the event claim must be rolled back too -- otherwise Paddle\'s retry of this event_id would be silently swallowed as "already processed" forever');

            $consumedAt = $pdo->query("SELECT consumed_at FROM purchase_intents WHERE purchase_ref_hash = '" . hash('sha256', 'raw-ref-crash') . "'")->fetchColumn();
            assertSame(null, $consumedAt, 'the purchase_intent consumption must also roll back, so a redelivery can consume it again rather than being permanently locked out');
        },

        'redelivering the same event after a mid-transaction failure is fixed succeeds exactly once' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-retry', new \DateTimeImmutable('+30 minutes'));
            $pdo->exec('DROP TABLE entitlements');

            $handler = makePurchaseWebhookHandler($pdo);
            $body = pwhTransactionCompletedPayload('evt_retry', 'txn_retry', 'raw-ref-retry');

            try {
                $handler->handle($body, pwhSign($body));
            } catch (\Throwable) {
                // Expected -- see the rollback test above.
            }

            // "Fix the bug": recreate the table the earlier failure was
            // forced by, matching the schema makePurchaseWebhookTestDb()
            // creates.
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

            $retryResult = $handler->handle($body, pwhSign($body));

            assertSame(200, $retryResult->statusCode, 'redelivery of the same event_id after the fault is fixed must succeed');
            assertSame('event processed: transaction.completed', $retryResult->message, 'redelivery should process transaction.completed normally');

            $grantCount = (int) $pdo->query('SELECT COUNT(*) FROM transaction_grants')->fetchColumn();
            assertSame(1, $grantCount, 'exactly one grant should exist after the successful redelivery -- the earlier rolled-back attempt must not have left a partial row');

            $entitlements = new EntitlementRepository($pdo);
            $found = $entitlements->find('user-1', 'full_tamamizu');
            assertTrue($found !== null && $found['active'] === true, 'entitlement should be active after the successful redelivery');

            $eventCount = (int) $pdo->query('SELECT COUNT(*) FROM payment_events')->fetchColumn();
            assertSame(1, $eventCount, 'exactly one payment_events row should exist -- the failed first attempt left none behind');
        },

        // -- Phase H1-3: chargeback / dispute handling --

        'chargeback action revokes an active grant' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-cb1', 'evt_cb1_txn', 'txn_cb1');

            $body = pwhAdjustmentPayload('evt_cb1_cb', 'adjustment.created', 'txn_cb1', 'chargeback', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($body, pwhSign($body));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('chargeback', $grants->findByTransactionId('txn_cb1')['status'], 'grant status should be chargeback');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement should be revoked');
        },

        'chargeback_warning action revokes an active grant into chargeback_pending' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-cbw1', 'evt_cbw1_txn', 'txn_cbw1');

            $body = pwhAdjustmentPayload('evt_cbw1_w', 'adjustment.created', 'txn_cbw1', 'chargeback_warning', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($body, pwhSign($body));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('chargeback_pending', $grants->findByTransactionId('txn_cbw1')['status'], 'grant status should be chargeback_pending');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement should be revoked on a chargeback warning, not just a full chargeback');
        },

        'chargeback does not depend on data.status -- an unrecognized/nonsensical status value is ignored, only action matters' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-cbns', 'evt_cbns_txn', 'txn_cbns');

            // A status value that would be meaningless/unrecognized for
            // the refund lifecycle -- proves the chargeback branch never
            // reads it.
            $body = pwhAdjustmentPayload('evt_cbns_cb', 'adjustment.created', 'txn_cbns', 'chargeback', 'totally_not_a_real_status', 'also_not_real', '2026-01-02T00:00:00Z');
            $result = $handler->handle($body, pwhSign($body));

            assertSame(200, $result->statusCode, 'should be processed normally despite the nonsensical status');
            $grants = new TransactionGrantRepository($pdo);
            assertSame('chargeback', $grants->findByTransactionId('txn_cbns')['status'], 'action alone must decide the transition regardless of data.status content');
        },

        'chargeback_reverse restores an active entitlement only from a chargeback grant' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-cbr1', 'evt_cbr1_txn', 'txn_cbr1');

            $cbBody = pwhAdjustmentPayload('evt_cbr1_cb', 'adjustment.created', 'txn_cbr1', 'chargeback', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($cbBody, pwhSign($cbBody));

            $reverseBody = pwhAdjustmentPayload('evt_cbr1_rev', 'adjustment.created', 'txn_cbr1', 'chargeback_reverse', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $handler->handle($reverseBody, pwhSign($reverseBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('active', $grants->findByTransactionId('txn_cbr1')['status'], 'grant should be restored to active');
            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement should be restored');
        },

        'chargeback_reverse does NOT restore a grant whose status is chargeback_pending -- wrong pairing, must use chargeback_warning_reverse' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-cbr2', 'evt_cbr2_txn', 'txn_cbr2');

            $warningBody = pwhAdjustmentPayload('evt_cbr2_w', 'adjustment.created', 'txn_cbr2', 'chargeback_warning', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($warningBody, pwhSign($warningBody));

            // Wrong reversal action for a chargeback_pending grant.
            $wrongReverseBody = pwhAdjustmentPayload('evt_cbr2_rev', 'adjustment.created', 'txn_cbr2', 'chargeback_reverse', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $handler->handle($wrongReverseBody, pwhSign($wrongReverseBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('chargeback_pending', $grants->findByTransactionId('txn_cbr2')['status'], 'status must remain chargeback_pending -- chargeback_reverse must not fire from it');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain revoked');
        },

        'chargeback_warning_reverse restores an active entitlement only from a chargeback_pending grant' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-cbwr1', 'evt_cbwr1_txn', 'txn_cbwr1');

            $warningBody = pwhAdjustmentPayload('evt_cbwr1_w', 'adjustment.created', 'txn_cbwr1', 'chargeback_warning', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($warningBody, pwhSign($warningBody));

            $reverseBody = pwhAdjustmentPayload('evt_cbwr1_rev', 'adjustment.created', 'txn_cbwr1', 'chargeback_warning_reverse', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $handler->handle($reverseBody, pwhSign($reverseBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('active', $grants->findByTransactionId('txn_cbwr1')['status'], 'grant should be restored to active');
            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement should be restored');
        },

        'chargeback_warning_reverse does NOT restore a grant whose status is chargeback -- wrong pairing, must use chargeback_reverse' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-cbwr2', 'evt_cbwr2_txn', 'txn_cbwr2');

            $cbBody = pwhAdjustmentPayload('evt_cbwr2_cb', 'adjustment.created', 'txn_cbwr2', 'chargeback', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($cbBody, pwhSign($cbBody));

            $wrongReverseBody = pwhAdjustmentPayload('evt_cbwr2_rev', 'adjustment.created', 'txn_cbwr2', 'chargeback_warning_reverse', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $handler->handle($wrongReverseBody, pwhSign($wrongReverseBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('chargeback', $grants->findByTransactionId('txn_cbwr2')['status'], 'status must remain chargeback -- chargeback_warning_reverse must not fire from it');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain revoked');
        },

        // -- Phase H1-3: the critical refund/chargeback intersection guarantee --

        'chargeback_reverse must NEVER reactivate a grant that was already fully refunded (finalized refund is terminal)' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-refch1', 'evt_refch1_txn', 'txn_refch1');

            // Fully refund the grant first (existing refund lifecycle).
            $refundBody = pwhAdjustmentPayload('evt_refch1_refund', 'adjustment.updated', 'txn_refch1', 'refund', 'approved', 'full', '2026-01-02T00:00:00Z');
            $handler->handle($refundBody, pwhSign($refundBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_refch1')['status'], 'sanity check: grant should be refunded');

            // A LATER, out-of-order chargeback_reverse for the SAME
            // transaction must not reactivate it -- there is no valid
            // real-world reason a reversal should apply to a transaction
            // that was never in a chargeback state, and treating
            // "newer occurred_at" alone as sufficient would let this
            // happen.
            $reverseBody = pwhAdjustmentPayload('evt_refch1_rev', 'adjustment.created', 'txn_refch1', 'chargeback_reverse', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $handler->handle($reverseBody, pwhSign($reverseBody));

            assertSame('refunded', $grants->findByTransactionId('txn_refch1')['status'], 'status must remain refunded -- chargeback_reverse must never fire from a refunded grant');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain revoked -- a finalized refund is never undone by a chargeback reversal');
        },

        'chargeback_warning_reverse must NEVER reactivate a grant that was already fully refunded' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-refch2', 'evt_refch2_txn', 'txn_refch2');

            $refundBody = pwhAdjustmentPayload('evt_refch2_refund', 'adjustment.updated', 'txn_refch2', 'refund', 'approved', 'full', '2026-01-02T00:00:00Z');
            $handler->handle($refundBody, pwhSign($refundBody));

            $reverseBody = pwhAdjustmentPayload('evt_refch2_rev', 'adjustment.created', 'txn_refch2', 'chargeback_warning_reverse', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $handler->handle($reverseBody, pwhSign($reverseBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_refch2')['status'], 'status must remain refunded');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain revoked');
        },

        'a charge that was disputed and then reversed does not later get re-refunded into a wrong state -- chargeback then reverse then rejected refund all apply cleanly in order' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-mix1', 'evt_mix1_txn', 'txn_mix1');

            $cbBody = pwhAdjustmentPayload('evt_mix1_cb', 'adjustment.created', 'txn_mix1', 'chargeback', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($cbBody, pwhSign($cbBody));

            $reverseBody = pwhAdjustmentPayload('evt_mix1_rev', 'adjustment.created', 'txn_mix1', 'chargeback_reverse', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $handler->handle($reverseBody, pwhSign($reverseBody));

            // The refund lifecycle is untouched by chargeback handling --
            // a later, unrelated refund pending_approval must still work
            // normally on the now-'active' grant.
            $refundPendingBody = pwhAdjustmentPayload('evt_mix1_refpending', 'adjustment.created', 'txn_mix1', 'refund', 'pending_approval', 'full', '2026-01-04T00:00:00Z');
            $handler->handle($refundPendingBody, pwhSign($refundPendingBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refund_pending', $grants->findByTransactionId('txn_mix1')['status'], 'the refund lifecycle must still work normally after a chargeback/reverse cycle');
            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'refund_pending remains entitlement-bearing');
        },

        // -- Regression (GitHub diff review finding): 'refunded' must be a
        // true terminal state, unreachable from ANY later chargeback-family
        // event -- not just directly by a reversal, but via the indirect
        // path refunded -> [later] chargeback -> [later still]
        // chargeback_reverse -> active, which the original forward-
        // transition-unrestricted design let through even though each
        // individual hop's own guard was satisfied.

        'refunded -> chargeback -> chargeback_reverse: the grant must remain refunded, never revived' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-term1', 'evt_term1_txn', 'txn_term1');

            $refundBody = pwhAdjustmentPayload('evt_term1_refund', 'adjustment.updated', 'txn_term1', 'refund', 'approved', 'full', '2026-01-02T00:00:00Z');
            $handler->handle($refundBody, pwhSign($refundBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_term1')['status'], 'sanity check: grant should be refunded');

            // The chargeback itself must now be refused from 'refunded'.
            $cbBody = pwhAdjustmentPayload('evt_term1_cb', 'adjustment.created', 'txn_term1', 'chargeback', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $cbResult = $handler->handle($cbBody, pwhSign($cbBody));
            assertSame(200, $cbResult->statusCode, 'a refused chargeback transition must still be safely acknowledged, not an error');
            assertSame('refunded', $grants->findByTransactionId('txn_term1')['status'], 'chargeback must not apply to an already-refunded grant');

            // Even though the chargeback itself did not apply, redeliver
            // the reverse anyway to prove the indirect path is closed at
            // BOTH hops, not just the first: the reverse must still be
            // refused, because the grant was never actually 'chargeback'.
            $reverseBody = pwhAdjustmentPayload('evt_term1_rev', 'adjustment.created', 'txn_term1', 'chargeback_reverse', 'n/a', 'n/a', '2026-01-04T00:00:00Z');
            $handler->handle($reverseBody, pwhSign($reverseBody));

            assertSame('refunded', $grants->findByTransactionId('txn_term1')['status'], 'status must remain refunded -- the indirect refunded -> chargeback -> chargeback_reverse -> active path must never reactivate a finalized refund');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain revoked throughout');
        },

        'refunded -> chargeback_warning -> chargeback_warning_reverse: the grant must remain refunded, never revived' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-term2', 'evt_term2_txn', 'txn_term2');

            $refundBody = pwhAdjustmentPayload('evt_term2_refund', 'adjustment.updated', 'txn_term2', 'refund', 'approved', 'full', '2026-01-02T00:00:00Z');
            $handler->handle($refundBody, pwhSign($refundBody));

            $warningBody = pwhAdjustmentPayload('evt_term2_w', 'adjustment.created', 'txn_term2', 'chargeback_warning', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $handler->handle($warningBody, pwhSign($warningBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_term2')['status'], 'chargeback_warning must not apply to an already-refunded grant');

            $reverseBody = pwhAdjustmentPayload('evt_term2_rev', 'adjustment.created', 'txn_term2', 'chargeback_warning_reverse', 'n/a', 'n/a', '2026-01-04T00:00:00Z');
            $handler->handle($reverseBody, pwhSign($reverseBody));

            assertSame('refunded', $grants->findByTransactionId('txn_term2')['status'], 'status must remain refunded -- the indirect refunded -> chargeback_warning -> chargeback_warning_reverse -> active path must never reactivate a finalized refund');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain revoked throughout');
        },

        'queued refund -> chargeback -> reverse reconciled in occurred_at order still ends refunded (refund remains terminal even fully out-of-order)' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-term3', new \DateTimeImmutable('+30 minutes'));

            // All three adjustments arrive (and queue) BEFORE the
            // transaction.completed, out of occurred_at order too --
            // reconciliation must still land on 'refunded' because each
            // hop's guard is enforced during replay, not just direct
            // delivery.
            $reverseBody = pwhAdjustmentPayload('evt_term3_rev', 'adjustment.created', 'txn_term3', 'chargeback_reverse', 'n/a', 'n/a', '2026-01-04T00:00:00Z');
            $handler->handle($reverseBody, pwhSign($reverseBody));

            $refundBody = pwhAdjustmentPayload('evt_term3_refund', 'adjustment.updated', 'txn_term3', 'refund', 'approved', 'full', '2026-01-02T00:00:00Z');
            $handler->handle($refundBody, pwhSign($refundBody));

            $cbBody = pwhAdjustmentPayload('evt_term3_cb', 'adjustment.created', 'txn_term3', 'chargeback', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $handler->handle($cbBody, pwhSign($cbBody));

            $txnBody = pwhTransactionCompletedPayload('evt_term3_txn', 'txn_term3', 'raw-ref-term3', '2026-01-01T00:00:00Z');
            $handler->handle($txnBody, pwhSign($txnBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('refunded', $grants->findByTransactionId('txn_term3')['status'], 'reconciling refund(02) -> chargeback(03) -> reverse(04) in occurred_at order must still end refunded: the chargeback at 03 must be refused (source is refunded), so the reverse at 04 has no chargeback state to reverse from either');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain revoked');
        },

        'chargeback_warning -> chargeback escalation remains possible (legitimate upgrade, not blocked by the refunded-terminal fix)' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-esc1', 'evt_esc1_txn', 'txn_esc1');

            $warningBody = pwhAdjustmentPayload('evt_esc1_w', 'adjustment.created', 'txn_esc1', 'chargeback_warning', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($warningBody, pwhSign($warningBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('chargeback_pending', $grants->findByTransactionId('txn_esc1')['status'], 'sanity check: warning should apply');

            $cbBody = pwhAdjustmentPayload('evt_esc1_cb', 'adjustment.created', 'txn_esc1', 'chargeback', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $cbResult = $handler->handle($cbBody, pwhSign($cbBody));

            assertSame(200, $cbResult->statusCode, 'the escalation should be safely processed');
            assertSame('chargeback', $grants->findByTransactionId('txn_esc1')['status'], 'a warning must still be able to escalate into a full chargeback');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain revoked after escalation');
        },

        'chargeback -> refund -> reverse: refund remains terminal even when a chargeback preceded it' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-term4', 'evt_term4_txn', 'txn_term4');

            $cbBody = pwhAdjustmentPayload('evt_term4_cb', 'adjustment.created', 'txn_term4', 'chargeback', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($cbBody, pwhSign($cbBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('chargeback', $grants->findByTransactionId('txn_term4')['status'], 'sanity check: chargeback should apply');

            // A refund lifecycle event is unrelated to the chargeback
            // guard system entirely -- applyRefundTransition() has no
            // source-status restriction (unchanged, pre-existing
            // behavior), so an approved full refund still applies
            // regardless of the current chargeback state.
            $refundBody = pwhAdjustmentPayload('evt_term4_refund', 'adjustment.updated', 'txn_term4', 'refund', 'approved', 'full', '2026-01-03T00:00:00Z');
            $handler->handle($refundBody, pwhSign($refundBody));

            assertSame('refunded', $grants->findByTransactionId('txn_term4')['status'], 'sanity check: refund should apply on top of the chargeback state');

            $reverseBody = pwhAdjustmentPayload('evt_term4_rev', 'adjustment.created', 'txn_term4', 'chargeback_reverse', 'n/a', 'n/a', '2026-01-04T00:00:00Z');
            $handler->handle($reverseBody, pwhSign($reverseBody));

            assertSame('refunded', $grants->findByTransactionId('txn_term4')['status'], 'status must remain refunded -- a later chargeback_reverse must not undo a refund that landed on top of an earlier chargeback');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain revoked');
        },

        // -- Phase H1-3: out-of-order chargeback events --

        'a chargeback arriving before its transaction.completed is queued and reconciled once the transaction arrives' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-ooo1', new \DateTimeImmutable('+30 minutes'));

            $cbBody = pwhAdjustmentPayload('evt_ooo1_cb', 'adjustment.created', 'txn_ooo1', 'chargeback', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $cbResult = $handler->handle($cbBody, pwhSign($cbBody));
            assertSame(200, $cbResult->statusCode, 'the early chargeback should be safely acknowledged');

            $grants = new TransactionGrantRepository($pdo);
            assertSame(null, $grants->findByTransactionId('txn_ooo1'), 'no grant should exist yet');

            $txnBody = pwhTransactionCompletedPayload('evt_ooo1_txn', 'txn_ooo1', 'raw-ref-ooo1', '2026-01-01T00:00:00Z');
            $handler->handle($txnBody, pwhSign($txnBody));

            assertSame('chargeback', $grants->findByTransactionId('txn_ooo1')['status'], 'the queued chargeback should be reconciled once the grant exists');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement should be revoked after reconciliation');
        },

        'multiple queued chargeback-family events reconcile in occurred_at order, not arrival order' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-ooo2', new \DateTimeImmutable('+30 minutes'));

            // Arrival order: reverse first, then the chargeback it
            // reverses -- but occurred_at says the chargeback happened
            // first. Both queue (no grant exists yet); reconciliation
            // must replay them in occurred_at order, so the reverse
            // ultimately applies cleanly on top of the chargeback.
            $reverseBody = pwhAdjustmentPayload('evt_ooo2_rev', 'adjustment.created', 'txn_ooo2', 'chargeback_reverse', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $handler->handle($reverseBody, pwhSign($reverseBody));

            $cbBody = pwhAdjustmentPayload('evt_ooo2_cb', 'adjustment.created', 'txn_ooo2', 'chargeback', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($cbBody, pwhSign($cbBody));

            $txnBody = pwhTransactionCompletedPayload('evt_ooo2_txn', 'txn_ooo2', 'raw-ref-ooo2', '2026-01-01T00:00:00Z');
            $handler->handle($txnBody, pwhSign($txnBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('active', $grants->findByTransactionId('txn_ooo2')['status'], 'reconciliation must apply the chargeback then the reverse in occurred_at order, ending active');
            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement should be active after correct in-order reconciliation');
        },

        'a stale queued chargeback_reverse (occurred_at older than a newer queued chargeback) does not win reconciliation' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            $intents = new PurchaseIntentRepository($pdo);
            $intents->create('user-1', 'full_tamamizu', 'raw-ref-ooo3', new \DateTimeImmutable('+30 minutes'));

            // Reverse is OLDER (2026-01-02) than the chargeback it would
            // otherwise reverse (2026-01-03) -- correct final state is
            // 'chargeback', not 'active'.
            $reverseBody = pwhAdjustmentPayload('evt_ooo3_rev', 'adjustment.created', 'txn_ooo3', 'chargeback_reverse', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($reverseBody, pwhSign($reverseBody));

            $cbBody = pwhAdjustmentPayload('evt_ooo3_cb', 'adjustment.created', 'txn_ooo3', 'chargeback', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $handler->handle($cbBody, pwhSign($cbBody));

            $txnBody = pwhTransactionCompletedPayload('evt_ooo3_txn', 'txn_ooo3', 'raw-ref-ooo3', '2026-01-01T00:00:00Z');
            $handler->handle($txnBody, pwhSign($txnBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('chargeback', $grants->findByTransactionId('txn_ooo3')['status'], 'the chronologically later chargeback must be the final state, not the earlier reverse');
            $entitlements = new EntitlementRepository($pdo);
            assertFalse($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain revoked');
        },

        // -- Phase H1-3: repurchase interaction --

        'repurchase: a chargeback on an old transaction never touches a new transaction for the same user/product' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-rep1a', 'evt_rep1a_txn', 'txn_rep1a');

            $cbBody = pwhAdjustmentPayload('evt_rep1a_cb', 'adjustment.created', 'txn_rep1a', 'chargeback', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($cbBody, pwhSign($cbBody));

            // Repurchase -- a distinct transaction/intent for the same
            // user/product.
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-rep1b', 'evt_rep1b_txn', 'txn_rep1b');

            $grants = new TransactionGrantRepository($pdo);
            assertSame('chargeback', $grants->findByTransactionId('txn_rep1a')['status'], 'the old chargedback grant must be untouched');
            assertSame('active', $grants->findByTransactionId('txn_rep1b')['status'], 'the repurchase grant must be active');
            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'the repurchase must grant entitlement despite the old chargeback');
        },

        'repurchase: a late out-of-order chargeback_reverse for an old, already-chargedback transaction does not affect a newer repurchase grant' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-rep2a', 'evt_rep2a_txn', 'txn_rep2a');

            $cbBody = pwhAdjustmentPayload('evt_rep2a_cb', 'adjustment.created', 'txn_rep2a', 'chargeback', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $handler->handle($cbBody, pwhSign($cbBody));

            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-rep2b', 'evt_rep2b_txn', 'txn_rep2b');

            // A late chargeback_reverse for the OLD transaction arrives.
            $reverseBody = pwhAdjustmentPayload('evt_rep2a_rev', 'adjustment.created', 'txn_rep2a', 'chargeback_reverse', 'n/a', 'n/a', '2026-01-03T00:00:00Z');
            $handler->handle($reverseBody, pwhSign($reverseBody));

            $grants = new TransactionGrantRepository($pdo);
            assertSame('active', $grants->findByTransactionId('txn_rep2a')['status'], 'the old transaction is correctly restored by its own reverse');
            assertSame('active', $grants->findByTransactionId('txn_rep2b')['status'], 'the repurchase grant must remain untouched by the old transaction\'s reverse');
            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find('user-1', 'full_tamamizu')['active'], 'entitlement must remain active throughout -- B alone is enough');
        },

        // -- Phase H1-3: transaction boundary preserved from H1-2 --

        'a chargeback event still goes through the same PDO transaction as other adjustment handling -- a claim collision is still safely rejected' => function () {
            $pdo = makePurchaseWebhookTestDb();
            $handler = makePurchaseWebhookHandler($pdo);
            pwhMakeActiveGrant($pdo, $handler, 'user-1', 'raw-ref-cbtx1', 'evt_cbtx1_txn', 'txn_cbtx1');

            $body = pwhAdjustmentPayload('evt_cbtx1_cb', 'adjustment.created', 'txn_cbtx1', 'chargeback', 'n/a', 'n/a', '2026-01-02T00:00:00Z');
            $first = $handler->handle($body, pwhSign($body));
            $second = $handler->handle($body, pwhSign($body));

            assertSame(200, $first->statusCode, 'first delivery should succeed');
            assertSame(200, $second->statusCode, 'duplicate delivery of the same chargeback event must be safely acknowledged');
            $eventCount = (int) $pdo->query("SELECT COUNT(*) FROM payment_events WHERE paddle_event_id = 'evt_cbtx1_cb'")->fetchColumn();
            assertSame(1, $eventCount, 'the event claim must still be exactly-once for chargeback-family events, per the H1-2 transaction boundary');
        },
    ];
}
