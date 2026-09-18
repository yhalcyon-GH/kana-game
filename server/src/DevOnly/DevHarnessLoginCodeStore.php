<?php

declare(strict_types=1);

namespace KanaGame\Paddle\DevOnly;

use PDO;

/**
 * DEV-ONLY. Reads/writes dev_harness_login_codes — mirrors
 * DevHarnessMagicLinkStore exactly, for the OTP (6-digit email sign-in
 * code) flow instead of the Magic Link flow. This is the second (and
 * only other) intentionally-scoped exception in this codebase to the
 * normal "raw values are never persisted" rule: it exists solely so a
 * developer exercising the /account-test harness can retrieve the code
 * a real mailer/FakeMailer would otherwise have sent by email, since
 * separate PHP-FPM/CGI requests share no memory.
 *
 * No production code path ever constructs this class. It is
 * instantiated only by server/dev-only/last-login-code.php and
 * server/src/DevOnly/DevHarnessMailer.php, both gated on
 * DEV_HARNESS_ENABLED.
 *
 * consume() DELETES the row on successful read — the raw code is
 * short-lived even in the dev-only table, not left sitting around after
 * the developer has used it once.
 */
final class DevHarnessLoginCodeStore
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function store(string $emailNormalized, string $code, \DateTimeImmutable $expiresAt): void
    {
        $driver = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $sql = $driver === 'sqlite'
            ? 'INSERT INTO dev_harness_login_codes (email_normalized, code, expires_at, created_at)
               VALUES (:email, :code, :expires_at, CURRENT_TIMESTAMP)
               ON CONFLICT(email_normalized) DO UPDATE SET
                 code = excluded.code,
                 expires_at = excluded.expires_at,
                 created_at = CURRENT_TIMESTAMP'
            : 'INSERT INTO dev_harness_login_codes (email_normalized, code, expires_at, created_at)
               VALUES (:email, :code, :expires_at, NOW())
               ON DUPLICATE KEY UPDATE
                 code = VALUES(code),
                 expires_at = VALUES(expires_at),
                 created_at = NOW()';

        $statement = $this->pdo->prepare($sql);
        $statement->execute([
            'email' => $emailNormalized,
            'code' => $code,
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        ]);
    }

    /**
     * Requires an EXACT normalized-email match. Returns null for an
     * unknown email or an expired row (an expired row is left in place
     * rather than deleted here — it will simply be overwritten by a
     * future store() call or is harmless dead data in a dev-only
     * table). On a successful match, the row is deleted (consumed)
     * before the code is returned.
     */
    public function consume(string $emailNormalized): ?string
    {
        $nowExpression = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';

        $select = $this->pdo->prepare(
            "SELECT code FROM dev_harness_login_codes
             WHERE email_normalized = :email AND expires_at > {$nowExpression}
             LIMIT 1",
        );
        $select->execute(['email' => $emailNormalized]);
        $code = $select->fetchColumn();

        if ($code === false) {
            return null;
        }

        $delete = $this->pdo->prepare(
            'DELETE FROM dev_harness_login_codes WHERE email_normalized = :email',
        );
        $delete->execute(['email' => $emailNormalized]);

        return $code;
    }
}
