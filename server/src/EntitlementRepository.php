<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

use PDO;

/**
 * Reads/writes the entitlements table. See server/sql/schema.sql — one row
 * per (internal_user_id, product_key), UPSERTed so purchases, webhook
 * retries, and refunds all converge on the same row instead of duplicating.
 */
final class EntitlementRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function activate(string $internalUserId, string $productKey, string $paddleTransactionId): void
    {
        $this->upsert($internalUserId, $productKey, true, $paddleTransactionId);
    }

    public function revoke(string $internalUserId, string $productKey, string $paddleTransactionId): void
    {
        $this->upsert($internalUserId, $productKey, false, $paddleTransactionId);
    }

    private function upsert(string $internalUserId, string $productKey, bool $active, string $paddleTransactionId): void
    {
        // Relies on the UNIQUE (internal_user_id, product_key) key from
        // server/sql/schema.sql. A re-delivered webhook or a repeat
        // Sandbox purchase for the same user/product safely converges on
        // the same row rather than erroring or duplicating.
        //
        // Uses a portable SELECT-then-INSERT/UPDATE instead of MySQL's
        // `INSERT ... ON DUPLICATE KEY UPDATE` so the exact same repository
        // code runs against the real MySQL deployment AND against SQLite
        // in tests/run-tests.php — this PoC intentionally avoids a second,
        // divergent code path just for tests. A theoretical two-writer
        // race on first-ever insert for a given (user, product) is
        // acceptable for this PoC's scope (Sandbox, single fixed test
        // user) and is called out in docs/paddle-webhook-poc.md's Known
        // limitations.
        $existing = $this->pdo->prepare(
            'SELECT id FROM entitlements WHERE internal_user_id = :user_id AND product_key = :product_key LIMIT 1',
        );
        $existing->execute(['user_id' => $internalUserId, 'product_key' => $productKey]);
        $id = $existing->fetchColumn();

        if ($id === false) {
            $insert = $this->pdo->prepare(
                'INSERT INTO entitlements (internal_user_id, product_key, active, paddle_transaction_id)
                 VALUES (:user_id, :product_key, :active, :transaction_id)',
            );
            $insert->execute([
                'user_id' => $internalUserId,
                'product_key' => $productKey,
                'active' => $active ? 1 : 0,
                'transaction_id' => $paddleTransactionId,
            ]);
            return;
        }

        $update = $this->pdo->prepare(
            'UPDATE entitlements
             SET active = :active, paddle_transaction_id = :transaction_id, updated_at = CURRENT_TIMESTAMP
             WHERE id = :id',
        );
        $update->execute([
            'active' => $active ? 1 : 0,
            'transaction_id' => $paddleTransactionId,
            'id' => $id,
        ]);
    }

    /**
     * @return array{product_key: string, active: bool, updated_at: string}|null
     */
    public function find(string $internalUserId, string $productKey): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT product_key, active, updated_at
             FROM entitlements
             WHERE internal_user_id = :user_id AND product_key = :product_key
             LIMIT 1',
        );
        $statement->execute(['user_id' => $internalUserId, 'product_key' => $productKey]);
        /** @var array{product_key: string, active: string|int, updated_at: string}|false $row */
        $row = $statement->fetch();
        if ($row === false) {
            return null;
        }

        return [
            'product_key' => $row['product_key'],
            'active' => ((int) $row['active']) === 1,
            'updated_at' => $row['updated_at'],
        ];
    }
}
