<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * Reads/writes magic_link_tokens. The raw token is never stored — only
 * SHA-256(raw) — and consume() enforces single-use via an atomic
 * conditional UPDATE + affected-row-count check. The final hash
 * comparison in findEmailForRawToken() uses hash_equals() per the
 * spec's explicit requirement.
 */
final class MagicLinkTokenRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function issue(string $emailNormalized, string $rawToken, \DateTimeImmutable $expiresAt): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO magic_link_tokens (email_normalized, token_hash, expires_at, created_at)
             VALUES (:email, :token_hash, :expires_at, CURRENT_TIMESTAMP)',
        );
        $statement->execute([
            'email' => $emailNormalized,
            'token_hash' => hash('sha256', $rawToken),
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        ]);
    }

    /**
     * Atomic single-use consume. Returns true iff exactly one
     * not-yet-used, not-yet-expired token matching this hash was
     * marked used by this call — false for unknown/expired/already-used
     * tokens, with no distinction between those three reasons exposed
     * to the caller.
     */
    public function consume(string $rawToken): bool
    {
        $tokenHash = hash('sha256', $rawToken);
        $nowExpression = $this->nowExpression();

        $statement = $this->pdo->prepare(
            "UPDATE magic_link_tokens
             SET used_at = {$nowExpression}
             WHERE token_hash = :token_hash AND used_at IS NULL AND expires_at > {$nowExpression}",
        );
        $statement->execute(['token_hash' => $tokenHash]);

        return $statement->rowCount() === 1;
    }

    public function findEmailForRawToken(string $rawToken): ?string
    {
        $expectedHash = hash('sha256', $rawToken);

        $statement = $this->pdo->prepare(
            'SELECT email_normalized, token_hash FROM magic_link_tokens WHERE token_hash = :token_hash LIMIT 1',
        );
        $statement->execute(['token_hash' => $expectedHash]);
        /** @var array{email_normalized: string, token_hash: string}|false $row */
        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        // Explicit final comparison, per the design spec — not
        // redundant with the SQL WHERE clause above, since the SQLite
        // path used by tests does not carry the same guaranteed
        // indexed-comparison timing characteristics as MariaDB.
        if (!hash_equals($expectedHash, $row['token_hash'])) {
            return null;
        }

        return $row['email_normalized'];
    }

    public function bindUser(string $rawToken, string $userId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE magic_link_tokens SET user_id = :user_id WHERE token_hash = :token_hash',
        );
        $statement->execute([
            'user_id' => $userId,
            'token_hash' => hash('sha256', $rawToken),
        ]);
    }

    private function nowExpression(): string
    {
        return $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';
    }
}
