<?php

declare(strict_types=1);

namespace KanaGame\Paddle\DevOnly;

use PDO;

/**
 * DEV-ONLY. Reads/writes dev_harness_magic_links — the ONLY table in
 * this codebase that intentionally stores a raw (unhashed) magic-link
 * URL, including its raw token. This is a deliberate, narrowly-scoped
 * exception to the normal "raw tokens are never persisted" rule: it
 * exists solely so a developer exercising the /account-test harness
 * can retrieve the link a real mailer/FakeMailer would otherwise have
 * sent by email, since separate PHP-FPM/CGI requests share no memory.
 *
 * No production code path ever constructs this class. It is
 * instantiated only by server/dev-only/last-magic-link.php and
 * server/src/DevOnly/DevHarnessMailer.php, both gated on
 * DEV_HARNESS_ENABLED.
 *
 * consume() DELETES the row on successful read — the raw link is
 * short-lived even in the dev-only table, not left sitting around
 * after the developer has used it once.
 */
final class DevHarnessMagicLinkStore
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function store(string $emailNormalized, string $magicLinkUrl, \DateTimeImmutable $expiresAt): void
    {
        $driver = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $sql = $driver === 'sqlite'
            ? 'INSERT INTO dev_harness_magic_links (email_normalized, magic_link_url, expires_at, created_at)
               VALUES (:email, :url, :expires_at, CURRENT_TIMESTAMP)
               ON CONFLICT(email_normalized) DO UPDATE SET
                 magic_link_url = excluded.magic_link_url,
                 expires_at = excluded.expires_at,
                 created_at = CURRENT_TIMESTAMP'
            : 'INSERT INTO dev_harness_magic_links (email_normalized, magic_link_url, expires_at, created_at)
               VALUES (:email, :url, :expires_at, NOW())
               ON DUPLICATE KEY UPDATE
                 magic_link_url = VALUES(magic_link_url),
                 expires_at = VALUES(expires_at),
                 created_at = NOW()';

        $statement = $this->pdo->prepare($sql);
        $statement->execute([
            'email' => $emailNormalized,
            'url' => $magicLinkUrl,
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        ]);
    }

    /**
     * Requires an EXACT normalized-email match. Returns null for an
     * unknown email or an expired row (an expired row is left in place
     * rather than deleted here — it will simply be overwritten by a
     * future store() call or is harmless dead data in a dev-only
     * table). On a successful match, the row is deleted (consumed)
     * before the URL is returned.
     */
    public function consume(string $emailNormalized): ?string
    {
        $nowExpression = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';

        $select = $this->pdo->prepare(
            "SELECT magic_link_url FROM dev_harness_magic_links
             WHERE email_normalized = :email AND expires_at > {$nowExpression}
             LIMIT 1",
        );
        $select->execute(['email' => $emailNormalized]);
        $url = $select->fetchColumn();

        if ($url === false) {
            return null;
        }

        $delete = $this->pdo->prepare(
            'DELETE FROM dev_harness_magic_links WHERE email_normalized = :email',
        );
        $delete->execute(['email' => $emailNormalized]);

        return $url;
    }
}
