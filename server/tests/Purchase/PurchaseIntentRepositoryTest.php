<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Purchase\PurchaseIntentRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Purchase/PurchaseIntentRepository.php';

function makePurchaseIntentsTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
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
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function purchaseIntentRepositoryTests(): array
{
    return [
        'create() then findUserIdForHash() resolves the correct user' => function () {
            $repo = new PurchaseIntentRepository(makePurchaseIntentsTestDb());
            $repo->create('user-123', 'full_tamamizu', 'raw-ref-abc', new \DateTimeImmutable('+30 minutes'));

            $userId = $repo->findUserIdForHash(hash('sha256', 'raw-ref-abc'));
            assertSame('user-123', $userId, 'the hash lookup should resolve to the creating user');
        },

        'the raw purchase_ref is never stored in the database' => function () {
            $pdo = makePurchaseIntentsTestDb();
            $repo = new PurchaseIntentRepository($pdo);
            $repo->create('user-abc', 'full_tamamizu', 'super-secret-raw-ref-value', new \DateTimeImmutable('+30 minutes'));

            $rows = $pdo->query('SELECT purchase_ref_hash FROM purchase_intents')->fetchAll();
            foreach ($rows as $row) {
                assertFalse(
                    str_contains($row['purchase_ref_hash'], 'super-secret-raw-ref-value'),
                    'the raw purchase_ref must never appear in a persisted column',
                );
            }
        },

        'consume() with a valid, unexpired, unconsumed hash succeeds exactly once' => function () {
            $repo = new PurchaseIntentRepository(makePurchaseIntentsTestDb());
            $repo->create('user-123', 'full_tamamizu', 'raw-ref-once', new \DateTimeImmutable('+30 minutes'));
            $hash = hash('sha256', 'raw-ref-once');

            assertTrue($repo->consume($hash, 'txn_1'), 'first consume should succeed');
            assertFalse($repo->consume($hash, 'txn_2'), 'second consume of the same intent must fail (single-use)');
        },

        'consume() with an unknown hash fails' => function () {
            $repo = new PurchaseIntentRepository(makePurchaseIntentsTestDb());
            assertFalse($repo->consume(hash('sha256', 'never-issued'), 'txn_1'), 'an unknown hash must not be consumable');
        },

        'consume() with an expired intent fails' => function () {
            $repo = new PurchaseIntentRepository(makePurchaseIntentsTestDb());
            $repo->create('user-123', 'full_tamamizu', 'raw-ref-expired', new \DateTimeImmutable('-1 minute'));

            assertFalse($repo->consume(hash('sha256', 'raw-ref-expired'), 'txn_1'), 'an expired intent must not be consumable');
        },

        'consume() binds the paddle_transaction_id on success' => function () {
            $pdo = makePurchaseIntentsTestDb();
            $repo = new PurchaseIntentRepository($pdo);
            $repo->create('user-123', 'full_tamamizu', 'raw-ref-bind', new \DateTimeImmutable('+30 minutes'));
            $repo->consume(hash('sha256', 'raw-ref-bind'), 'txn_bound');

            $txnId = $pdo->query("SELECT paddle_transaction_id FROM purchase_intents WHERE user_id = 'user-123'")->fetchColumn();
            assertSame('txn_bound', $txnId, 'paddle_transaction_id should be bound on consume');
        },

        'findUserIdForHash() returns null for an unknown hash' => function () {
            $repo = new PurchaseIntentRepository(makePurchaseIntentsTestDb());
            assertSame(null, $repo->findUserIdForHash(hash('sha256', 'nonexistent')), 'unknown hash should return null');
        },

        'findProductKeyForHash() returns the bound product_key for a known hash' => function () {
            $repo = new PurchaseIntentRepository(makePurchaseIntentsTestDb());
            $repo->create('user-123', 'full_tamamizu', 'raw-ref-product', new \DateTimeImmutable('+30 minutes'));

            $productKey = $repo->findProductKeyForHash(hash('sha256', 'raw-ref-product'));
            assertSame('full_tamamizu', $productKey, 'product_key should match');
        },

        'findIdForHash() returns the intent row id for a known hash' => function () {
            $pdo = makePurchaseIntentsTestDb();
            $repo = new PurchaseIntentRepository($pdo);
            $repo->create('user-123', 'full_tamamizu', 'raw-ref-id', new \DateTimeImmutable('+30 minutes'));

            $id = $repo->findIdForHash(hash('sha256', 'raw-ref-id'));
            assertTrue($id !== null, 'a known hash should resolve to a non-null id');

            $expected = (int) $pdo->query("SELECT id FROM purchase_intents WHERE user_id = 'user-123'")->fetchColumn();
            assertSame($expected, $id, 'the returned id should match the actual row id');
        },
    ];
}
