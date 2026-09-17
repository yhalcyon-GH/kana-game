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
     * The eviction itself is an atomic conditional UPDATE.
     *
     * This candidate SELECT is a plain, non-locking read -- callers that
     * need the true latest-committed row set under a concurrent-login
     * race (the max-N-cap enforcement path) must use
     * evictLruForUserIfAtCap() instead, not this method plus a manual
     * count check; see that method's doc comment for why.
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

    /**
     * Atomically checks whether $userId is AT OR OVER $maxSessions
     * active persistent sessions and, if so, revokes the
     * least-recently-used one -- returning its id, or null if no
     * eviction was needed.
     *
     * This is deliberately NOT "countActiveForUser() then
     * evictLruForUser(), retried if the first eviction lost a race":
     * both of those are plain, non-locking SELECTs, and under MariaDB's
     * default REPEATABLE READ isolation a transaction's plain reads use
     * a consistent snapshot fixed at the transaction's first read --
     * re-reading (even after a failed conditional UPDATE) does NOT see
     * a concurrent transaction's commit. A retry built on that snapshot
     * can pick the SAME already-revoked row again and evict nothing,
     * letting a concurrent login's create() proceed anyway and the
     * active count exceed the cap.
     *
     * This method instead takes a SELECT ... FOR UPDATE locking read of
     * the user's active rows -- a locking read always reads the latest
     * COMMITTED version, not the transaction's snapshot, and blocks
     * until any conflicting lock (e.g. a concurrent call to this same
     * method for the same user) is released. Two concurrent verifyCode()
     * calls for the same at-cap user therefore serialize on this one
     * user's rows: whichever acquires the lock first sees the true
     * count, evicts if needed, and commits; the second then sees the
     * post-eviction state and makes its own correct decision. See the
     * mariadb-concurrency scenario E added in Task 17 (and this fix's
     * own justification) for the 4th/5th-login race this guards.
     *
     * Not supported meaningfully on SQLite (used only by this repo's
     * unit tests) -- SQLite has no FOR UPDATE and its single-writer
     * model already serializes all writes, so the locking clause is
     * simply omitted there.
     */
    public function evictLruForUserIfAtCap(string $userId, int $maxSessions): ?int
    {
        $nowExpression = $this->nowExpression();
        $lockingSuffix = $this->lockingReadSuffix();
        $select = $this->pdo->prepare(
            "SELECT id FROM persistent_sessions
             WHERE user_id = :user_id AND revoked_at IS NULL AND expires_at > {$nowExpression}
             ORDER BY last_seen_at ASC, id ASC{$lockingSuffix}",
        );
        $select->execute(['user_id' => $userId]);
        /** @var list<int> $activeIds */
        $activeIds = array_map('intval', $select->fetchAll(PDO::FETCH_COLUMN));

        if (count($activeIds) < $maxSessions) {
            return null;
        }

        $oldestId = $activeIds[0];
        $revoke = $this->pdo->prepare(
            "UPDATE persistent_sessions SET revoked_at = {$nowExpression} WHERE id = :id AND revoked_at IS NULL",
        );
        $revoke->execute(['id' => $oldestId]);

        return $revoke->rowCount() === 1 ? $oldestId : null;
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

    /**
     * ' FOR UPDATE' on a real MariaDB connection (turns the SELECT it's
     * appended to into a locking read of the latest committed data,
     * not the transaction's snapshot -- see evictLruForUserIfAtCap()'s
     * doc comment); empty on SQLite, which has no FOR UPDATE syntax and
     * needs none (single-writer, all writes already serialize).
     */
    private function lockingReadSuffix(): string
    {
        return $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? ''
            : ' FOR UPDATE';
    }
}
