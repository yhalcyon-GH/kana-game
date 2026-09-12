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

        $select = $this->pdo->prepare(
            'SELECT id, email_normalized FROM users WHERE email_normalized = :email LIMIT 1',
        );
        $select->execute(['email' => $emailNormalized]);
        /** @var array{id: string, email_normalized: string}|false $row */
        $row = $select->fetch();

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
