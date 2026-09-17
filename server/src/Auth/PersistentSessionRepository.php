<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * Reads/writes persistent_sessions -- the 90-day "remember this browser"
 * credential. Raw token is never stored, only SHA-256(raw), same pattern
 * as SessionRepository. Quota/LRU-eviction unit is a ROW here, not a
 * device/IP/fingerprint -- see the design spec's "Max 3 / LRU eviction"
 * section.
 */
class PersistentSessionRepository
{
    // Not `final`, and $pdo is `protected` rather than `private`, solely
    // so OtpAuthServiceTest can build a tiny subclass that simulates a
    // lost eviction race (see that test) -- no production behavior here
    // changes.
    public function __construct(protected readonly PDO $pdo)
    {
    }

    public function create(string $userId, string $rawToken, \DateTimeImmutable $expiresAt): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO persistent_sessions (token_hash, user_id, expires_at, created_at, last_seen_at)
             VALUES (:token_hash, :user_id, :expires_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        );
        $statement->execute([
            'token_hash' => hash('sha256', $rawToken),
            'user_id' => $userId,
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * @return array{id: int, user_id: string, expires_at: string}|null
     */
    public function findActiveByRawToken(string $rawToken): ?array
    {
        $expectedHash = hash('sha256', $rawToken);
        $nowExpression = $this->nowExpression();

        $select = $this->pdo->prepare(
            "SELECT id, user_id, expires_at, token_hash FROM persistent_sessions
             WHERE token_hash = :token_hash AND revoked_at IS NULL AND expires_at > {$nowExpression}
             LIMIT 1",
        );
        $select->execute(['token_hash' => $expectedHash]);
        /** @var array{id: int|string, user_id: string, expires_at: string, token_hash: string}|false $row */
        $row = $select->fetch();

        if ($row === false || !hash_equals($expectedHash, $row['token_hash'])) {
            return null;
        }

        return ['id' => (int) $row['id'], 'user_id' => $row['user_id'], 'expires_at' => $row['expires_at']];
    }

    public function touch(int $id): void
    {
        $nowExpression = $this->nowExpression();
        $statement = $this->pdo->prepare(
            "UPDATE persistent_sessions SET last_seen_at = {$nowExpression} WHERE id = :id",
        );
        $statement->execute(['id' => $id]);
    }

    public function countActiveForUser(string $userId): int
    {
        $nowExpression = $this->nowExpression();
        $statement = $this->pdo->prepare(
            "SELECT COUNT(*) FROM persistent_sessions
             WHERE user_id = :user_id AND revoked_at IS NULL AND expires_at > {$nowExpression}",
        );
        $statement->execute(['user_id' => $userId]);

        return (int) $statement->fetchColumn();
    }

    /**
     * Revokes and returns the id of the least-recently-used ACTIVE row
     * for this user (ORDER BY last_seen_at ASC, id ASC as a stable
     * tiebreaker for equal timestamps), or null if the user has none.
     * The eviction itself is an atomic conditional UPDATE -- see the
     * mariadb-concurrency scenario E added in Task 17 for the 4th-login
     * race this guards.
     */
    public function evictLruForUser(string $userId): ?int
    {
        $nowExpression = $this->nowExpression();
        $select = $this->pdo->prepare(
            "SELECT id FROM persistent_sessions
             WHERE user_id = :user_id AND revoked_at IS NULL AND expires_at > {$nowExpression}
             ORDER BY last_seen_at ASC, id ASC
             LIMIT 1",
        );
        $select->execute(['user_id' => $userId]);
        $id = $select->fetchColumn();

        if ($id === false) {
            return null;
        }
        $id = (int) $id;

        $revoke = $this->pdo->prepare(
            "UPDATE persistent_sessions SET revoked_at = {$nowExpression} WHERE id = :id AND revoked_at IS NULL",
        );
        $revoke->execute(['id' => $id]);

        return $revoke->rowCount() === 1 ? $id : null;
    }

    public function revoke(int $id): void
    {
        $nowExpression = $this->nowExpression();
        $statement = $this->pdo->prepare(
            "UPDATE persistent_sessions SET revoked_at = {$nowExpression} WHERE id = :id AND revoked_at IS NULL",
        );
        $statement->execute(['id' => $id]);
    }

    /**
     * @return list<int>
     */
    public function revokeAllForUserExcept(string $userId, int $keepId): array
    {
        $nowExpression = $this->nowExpression();
        $select = $this->pdo->prepare(
            'SELECT id FROM persistent_sessions WHERE user_id = :user_id AND revoked_at IS NULL AND id != :keep_id',
        );
        $select->execute(['user_id' => $userId, 'keep_id' => $keepId]);
        $ids = array_map('intval', $select->fetchAll(PDO::FETCH_COLUMN));

        if ($ids === []) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $update = $this->pdo->prepare(
            "UPDATE persistent_sessions SET revoked_at = {$nowExpression} WHERE id IN ({$placeholders}) AND revoked_at IS NULL",
        );
        $update->execute($ids);

        return $ids;
    }

    private function nowExpression(): string
    {
        return $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';
    }
}
