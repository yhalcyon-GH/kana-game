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
        // server/sql/schema.sql (uniq_user_product). A re-delivered webhook
        // or a repeat purchase for the same user/product safely converges
        // on the same row rather than erroring or duplicating.
        //
        // Phase H1-1: this used to be a portable SELECT-then-INSERT/UPDATE,
        // which has a first-insert race between the SELECT and the INSERT —
        // two concurrent webhook deliveries for the same (user, product)
        // could both see no row and both attempt INSERT, throwing an
        // uncaught PDOException from the loser. That was accepted for this
        // PoC's original Sandbox/single-fixed-user scope but is unsafe now
        // that this path serves real, concurrent users (Phase 3A+). Fixed
        // here with a single atomic INSERT ... ON DUPLICATE KEY UPDATE /
        // ON CONFLICT statement per dialect, still kept portable across
        // the real MySQL deployment and SQLite in tests/run-tests.php.
        $driver = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $sql = $driver === 'sqlite'
            ? 'INSERT INTO entitlements (internal_user_id, product_key, active, paddle_transaction_id, updated_at)
               VALUES (:user_id, :product_key, :active, :transaction_id, CURRENT_TIMESTAMP)
               ON CONFLICT (internal_user_id, product_key)
               DO UPDATE SET active = excluded.active,
                              paddle_transaction_id = excluded.paddle_transaction_id,
                              updated_at = CURRENT_TIMESTAMP'
            : 'INSERT INTO entitlements (internal_user_id, product_key, active, paddle_transaction_id)
               VALUES (:user_id, :product_key, :active, :transaction_id)
               ON DUPLICATE KEY UPDATE active = VALUES(active),
                                        paddle_transaction_id = VALUES(paddle_transaction_id),
                                        updated_at = CURRENT_TIMESTAMP';

        $statement = $this->pdo->prepare($sql);
        $statement->execute([
            'user_id' => $internalUserId,
            'product_key' => $productKey,
            'active' => $active ? 1 : 0,
            'transaction_id' => $paddleTransactionId,
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
