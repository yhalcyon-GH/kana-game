<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\PaddleSignature;
use KanaGame\Paddle\PaymentEventRepository;
use KanaGame\Paddle\SandboxUser;
use KanaGame\Paddle\WebhookHandler;
use PDO;

require_once __DIR__ . '/TestCase.php';
require_once __DIR__ . '/../src/PaddleSignature.php';
require_once __DIR__ . '/../src/PaymentEventRepository.php';
require_once __DIR__ . '/../src/EntitlementRepository.php';
require_once __DIR__ . '/../src/SandboxUser.php';
require_once __DIR__ . '/../src/WebhookHandler.php';

const TEST_SECRET = 'test-secret-key';
const TEST_PRICE_ID = 'pri_full_tamamizu_test';
const TEST_PRODUCT_ID = 'pro_full_tamamizu_test';

function makeWebhookTestDb(): PDO
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
    return $pdo;
}

function makeHandler(PDO $pdo): WebhookHandler
{
    return new WebhookHandler(
        new PaddleSignature(TEST_SECRET),
        new PaymentEventRepository($pdo),
        new EntitlementRepository($pdo),
        TEST_PRICE_ID,
        TEST_PRODUCT_ID,
    );
}

function signBody(string $body): string
{
    $ts = time();
    $h1 = hash_hmac('sha256', $ts . ':' . $body, TEST_SECRET);
    return "ts={$ts};h1={$h1}";
}

/**
 * @param array<string, mixed> $overrides
 */
function transactionCompletedBody(array $overrides = []): string
{
    $data = array_replace([
        'id' => 'txn_test_1',
        'status' => 'completed',
        'items' => [
            ['price' => ['id' => TEST_PRICE_ID, 'product_id' => TEST_PRODUCT_ID]],
        ],
        'custom_data' => ['internal_user_id' => SandboxUser::ID],
    ], $overrides);

    return json_encode([
        'event_id' => $overrides['event_id'] ?? 'evt_test_1',
        'event_type' => 'transaction.completed',
        'occurred_at' => '2026-09-06T00:00:00Z',
        'notification_id' => 'ntf_test_1',
        'data' => $data,
    ]);
}

/**
 * @return array<string, callable(): void>
 */
