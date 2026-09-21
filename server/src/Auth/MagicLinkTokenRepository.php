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

    public function issue(
        string $emailNormalized,
        string $rawToken,
        \DateTimeImmutable $expiresAt,
        ?string $rawBrowserBinding = null,
    ): void {
        $statement = $this->pdo->prepare(
            'INSERT INTO magic_link_tokens (
                email_normalized,
                token_hash,
                browser_binding_hash,
                expires_at,
                created_at
             ) VALUES (
                :email,
                :token_hash,
                :browser_binding_hash,
                :expires_at,
                CURRENT_TIMESTAMP
             )',
        );
        $statement->execute([
            'email' => $emailNormalized,
            'token_hash' => hash('sha256', $rawToken),
            'browser_binding_hash' => $rawBrowserBinding === null ? null : hash('sha256', $rawBrowserBinding),
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

    /**
     * Verify the browser-binding secret without consuming the Magic Link.
     *
     * Cookie-mode callers set $requireBinding=true so a token issued without
     * a binding (including a pre-migration token) is rejected rather than
     * silently downgrading the login-CSRF defense. Dev/Bearer callers leave
     * it false, where an unbound dev token remains valid.
     */
    public function browserBindingMatches(
        string $rawToken,
        ?string $rawBrowserBinding,
        bool $requireBinding,
    ): bool {
        $expectedTokenHash = hash('sha256', $rawToken);
        $nowExpression = $this->nowExpression();

        $statement = $this->pdo->prepare(
            "SELECT token_hash, browser_binding_hash
             FROM magic_link_tokens
             WHERE token_hash = :token_hash
               AND used_at IS NULL
               AND expires_at > {$nowExpression}
             LIMIT 1",
        );
        $statement->execute(['token_hash' => $expectedTokenHash]);
        /** @var array{token_hash: string, browser_binding_hash: ?string}|false $row */
        $row = $statement->fetch();

        if ($row === false || !hash_equals($expectedTokenHash, $row['token_hash'])) {
            return false;
        }

        $storedBindingHash = $row['browser_binding_hash'];
        if ($storedBindingHash === null || $storedBindingHash === '') {
            return !$requireBinding;
        }

        if ($rawBrowserBinding === null || $rawBrowserBinding === '') {
            return false;
        }

        return hash_equals($storedBindingHash, hash('sha256', $rawBrowserBinding));
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
