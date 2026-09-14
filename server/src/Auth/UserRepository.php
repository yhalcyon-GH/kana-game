<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use KanaGame\Paddle\Uuid;
use PDO;

/**
 * Reads/writes the users table. A users row is created ONLY via
 * findOrCreateByEmail(), which is called exclusively from
 * MagicLinkAuthService::verify() — there is no code path that creates
 * a durable user from an unauthenticated request-link call.
 *
 * findOrCreateByEmail() is MariaDB-safe against two distinct,
 * simultaneously-valid magic-link tokens for the same email being
 * verified concurrently: it uses INSERT ... ON DUPLICATE KEY UPDATE (a
 * no-op on conflict) followed by a re-SELECT, rather than a bare
 * SELECT-then-unprotected-INSERT. The SQLite dialect used by tests has
 * no ON DUPLICATE KEY UPDATE, so this repository detects the driver and
 * uses SQLite's equivalent (INSERT OR IGNORE) when running under tests
 * — both paths converge on the same re-SELECT.
 *
 * On MariaDB, the re-SELECT uses FOR UPDATE. The caller's transaction
 * (MagicLinkAuthService::verify()) performs an earlier plain read
 * (findEmailForRawToken()) before this method runs, which under InnoDB
 * REPEATABLE READ establishes that transaction's consistent-read
 * snapshot at that earlier point. If a *second* concurrent transaction
 * (verifying a different token for the same email) commits its own
 * INSERT ... ON DUPLICATE KEY UPDATE between that snapshot and this
 * plain re-SELECT, a plain SELECT here would still consult the
 * already-established snapshot and could return no row even though the
 * row now exists — even though this transaction's own INSERT is a
 * genuine write that always operates on the latest data, not the
 * snapshot. A locking read (FOR UPDATE) is a "current read" in InnoDB:
 * it always reads the most recently committed data rather than the
 * transaction's REPEATABLE READ snapshot, which is exactly what makes
 * it safe here. SQLite has no comparable snapshot/locking-read
 * distinction for this codebase's usage and remains a plain SELECT.
 */
final class UserRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @return array{id: string, email_normalized: string}
     */
    public function findOrCreateByEmail(string $emailNormalized): array
    {
        $newId = Uuid::v4();
        $driver = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);

        if ($driver === 'sqlite') {
            $insert = $this->pdo->prepare(
                'INSERT OR IGNORE INTO users (id, email_normalized, created_at, updated_at)
                 VALUES (:id, :email, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            );
        } else {
            $insert = $this->pdo->prepare(
                'INSERT INTO users (id, email_normalized, created_at, updated_at)
                 VALUES (:id, :email, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE id = id',
            );
        }
        $insert->execute(['id' => $newId, 'email' => $emailNormalized]);

        $selectSql = 'SELECT id, email_normalized FROM users WHERE email_normalized = :email LIMIT 1';
        if ($driver !== 'sqlite') {
            // Current read (bypasses this transaction's REPEATABLE READ
            // snapshot) -- see class docblock.
            $selectSql .= ' FOR UPDATE';
        }
        $select = $this->pdo->prepare($selectSql);
        $select->execute(['email' => $emailNormalized]);
        /** @var array{id: string, email_normalized: string}|false $row */
        $row = $select->fetch();

        if ($row === false) {
            // Unreachable in practice: the INSERT above guarantees a row
            // exists for this email before we ever get here. Handled
            // explicitly rather than left to an incidental TypeError
            // from this method's `: array` return type.
            throw new \RuntimeException(
                'findOrCreateByEmail(): row missing immediately after upsert for a normalized email',
            );
        }

        return $row;
    }

    /**
     * @return array{id: string, email_normalized: string}|null
     */
    public function findById(string $id): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, email_normalized FROM users WHERE id = :id LIMIT 1',
        );
        $statement->execute(['id' => $id]);
        /** @var array{id: string, email_normalized: string}|false $row */
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }
}
