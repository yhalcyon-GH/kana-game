<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * Reads/writes sessions. Raw session token is never stored — only
 * SHA-256(raw). A session is a real account credential, not merely an
 * entitlement flag. The final hash comparison in
 * findActiveUserIdForRawToken() uses hash_equals(), same pattern as
 * MagicLinkTokenRepository.
 */
final class SessionRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function create(string $userId, string $rawToken, \DateTimeImmutable $expiresAt, ?int $persistentSessionId = null): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO sessions (token_hash, user_id, expires_at, persistent_session_id, created_at, last_seen_at)
             VALUES (:token_hash, :user_id, :expires_at, :persistent_session_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        );
        $statement->execute([
            'token_hash' => hash('sha256', $rawToken),
            'user_id' => $userId,
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
            'persistent_session_id' => $persistentSessionId,
        ]);
    }

    /**
     * Application-level cascade: when a persistent_sessions row is
     * revoked or LRU-evicted, every sessions row it minted (via the
     * session-refresh path in CurrentUserService::resolveOrRefresh(), or
     * the one created alongside it at OTP-verify time) is revoked too --
     * same explicit-revocation audit pattern as the rest of this schema,
     * not a DB-level cascade delete. A no-op for any sessions row with no
     * link (persistent_session_id IS NULL is never matched by the
     * equality comparison below).
     */
    public function revokeByPersistentSessionId(int $persistentSessionId): void
    {
        $nowExpression = $this->nowExpression();
        $statement = $this->pdo->prepare(
            "UPDATE sessions SET revoked_at = {$nowExpression}
             WHERE persistent_session_id = :persistent_session_id AND revoked_at IS NULL",
        );
        $statement->execute(['persistent_session_id' => $persistentSessionId]);
    }

    public function findActiveUserIdForRawToken(string $rawToken): ?string
    {
        $expectedHash = hash('sha256', $rawToken);
        $nowExpression = $this->nowExpression();

        $select = $this->pdo->prepare(
            "SELECT user_id, token_hash FROM sessions
             WHERE token_hash = :token_hash AND revoked_at IS NULL AND expires_at > {$nowExpression}
             LIMIT 1",
        );
        $select->execute(['token_hash' => $expectedHash]);
        /** @var array{user_id: string, token_hash: string}|false $row */
        $row = $select->fetch();

        if ($row === false) {
            return null;
        }

        if (!hash_equals($expectedHash, $row['token_hash'])) {
            return null;
        }

        $touch = $this->pdo->prepare(
            "UPDATE sessions SET last_seen_at = {$nowExpression} WHERE token_hash = :token_hash",
        );
        $touch->execute(['token_hash' => $expectedHash]);

        return $row['user_id'];
    }

    public function revoke(string $rawToken): void
    {
        $nowExpression = $this->nowExpression();

        $statement = $this->pdo->prepare(
            "UPDATE sessions SET revoked_at = {$nowExpression}
             WHERE token_hash = :token_hash AND revoked_at IS NULL",
        );
        $statement->execute(['token_hash' => hash('sha256', $rawToken)]);
    }

    private function nowExpression(): string
    {
        return $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';
    }
}
