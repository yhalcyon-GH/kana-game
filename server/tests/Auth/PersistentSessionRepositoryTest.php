<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\PersistentSessionRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/PersistentSessionRepository.php';

function makePersistentSessionRepositoryTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE persistent_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            revoked_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function persistentSessionRepositoryTests(): array
{
    return [
        'create() then findActiveByRawToken() resolves the same row, never the raw token stored plaintext' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $id = $repo->create('user-1', 'raw-remember-token', new \DateTimeImmutable('+90 days'));

            $found = $repo->findActiveByRawToken('raw-remember-token');
            assertTrue($found !== null, 'a freshly created active token should resolve');
            assertSame($id, $found['id'], 'resolved row id should match created id');
            assertSame('user-1', $found['user_id'], 'resolved row user_id should match created user_id');

            $row = $pdo->query('SELECT token_hash FROM persistent_sessions WHERE id = ' . $id)->fetch();
            assertFalse(str_contains($row['token_hash'], 'raw-remember-token'), 'token_hash must never contain the raw token');
        },

        'findActiveByRawToken() returns null for a revoked row' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $id = $repo->create('user-2', 'raw-revoked-token', new \DateTimeImmutable('+90 days'));
            $repo->revoke($id);

            assertTrue($repo->findActiveByRawToken('raw-revoked-token') === null, 'a revoked persistent session must not resolve');
        },

        'findActiveByRawToken() returns null for an expired row' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $repo->create('user-3', 'raw-expired-token', new \DateTimeImmutable('-1 minute'));

            assertTrue($repo->findActiveByRawToken('raw-expired-token') === null, 'an expired persistent session must not resolve');
        },

        'touch() advances last_seen_at' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $id = $repo->create('user-4', 'raw-touch-token', new \DateTimeImmutable('+90 days'));
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2020-01-01 00:00:00' WHERE id = {$id}");

            $repo->touch($id);

            $row = $pdo->query("SELECT last_seen_at FROM persistent_sessions WHERE id = {$id}")->fetch();
            assertTrue($row['last_seen_at'] !== '2020-01-01 00:00:00', 'last_seen_at should have advanced past the seeded old value');
        },

        'countActiveForUser() counts only non-revoked, non-expired rows for that user' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $repo->create('user-5', 'raw-a', new \DateTimeImmutable('+90 days'));
            $repo->create('user-5', 'raw-b', new \DateTimeImmutable('+90 days'));
            $revokedId = $repo->create('user-5', 'raw-c', new \DateTimeImmutable('+90 days'));
            $repo->revoke($revokedId);
            $repo->create('user-5', 'raw-d', new \DateTimeImmutable('-1 minute'));
            $repo->create('other-user', 'raw-e', new \DateTimeImmutable('+90 days'));

            assertSame(2, $repo->countActiveForUser('user-5'), 'only the two still-active rows for user-5 should count');
        },

        'evictLruForUser() revokes the least-recently-used active row and returns its id' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $oldest = $repo->create('user-6', 'raw-oldest', new \DateTimeImmutable('+90 days'));
            $middle = $repo->create('user-6', 'raw-middle', new \DateTimeImmutable('+90 days'));
            $newest = $repo->create('user-6', 'raw-newest', new \DateTimeImmutable('+90 days'));
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2020-01-01 00:00:00' WHERE id = {$oldest}");
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2021-01-01 00:00:00' WHERE id = {$middle}");
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2022-01-01 00:00:00' WHERE id = {$newest}");

            $evicted = $repo->evictLruForUser('user-6');

            assertSame($oldest, $evicted, 'the row with the oldest last_seen_at must be evicted');
            assertSame(2, $repo->countActiveForUser('user-6'), 'exactly one row should have been revoked');
            assertTrue($repo->findActiveByRawToken('raw-oldest') === null, 'evicted row should no longer resolve');
            assertTrue($repo->findActiveByRawToken('raw-middle') !== null, 'non-evicted row should still resolve');
        },

        'evictLruForUser() returns null when the user has no active rows' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            assertTrue($repo->evictLruForUser('nobody') === null, 'a user with no active rows has nothing to evict');
        },

        'evictLruForUserIfAtCap() does nothing and returns null when the user is under the cap' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $repo->create('user-cap-1', 'raw-a', new \DateTimeImmutable('+90 days'));
            $repo->create('user-cap-1', 'raw-b', new \DateTimeImmutable('+90 days'));

            $result = $repo->evictLruForUserIfAtCap('user-cap-1', 3);

            assertTrue($result === null, 'no eviction should happen when active count (2) is under the cap (3)');
            assertSame(2, $repo->countActiveForUser('user-cap-1'), 'both rows must remain active');
        },

        'evictLruForUserIfAtCap() evicts exactly the least-recently-used row when the user is AT the cap' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $oldest = $repo->create('user-cap-2', 'raw-oldest', new \DateTimeImmutable('+90 days'));
            $middle = $repo->create('user-cap-2', 'raw-middle', new \DateTimeImmutable('+90 days'));
            $newest = $repo->create('user-cap-2', 'raw-newest', new \DateTimeImmutable('+90 days'));
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2020-01-01 00:00:00' WHERE id = {$oldest}");
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2021-01-01 00:00:00' WHERE id = {$middle}");
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2022-01-01 00:00:00' WHERE id = {$newest}");

            $evicted = $repo->evictLruForUserIfAtCap('user-cap-2', 3);

            assertSame($oldest, $evicted, 'the row with the oldest last_seen_at must be the one evicted');
            assertSame(2, $repo->countActiveForUser('user-cap-2'), 'exactly one row should have been revoked');
            assertTrue($repo->findActiveByRawToken('raw-oldest') === null, 'the evicted row must no longer resolve');
        },

        'evictLruForUserIfAtCap() called again while still at cap evicts the NEW oldest row -- proves it is a single-shot, re-runnable check, not stateful' => function () {
            // Simulates (at the unit level, in a single connection --
            // the real cross-transaction proof is mariadb-concurrency
            // scenario E) what a second, later verifyCode() call for the
            // same user would see if a first call evicted one row but
            // no replacement had been created yet: the cap is still met
            // by the remaining rows, so a second call must evict again
            // rather than treating "already ran once" as done.
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $oldest = $repo->create('user-cap-3', 'raw-oldest', new \DateTimeImmutable('+90 days'));
            $middle = $repo->create('user-cap-3', 'raw-middle', new \DateTimeImmutable('+90 days'));
            $newest = $repo->create('user-cap-3', 'raw-newest', new \DateTimeImmutable('+90 days'));
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2020-01-01 00:00:00' WHERE id = {$oldest}");
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2021-01-01 00:00:00' WHERE id = {$middle}");
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2022-01-01 00:00:00' WHERE id = {$newest}");

            $first = $repo->evictLruForUserIfAtCap('user-cap-3', 3);
            assertSame($oldest, $first, 'first call evicts the oldest row');
            assertSame(2, $repo->countActiveForUser('user-cap-3'), 'now under cap (2 active)');

            $second = $repo->evictLruForUserIfAtCap('user-cap-3', 3);
            assertTrue($second === null, 'second call must NOT evict again: 2 active rows is under the cap of 3');
            assertSame(2, $repo->countActiveForUser('user-cap-3'), 'still 2 active -- no further eviction should have happened');
        },

        'evictLruForUserIfAtCap() returns null for a user with no active rows' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            assertTrue($repo->evictLruForUserIfAtCap('nobody', 3) === null, 'a user with 0 active rows is under any positive cap');
        },

        'revokeAllForUserExcept() revokes every active row for the user except the kept id, and returns the revoked ids' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $keep = $repo->create('user-7', 'raw-keep', new \DateTimeImmutable('+90 days'));
            $other1 = $repo->create('user-7', 'raw-other-1', new \DateTimeImmutable('+90 days'));
            $other2 = $repo->create('user-7', 'raw-other-2', new \DateTimeImmutable('+90 days'));
            $repo->create('other-user', 'raw-unrelated', new \DateTimeImmutable('+90 days'));

            $revokedIds = $repo->revokeAllForUserExcept('user-7', $keep);

            sort($revokedIds);
            assertSame([$other1, $other2], $revokedIds, 'both other active rows for user-7 should be revoked');
            assertSame(1, $repo->countActiveForUser('user-7'), 'only the kept row should remain active');
            assertTrue($repo->findActiveByRawToken('raw-keep') !== null, 'the kept row must remain active');
            assertTrue($repo->findActiveByRawToken('raw-unrelated') !== null, 'another user\'s row must be untouched');
        },
    ];
}
