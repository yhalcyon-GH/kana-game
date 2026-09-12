<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

use PDO;
use PDOException;

/**
 * Thin PDO factory. Always uses prepared statements at call sites (see
 * EntitlementRepository/PaymentEventRepository) — this class only owns
 * connection setup, never raw query building.
 */
final class Db
{
    public static function connect(Config $config): PDO
    {
        $host = $config->require('DB_HOST');
        $name = $config->require('DB_NAME');
        $user = $config->require('DB_USER');
        $password = $config->require('DB_PASSWORD');

        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $host, $name);

        try {
            return new PDO($dsn, $user, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            // Never leak DSN/credentials/driver error details to a caller —
            // only to server-side error logs (see webhook/entitlement
            // entrypoints' own catch blocks for what actually gets logged).
            throw new \RuntimeException('Database connection failed.', 0, $e);
        }
    }
}