function webhookHandlerTests(): array
{
    return [
        'rejects a request with an invalid signature' => function () {
            $handler = makeHandler(makeWebhookTestDb());
            $body = transactionCompletedBody();
            $result = $handler->handle($body, 'ts=' . time() . ';h1=' . str_repeat('0', 64));

            assertSame(401, $result->statusCode, 'invalid signature must be rejected with 401');
        },

        'rejects a request with a missing signature header' => function () {
            $handler = makeHandler(makeWebhookTestDb());
            $result = $handler->handle(transactionCompletedBody(), null);

            assertSame(401, $result->statusCode, 'missing signature header must be rejected with 401');
        },

        'rejects malformed JSON even with a valid signature' => function () {
            $handler = makeHandler(makeWebhookTestDb());
            $body = 'not json';
            $result = $handler->handle($body, signBody($body));

            assertSame(400, $result->statusCode, 'malformed JSON must be rejected with 400');
        },

        'rejects a payload missing required envelope fields' => function () {
            $handler = makeHandler(makeWebhookTestDb());
            $body = json_encode(['event_type' => 'transaction.completed']); // no event_id/occurred_at/data
            $result = $handler->handle($body, signBody($body));

            assertSame(400, $result->statusCode, 'missing event_id/occurred_at/data must be rejected with 400');
        },

        'processes a valid transaction.completed for Full Tamamizu and activates entitlement' => function () {
            $pdo = makeWebhookTestDb();
            $handler = makeHandler($pdo);
            $body = transactionCompletedBody();
            $result = $handler->handle($body, signBody($body));

            assertSame(200, $result->statusCode, 'valid Full Tamamizu purchase should be processed with 200');

            $entitlements = new EntitlementRepository($pdo);
            $found = $entitlements->find(SandboxUser::ID, WebhookHandler::PRODUCT_KEY_FULL_TAMAMIZU);
            assertTrue($found !== null, 'entitlement row should now exist');
            assertTrue($found['active'], 'entitlement should be active');
        },

        'ignores the same event_id delivered twice (idempotency) without double-processing' => function () {
            $pdo = makeWebhookTestDb();
            $handler = makeHandler($pdo);
            $body = transactionCompletedBody(['event_id' => 'evt_duplicate']);
            $signature = signBody($body);

            $first = $handler->handle($body, $signature);
            $second = $handler->handle($body, $signature);

            assertSame(200, $first->statusCode, 'first delivery should process with 200');
            assertSame(200, $second->statusCode, 'duplicate delivery should still ack with 200 (Paddle must not keep retrying)');

            $count = (int) $pdo->query('SELECT COUNT(*) FROM payment_events')->fetchColumn();
            assertSame(1, $count, 'exactly one payment_events row should exist for one logical event');
        },

        'does not activate entitlement for a transaction with a different price/product id' => function () {
            $pdo = makeWebhookTestDb();
            $handler = makeHandler($pdo);
            $body = transactionCompletedBody([
                'event_id' => 'evt_wrong_product',
                'items' => [['price' => ['id' => 'pri_something_else', 'product_id' => 'pro_something_else']]],
            ]);
            $result = $handler->handle($body, signBody($body));

            assertSame(200, $result->statusCode, 'an unrelated purchase should still be acknowledged (not an error)');

            $entitlements = new EntitlementRepository($pdo);
            assertSame(
                null,
                $entitlements->find(SandboxUser::ID, WebhookHandler::PRODUCT_KEY_FULL_TAMAMIZU),
                'no entitlement should be created for a non-matching price/product',
            );
        },

        'does not activate entitlement for a transaction that is not yet status=completed' => function () {
            $pdo = makeWebhookTestDb();
            $handler = makeHandler($pdo);
            $body = transactionCompletedBody(['event_id' => 'evt_not_completed', 'status' => 'billed']);
            $result = $handler->handle($body, signBody($body));

            assertSame(200, $result->statusCode, 'should still ack with 200');

            $entitlements = new EntitlementRepository($pdo);
            assertSame(null, $entitlements->find(SandboxUser::ID, WebhookHandler::PRODUCT_KEY_FULL_TAMAMIZU), 'no entitlement for a non-completed transaction status');
        },

        'does not activate entitlement when custom_data has no internal_user_id' => function () {
            $pdo = makeWebhookTestDb();
            $handler = makeHandler($pdo);
            $body = transactionCompletedBody(['event_id' => 'evt_no_user', 'custom_data' => ['something_else' => 'x']]);
            $result = $handler->handle($body, signBody($body));

            assertSame(200, $result->statusCode, 'should still ack with 200');

            $entitlements = new EntitlementRepository($pdo);
            assertSame(null, $entitlements->find(SandboxUser::ID, WebhookHandler::PRODUCT_KEY_FULL_TAMAMIZU), 'no entitlement without a usable internal_user_id');
        },

        'safely acknowledges (200) an unrelated/unsupported event type' => function () {
            $pdo = makeWebhookTestDb();
            $handler = makeHandler($pdo);
            $body = json_encode([
                'event_id' => 'evt_unrelated',
                'event_type' => 'subscription.created',
                'occurred_at' => '2026-09-06T00:00:00Z',
                'data' => ['id' => 'sub_1'],
            ]);
            $result = $handler->handle($body, signBody($body));

            assertSame(200, $result->statusCode, 'unsupported event types must be safely ignored with 200, not an error');
        },

        'a refund (adjustment.created, action=refund) revokes entitlement' => function () {
            $pdo = makeWebhookTestDb();
            $handler = makeHandler($pdo);

            // First, a successful purchase activates entitlement.
            $purchase = transactionCompletedBody(['event_id' => 'evt_purchase', 'id' => 'txn_refund_test']);
            $handler->handle($purchase, signBody($purchase));

            $entitlements = new EntitlementRepository($pdo);
            assertTrue($entitlements->find(SandboxUser::ID, WebhookHandler::PRODUCT_KEY_FULL_TAMAMIZU)['active'], 'should be active after purchase');

            // Then a refund adjustment revokes it.
            $refundBody = json_encode([
                'event_id' => 'evt_refund_1',
                'event_type' => 'adjustment.created',
                'occurred_at' => '2026-09-06T01:00:00Z',
                'data' => [
                    'id' => 'adj_1',
                    'action' => 'refund',
                    'type' => 'full',
                    'status' => 'pending_approval',
                    'transaction_id' => 'txn_refund_test',
                ],
            ]);
            $refundResult = $handler->handle($refundBody, signBody($refundBody));

            assertSame(200, $refundResult->statusCode, 'refund event should be processed with 200');
            $afterRefund = $entitlements->find(SandboxUser::ID, WebhookHandler::PRODUCT_KEY_FULL_TAMAMIZU);
            assertFalse($afterRefund['active'], 'entitlement should be inactive after refund');
        },

        'a chargeback adjustment action is safely ignored (not treated as a refund) in Phase 2' => function () {
            $pdo = makeWebhookTestDb();
            $handler = makeHandler($pdo);
            $purchase = transactionCompletedBody(['event_id' => 'evt_purchase_cb', 'id' => 'txn_cb_test']);
            $handler->handle($purchase, signBody($purchase));

            $chargebackBody = json_encode([
                'event_id' => 'evt_chargeback_1',
                'event_type' => 'adjustment.created',
                'occurred_at' => '2026-09-06T01:00:00Z',
                'data' => [
                    'id' => 'adj_2',
                    'action' => 'chargeback',
                    'transaction_id' => 'txn_cb_test',
                ],
            ]);
            $result = $handler->handle($chargebackBody, signBody($chargebackBody));

            assertSame(200, $result->statusCode, 'should still ack with 200');
            $entitlements = new EntitlementRepository($pdo);
            $found = $entitlements->find(SandboxUser::ID, WebhookHandler::PRODUCT_KEY_FULL_TAMAMIZU);
            assertTrue($found['active'], 'Phase 2 does not implement chargeback handling — entitlement must remain untouched, not silently revoked or left ambiguous');
        },
    ];
}
