<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

use PDO;

/**
 * Reads/writes purchase_intents. The raw purchase_ref is never stored
 * here — only SHA-256(raw), matching the design spec's corrected
 * guarantee: "never persisted/logged by us," not "exists only in
 * caller memory" (Paddle itself legitimately receives the raw value).
 * consume() enforces single-use via an atomic conditional UPDATE +
 * affected-row-count check — never SELECT-then-UPDATE, same pattern as
 * PR A's MagicLinkTokenRepository::consume().
 */
final class PurchaseIntentRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function create(string $userId, string $productKey, string $rawPurchaseRef, \DateTimeImmutable $expiresAt): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO purchase_intents (purchase_ref_hash, user_id, product_key, expires_at, created_at)
             VALUES (:hash, :user_id, :product_key, :expires_at, CURRENT_TIMESTAMP)',
        );
        $statement->execute([
            'hash' => hash('sha256', $rawPurchaseRef),
            'user_id' => $userId,
            'product_key' => $productKey,
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        ]);
    }

    /**
     * Atomic single-use consume, keyed by an ALREADY-HASHED value (the
     * webhook re-hashes the purchase_ref Paddle echoes back before
     * calling this — the raw value never reaches this repository).
     * Returns true iff exactly one not-yet-consumed, not-yet-expired
     * intent matching this hash was marked consumed and bound to
     * $paddleTransactionId by this call.
     */
    public function consume(string $purchaseRefHash, string $paddleTransactionId): bool
    {
        $nowExpression = $this->nowExpression();

        $statement = $this->pdo->prepare(
            "UPDATE purchase_intents
             SET consumed_at = {$nowExpression}, paddle_transaction_id = :txn_id
             WHERE purchase_ref_hash = :hash AND consumed_at IS NULL AND expires_at > {$nowExpression}",
        );
        $statement->execute(['hash' => $purchaseRefHash, 'txn_id' => $paddleTransactionId]);

        return $statement->rowCount() === 1;
    }

    public function findUserIdForHash(string $purchaseRefHash): ?string
    {
        $statement = $this->pdo->prepare(
            'SELECT user_id, purchase_ref_hash FROM purchase_intents WHERE purchase_ref_hash = :hash LIMIT 1',
        );
        $statement->execute(['hash' => $purchaseRefHash]);
        /** @var array{user_id: string, purchase_ref_hash: string}|false $row */
        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        // Explicit final comparison, per the design spec's hash_equals()
        // requirement — same pattern as PR A's token repositories.
        if (!hash_equals($purchaseRefHash, $row['purchase_ref_hash'])) {
            return null;
        }

        return $row['user_id'];
    }

    public function findProductKeyForHash(string $purchaseRefHash): ?string
    {
        $statement = $this->pdo->prepare(
            'SELECT product_key FROM purchase_intents WHERE purchase_ref_hash = :hash LIMIT 1',
        );
        $statement->execute(['hash' => $purchaseRefHash]);
        $productKey = $statement->fetchColumn();

        return $productKey === false ? null : $productKey;
    }

    public function findIdForHash(string $purchaseRefHash): ?int
    {
        $statement = $this->pdo->prepare(
            'SELECT id FROM purchase_intents WHERE purchase_ref_hash = :hash LIMIT 1',
        );
        $statement->execute(['hash' => $purchaseRefHash]);
        $id = $statement->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    private function nowExpression(): string
    {
        return $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';
    }
}
