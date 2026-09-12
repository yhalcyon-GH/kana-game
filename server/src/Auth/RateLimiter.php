<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * Fixed-window, DB-backed rate limiter for magic-link requests. Never
 * persists a raw email or raw IP — only HMAC-SHA256(bucket:value,
 * pepper). No Redis/external service.
 *
 * Concurrency-safe by construction: checkAndRecord() wraps an atomic
 * INSERT ... ON DUPLICATE KEY UPDATE (which unconditionally creates the
 * row or advances/increments it in one statement — no read-then-write
 * gap) together with a SELECT ... FOR UPDATE re-read of that same row,
 * inside one transaction. The FOR UPDATE row lock serializes concurrent
 * callers for the SAME identifier against each other until this
 * transaction commits, so two concurrent requests for the same
 * email/IP cannot both observe a stale pre-increment count and both
 * proceed past the limit. Different identifiers are different rows and
 * are not serialized against each other.
 *
 * SQLite (tests only) has neither ON DUPLICATE KEY UPDATE nor row-level
 * locking — the SQLite branch below uses INSERT OR IGNORE plus a
 * separate UPDATE, which is sufficient to prove the logical
 * increment/reset decision under single-threaded test execution but
 * does NOT exercise MariaDB's actual row-locking behavior. See the PR A
 * plan's Task 16/docs for the required real-MariaDB verification this
 * class's true concurrency behavior still needs before Live rollout.
 */
final class RateLimiter
{
    private const BUCKET_EMAIL = 'magic_link_email';
    private const BUCKET_IP = 'magic_link_ip';
    private const WINDOW_SECONDS = 3600;

    public function __construct(
        private readonly PDO $pdo,
        private readonly string $pepper,
        private readonly int $emailLimitPerHour,
        private readonly int $ipLimitPerHour,
    ) {
    }

    public function checkAndRecordEmail(string $emailNormalized): bool
    {
        return $this->checkAndRecord(self::BUCKET_EMAIL, $emailNormalized, $this->emailLimitPerHour);
    }

    public function checkAndRecordIp(string $rawIp): bool
    {
        return $this->checkAndRecord(self::BUCKET_IP, $rawIp, $this->ipLimitPerHour);
    }

    private function checkAndRecord(string $bucket, string $rawValue, int $limitPerHour): bool
    {
        $identifier = hash_hmac('sha256', "{$bucket}:{$rawValue}", $this->pepper);
        $now = new \DateTimeImmutable();
        $driver = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);

        $this->pdo->beginTransaction();
        try {
            if ($driver === 'sqlite') {
                $this->upsertWindowSqlite($bucket, $identifier, $now);
            } else {
                $this->upsertWindowMariaDb($bucket, $identifier, $now);
            }

            $lockClause = $driver === 'sqlite' ? '' : ' FOR UPDATE';
            $select = $this->pdo->prepare(
                "SELECT count FROM rate_limits WHERE bucket = :bucket AND identifier = :identifier{$lockClause}",
            );
            $select->execute(['bucket' => $bucket, 'identifier' => $identifier]);
            $count = (int) $select->fetchColumn();

            $allowed = $count <= $limitPerHour;
            $this->pdo->commit();

            return $allowed;
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * MariaDB: one atomic statement either creates the row at count=1,
     * or — if the existing window is still current — increments count,
     * or — if the existing window has expired — resets count to 1 and
     * moves window_start forward. No separate read happens before this
     * write, so there is no gap for a concurrent caller to exploit.
     */
    private function upsertWindowMariaDb(string $bucket, string $identifier, \DateTimeImmutable $now): void
    {
        $nowStr = $now->format('Y-m-d H:i:s');
        $cutoffStr = $now->modify('-' . self::WINDOW_SECONDS . ' seconds')->format('Y-m-d H:i:s');

        // PDO::ATTR_EMULATE_PREPARES is false (see server/src/Db.php), so
        // this goes through MySQL native prepared statements, which do
        // NOT support binding a single named parameter to more than one
        // placeholder occurrence in the same statement (each occurrence
        // is its own positional slot) — hence :cutoff1/:cutoff2 rather
        // than reusing :cutoff twice, even though both are bound to the
        // same $cutoffStr value.
        $statement = $this->pdo->prepare(
            'INSERT INTO rate_limits (bucket, identifier, window_start, count)
             VALUES (:bucket, :identifier, :now, 1)
             ON DUPLICATE KEY UPDATE
               count = IF(window_start < :cutoff1, 1, count + 1),
               window_start = IF(window_start < :cutoff2, :now2, window_start)',
        );
        $statement->execute([
            'bucket' => $bucket,
            'identifier' => $identifier,
            'now' => $nowStr,
            'cutoff1' => $cutoffStr,
            'cutoff2' => $cutoffStr,
            'now2' => $nowStr,
        ]);
    }

    /**
     * SQLite (tests only): no ON DUPLICATE KEY UPDATE, so this uses
     * INSERT OR IGNORE (atomic row creation) followed by a separate
     * UPDATE for the increment/reset — skipped entirely when the
     * INSERT OR IGNORE just created the row (checked via rowCount(),
     * not a timestamp comparison, since two calls within the same
     * wall-clock second would otherwise be indistinguishable by
     * window_start alone). This does not carry the same
     * single-statement atomicity guarantee as the MariaDB path, but
     * SQLite's tests run single-threaded, so no real race exists to
     * expose the gap — see this class's own caveats above.
     */
    private function upsertWindowSqlite(string $bucket, string $identifier, \DateTimeImmutable $now): void
    {
        $nowStr = $now->format('Y-m-d H:i:s');
        $cutoffStr = $now->modify('-' . self::WINDOW_SECONDS . ' seconds')->format('Y-m-d H:i:s');

        $insert = $this->pdo->prepare(
            'INSERT OR IGNORE INTO rate_limits (bucket, identifier, window_start, count)
             VALUES (:bucket, :identifier, :now, 1)',
        );
        $insert->execute(['bucket' => $bucket, 'identifier' => $identifier, 'now' => $nowStr]);

        if ($insert->rowCount() === 1) {
            // This call's own INSERT OR IGNORE just created the row at
            // (now, 1) — the row is already correct, skip the UPDATE
            // entirely so it isn't double-incremented to 2.
            return;
        }

        $update = $this->pdo->prepare(
            'UPDATE rate_limits
             SET count = CASE WHEN window_start < :cutoff THEN 1 ELSE count + 1 END,
                 window_start = CASE WHEN window_start < :cutoff THEN :now ELSE window_start END
             WHERE bucket = :bucket AND identifier = :identifier',
        );
        $update->execute([
            'cutoff' => $cutoffStr,
            'now' => $nowStr,
            'bucket' => $bucket,
            'identifier' => $identifier,
        ]);
    }
}
