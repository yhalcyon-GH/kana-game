<?php

declare(strict_types=1);

namespace KanaGame\Paddle\MariadbConcurrency;

require_once __DIR__ . '/bootstrap.php';

use DateTimeImmutable;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Ops\EphemeralDataCleanupRepository;
use RuntimeException;

function cleanupCheck(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$pdo = connectMariadbConcurrencyTestDb();

$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
foreach ([
    'transaction_grants',
    'sessions',
    'persistent_sessions',
    'purchase_intents',
    'email_login_challenges',
    'magic_link_tokens',
    'users',
] as $table) {
    $pdo->exec("TRUNCATE TABLE {$table}");
}
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

$user = (new UserRepository($pdo))->findOrCreateByEmail('cleanup-ci@example.com');
$userId = $user['id'];

$pdo->prepare(
    "INSERT INTO magic_link_tokens
        (email_normalized, token_hash, browser_binding_hash, expires_at, used_at, created_at)
     VALUES
        ('old@example.com', REPEAT('a', 64), NULL, DATE_SUB(NOW(), INTERVAL 40 DAY), NULL, NOW()),
        ('active@example.com', REPEAT('b', 64), NULL, DATE_ADD(NOW(), INTERVAL 1 DAY), NULL, NOW())",
)->execute();

$pdo->prepare(
    "INSERT INTO email_login_challenges
        (challenge_token_hash, email_normalized, code_mac, expires_at, attempts, used_at, invalidated_at, created_at)
     VALUES
        (REPEAT('c', 64), 'old@example.com', REPEAT('d', 64), DATE_ADD(NOW(), INTERVAL 1 DAY), 0, NULL, DATE_SUB(NOW(), INTERVAL 40 DAY), NOW()),
        (REPEAT('e', 64), 'active@example.com', REPEAT('f', 64), DATE_ADD(NOW(), INTERVAL 1 DAY), 0, NULL, NULL, NOW())",
)->execute();

$insertPersistent = $pdo->prepare(
    "INSERT INTO persistent_sessions
        (token_hash, user_id, expires_at, revoked_at, created_at, last_seen_at)
     VALUES
        (:token_hash, :user_id, :expires_at, :revoked_at, NOW(), NOW())",
);
$insertPersistent->execute([
    'token_hash' => str_repeat('1', 64),
    'user_id' => $userId,
    'expires_at' => (new DateTimeImmutable('-40 days'))->format('Y-m-d H:i:s'),
    'revoked_at' => null,
]);
$staleParentId = (int) $pdo->lastInsertId();

$insertPersistent->execute([
    'token_hash' => str_repeat('2', 64),
    'user_id' => $userId,
    'expires_at' => (new DateTimeImmutable('-40 days'))->format('Y-m-d H:i:s'),
    'revoked_at' => null,
]);
$activeChildParentId = (int) $pdo->lastInsertId();

$insertSession = $pdo->prepare(
    "INSERT INTO sessions
        (token_hash, user_id, persistent_session_id, expires_at, revoked_at, created_at, last_seen_at)
     VALUES
        (:token_hash, :user_id, :parent_id, :expires_at, :revoked_at, NOW(), NOW())",
);
$insertSession->execute([
    'token_hash' => str_repeat('3', 64),
    'user_id' => $userId,
    'parent_id' => $staleParentId,
    'expires_at' => (new DateTimeImmutable('-40 days'))->format('Y-m-d H:i:s'),
    'revoked_at' => null,
]);
$insertSession->execute([
    'token_hash' => str_repeat('4', 64),
    'user_id' => $userId,
    'parent_id' => $activeChildParentId,
    'expires_at' => (new DateTimeImmutable('+1 day'))->format('Y-m-d H:i:s'),
    'revoked_at' => null,
]);

$insertIntent = $pdo->prepare(
    "INSERT INTO purchase_intents
        (purchase_ref_hash, user_id, product_key, expires_at, consumed_at, paddle_transaction_id, created_at)
     VALUES
        (:hash, :user_id, 'full_tamamizu', :expires_at, NULL, NULL, NOW())",
);
$insertIntent->execute([
    'hash' => str_repeat('5', 64),
    'user_id' => $userId,
    'expires_at' => (new DateTimeImmutable('-40 days'))->format('Y-m-d H:i:s'),
]);
$unreferencedIntentId = (int) $pdo->lastInsertId();

$insertIntent->execute([
    'hash' => str_repeat('6', 64),
    'user_id' => $userId,
    'expires_at' => (new DateTimeImmutable('-40 days'))->format('Y-m-d H:i:s'),
]);
$referencedIntentId = (int) $pdo->lastInsertId();

$grant = $pdo->prepare(
    "INSERT INTO transaction_grants
        (paddle_transaction_id, user_id, product_key, purchase_intent_id, status, granted_at, status_changed_at, created_at, updated_at)
     VALUES
        ('txn_cleanup_fk', :user_id, 'full_tamamizu', :intent_id, 'active', NOW(), NOW(), NOW(), NOW())",
);
$grant->execute(['user_id' => $userId, 'intent_id' => $referencedIntentId]);

$repository = new EphemeralDataCleanupRepository($pdo);
$cutoff = new DateTimeImmutable('-30 days');

$preview = $repository->preview($cutoff);
cleanupCheck($preview['magicLinkTokens'] === 1, 'expected one stale Magic Link');
cleanupCheck($preview['emailLoginChallenges'] === 1, 'expected one stale email challenge');
cleanupCheck($preview['sessions'] === 1, 'expected one stale session');
cleanupCheck($preview['persistentSessions'] === 0, 'parents with linked sessions must not be previewed before child cleanup');
cleanupCheck($preview['purchaseIntents'] === 1, 'only unreferenced expired purchase intent may be eligible');

$deleted = $repository->applyOneBatch($cutoff);
cleanupCheck($deleted['sessions'] === 1, 'stale child session should be deleted');
cleanupCheck($deleted['persistentSessions'] === 1, 'parent should become eligible after stale child deletion');
cleanupCheck($deleted['magicLinkTokens'] === 1, 'stale Magic Link should be deleted');
cleanupCheck($deleted['emailLoginChallenges'] === 1, 'stale challenge should be deleted');
cleanupCheck($deleted['purchaseIntents'] === 1, 'unreferenced expired purchase intent should be deleted');

$referencedStillExists = (int) $pdo->query(
    "SELECT COUNT(*) FROM purchase_intents WHERE id = {$referencedIntentId}",
)->fetchColumn();
cleanupCheck($referencedStillExists === 1, 'FK-referenced purchase intent must survive cleanup');

$grantStillExists = (int) $pdo->query(
    "SELECT COUNT(*) FROM transaction_grants WHERE purchase_intent_id = {$referencedIntentId}",
)->fetchColumn();
cleanupCheck($grantStillExists === 1, 'grant ledger row must survive cleanup');

$unreferencedStillExists = (int) $pdo->query(
    "SELECT COUNT(*) FROM purchase_intents WHERE id = {$unreferencedIntentId}",
)->fetchColumn();
cleanupCheck($unreferencedStillExists === 0, 'unreferenced expired purchase intent should be gone');

$activeParentStillExists = (int) $pdo->query(
    "SELECT COUNT(*) FROM persistent_sessions WHERE id = {$activeChildParentId}",
)->fetchColumn();
cleanupCheck($activeParentStillExists === 1, 'persistent parent with active child must survive');

$activeChildStillExists = (int) $pdo->query(
    "SELECT COUNT(*) FROM sessions WHERE persistent_session_id = {$activeChildParentId}",
)->fetchColumn();
cleanupCheck($activeChildStillExists === 1, 'active child session must survive');

echo "MariaDB ephemeral cleanup verification passed: bounded cleanup preserves active credentials and FK-referenced purchase intents.\n";
