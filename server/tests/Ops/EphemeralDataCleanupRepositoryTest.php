<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use DateTimeImmutable;
use KanaGame\Paddle\Ops\EphemeralDataCleanupRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Ops/EphemeralDataCleanupRepository.php';

function makeEphemeralCleanupTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA foreign_keys = ON');

    $pdo->exec('CREATE TABLE magic_link_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email_normalized TEXT NOT NULL,
        user_id TEXT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        browser_binding_hash TEXT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )');
    $pdo->exec('CREATE TABLE email_login_challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        challenge_token_hash TEXT NOT NULL UNIQUE,
        email_normalized TEXT NOT NULL,
        code_mac TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        used_at TEXT NULL,
        invalidated_at TEXT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )');
    $pdo->exec('CREATE TABLE persistent_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )');
    $pdo->exec('CREATE TABLE sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        persistent_session_id INTEGER NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (persistent_session_id) REFERENCES persistent_sessions(id) ON DELETE SET NULL
    )');
    $pdo->exec('CREATE TABLE purchase_intents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_ref_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        product_key TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT NULL,
        paddle_transaction_id TEXT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )');
    $pdo->exec('CREATE TABLE transaction_grants (
        paddle_transaction_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product_key TEXT NOT NULL,
        purchase_intent_id INTEGER NOT NULL UNIQUE,
        status TEXT NOT NULL,
        granted_at TEXT NOT NULL,
        status_changed_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (purchase_intent_id) REFERENCES purchase_intents(id) ON DELETE RESTRICT
    )');

    return $pdo;
}

function insertCleanupFixture(PDO $pdo): void
{
    $pdo->exec("INSERT INTO magic_link_tokens
        (email_normalized, token_hash, expires_at, used_at)
        VALUES
        ('old@example.com', 'magic-old', '2026-08-01 00:00:00', NULL),
        ('active@example.com', 'magic-active', '2026-10-01 00:00:00', NULL),
        ('recent-used@example.com', 'magic-recent-used', '2026-10-01 00:00:00', '2026-09-10 00:00:00')");

    $pdo->exec("INSERT INTO email_login_challenges
        (challenge_token_hash, email_normalized, code_mac, expires_at, invalidated_at)
        VALUES
        ('challenge-old', 'old@example.com', 'mac-old', '2026-10-01 00:00:00', '2026-08-15 00:00:00'),
        ('challenge-active', 'active@example.com', 'mac-active', '2026-10-01 00:00:00', NULL)");

    $pdo->exec("INSERT INTO sessions
        (token_hash, user_id, expires_at, revoked_at)
        VALUES
        ('session-old', 'user-1', '2026-10-01 00:00:00', '2026-08-01 00:00:00'),
        ('session-active', 'user-1', '2026-10-01 00:00:00', NULL)");

    $pdo->exec("INSERT INTO persistent_sessions
        (token_hash, user_id, expires_at, revoked_at)
        VALUES
        ('persistent-old', 'user-1', '2026-10-01 00:00:00', '2026-08-01 00:00:00'),
        ('persistent-active', 'user-1', '2026-10-01 00:00:00', NULL)");

    $pdo->exec("INSERT INTO purchase_intents
        (purchase_ref_hash, user_id, product_key, expires_at, consumed_at)
        VALUES
        ('intent-old-unreferenced', 'user-1', 'full_tamamizu', '2026-08-01 00:00:00', NULL),
        ('intent-recent', 'user-1', 'full_tamamizu', '2026-09-10 00:00:00', NULL),
        ('intent-old-referenced', 'user-1', 'full_tamamizu', '2026-08-01 00:00:00', NULL)");

    $referencedId = (int) $pdo->query(
        "SELECT id FROM purchase_intents WHERE purchase_ref_hash = 'intent-old-referenced'",
    )->fetchColumn();
    $pdo->exec("INSERT INTO transaction_grants
        (paddle_transaction_id, user_id, product_key, purchase_intent_id, status, granted_at, status_changed_at)
        VALUES
        ('txn-referenced', 'user-1', 'full_tamamizu', {$referencedId}, 'active', '2026-08-01 00:00:00', '2026-08-01 00:00:00')");
}

/**
 * @return array<string, callable(): void>
 */
function ephemeralDataCleanupRepositoryTests(): array
{
    return [
        'preview and apply delete only terminal rows older than cutoff and never a grant-referenced intent' => function () {
            $pdo = makeEphemeralCleanupTestDb();
            insertCleanupFixture($pdo);
            $repo = new EphemeralDataCleanupRepository($pdo);
            $cutoff = new DateTimeImmutable('2026-09-01 00:00:00');

            assertSame([
                'magicLinkTokens' => 1,
                'emailLoginChallenges' => 1,
                'sessions' => 1,
                'persistentSessions' => 1,
                'purchaseIntents' => 1,
            ], $repo->preview($cutoff), 'preview should count only old terminal/unreferenced rows');

            assertSame([
                'magicLinkTokens' => 1,
                'emailLoginChallenges' => 1,
                'sessions' => 1,
                'persistentSessions' => 1,
                'purchaseIntents' => 1,
            ], $repo->applyOneBatch($cutoff), 'apply should delete exactly the previewed eligible rows');

            assertSame(0, array_sum($repo->preview($cutoff)), 'no eligible rows should remain');

            assertSame(1, (int) $pdo->query("SELECT COUNT(*) FROM magic_link_tokens WHERE token_hash = 'magic-active'")->fetchColumn(), 'active Magic Link must survive');
            assertSame(1, (int) $pdo->query("SELECT COUNT(*) FROM purchase_intents WHERE purchase_ref_hash = 'intent-old-referenced'")->fetchColumn(), 'grant-referenced purchase intent must survive');
            assertSame(1, (int) $pdo->query("SELECT COUNT(*) FROM purchase_intents WHERE purchase_ref_hash = 'intent-recent'")->fetchColumn(), 'recent expired intent inside grace period must survive');
        },

        'persistent session cleanup waits for linked session rows and can remove both when both are stale' => function () {
            $pdo = makeEphemeralCleanupTestDb();
            $pdo->exec("INSERT INTO persistent_sessions
                (token_hash, user_id, expires_at, revoked_at)
                VALUES
                ('parent-stale', 'user-1', '2026-08-01 00:00:00', '2026-08-01 00:00:00'),
                ('parent-with-active-child', 'user-1', '2026-08-01 00:00:00', '2026-08-01 00:00:00')");

            $staleParentId = (int) $pdo->query("SELECT id FROM persistent_sessions WHERE token_hash = 'parent-stale'")->fetchColumn();
            $activeParentId = (int) $pdo->query("SELECT id FROM persistent_sessions WHERE token_hash = 'parent-with-active-child'")->fetchColumn();

            $pdo->exec("INSERT INTO sessions
                (token_hash, user_id, persistent_session_id, expires_at, revoked_at)
                VALUES
                ('child-stale', 'user-1', {$staleParentId}, '2026-08-01 00:00:00', NULL),
                ('child-active', 'user-1', {$activeParentId}, '2026-10-01 00:00:00', NULL)");

            $repo = new EphemeralDataCleanupRepository($pdo);
            $deleted = $repo->applyOneBatch(new DateTimeImmutable('2026-09-01 00:00:00'));

            assertSame(1, $deleted['sessions'], 'stale child should be removed first');
            assertSame(1, $deleted['persistentSessions'], 'stale parent should become eligible after child removal');
            assertSame(1, (int) $pdo->query("SELECT COUNT(*) FROM persistent_sessions WHERE token_hash = 'parent-with-active-child'")->fetchColumn(), 'parent with active child must survive');
            assertSame(1, (int) $pdo->query("SELECT COUNT(*) FROM sessions WHERE token_hash = 'child-active'")->fetchColumn(), 'active child must survive');
        },

        'batch limit bounds deletion per table' => function () {
            $pdo = makeEphemeralCleanupTestDb();
            $pdo->exec("INSERT INTO magic_link_tokens
                (email_normalized, token_hash, expires_at)
                VALUES
                ('a@example.com', 'old-a', '2026-08-01 00:00:00'),
                ('b@example.com', 'old-b', '2026-08-01 00:00:00')");

            $repo = new EphemeralDataCleanupRepository($pdo, 1);
            $deleted = $repo->applyOneBatch(new DateTimeImmutable('2026-09-01 00:00:00'));

            assertSame(1, $deleted['magicLinkTokens'], 'only one row should be deleted in this table');
            assertSame(1, $repo->preview(new DateTimeImmutable('2026-09-01 00:00:00'))['magicLinkTokens'], 'one eligible row should remain for a future batch');
        },
    ];
}
