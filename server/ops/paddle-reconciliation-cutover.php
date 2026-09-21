<?php

declare(strict_types=1);

/**
 * Guarded CLI-only Security Audit v1 cutover reconciler.
 *
 * Read-only inventory (works before migration 0009/new runtime deployment):
 *   php ops/paddle-reconciliation-cutover.php --check
 *
 * Production mutation (Human Gate only):
 *   php ops/paddle-reconciliation-cutover.php --apply --human-approved-security-cutover
 *
 * Output is counts only. No transaction ids, user ids, emails, payloads, or
 * secret values are printed.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';

use KanaGame\Paddle\Config;
use KanaGame\Paddle\Db;

$apply = in_array('--apply', $argv, true);
$approved = in_array('--human-approved-security-cutover', $argv, true);

if ($apply && !$approved) {
    fwrite(STDERR, "REFUSED: --apply requires --human-approved-security-cutover.\n");
    exit(2);
}

$config = Config::load();
$pdo = Db::connect($config);

/**
 * Deliberately raw/read-only SQL so --check can run BEFORE migration 0009 and
 * before the new Purchase runtime is deployed. Both tables/columns queried
 * here predate 0009.
 */
function countGrantBackedUnreconciledAdjustments(\PDO $pdo): int
{
    $statement = $pdo->query(
        'SELECT COUNT(DISTINCT p.paddle_transaction_id)
         FROM pending_adjustments p
         INNER JOIN transaction_grants g
           ON g.paddle_transaction_id = p.paddle_transaction_id
         WHERE p.reconciled_at IS NULL',
    );
    return (int) $statement->fetchColumn();
}

/**
 * Returns null before migration 0009 creates the quarantine table.
 */
function countUnresolvedReconciliationBlocksIfAvailable(\PDO $pdo): ?int
{
    $table = $pdo->query("SHOW TABLES LIKE 'paddle_reconciliation_blocks'")->fetchColumn();
    if ($table === false) {
        return null;
    }
    return (int) $pdo->query(
        'SELECT COUNT(*) FROM paddle_reconciliation_blocks WHERE resolved_at IS NULL',
    )->fetchColumn();
}

$before = countGrantBackedUnreconciledAdjustments($pdo);
$blocksBefore = countUnresolvedReconciliationBlocksIfAvailable($pdo);
fwrite(STDOUT, "grantBackedUnreconciledTransactions={$before}\n");
if ($blocksBefore !== null) {
    fwrite(STDOUT, "unresolvedReconciliationBlocks={$blocksBefore}\n");
}

if (!$apply) {
    exit($before === 0 && ($blocksBefore === null || $blocksBefore === 0) ? 0 : 1);
}

// Everything below is needed only by the mutating repair. Deferring these
// requires is what keeps the pre-cutover --check compatible with the old
// backend/schema (through 0006, with 0007 intentionally absent).
require __DIR__ . '/../src/PaddleEnvironmentConfig.php';
require __DIR__ . '/../src/WebhookResult.php';
require __DIR__ . '/../src/PaddleSignature.php';
require __DIR__ . '/../src/PaddleEventTime.php';
require __DIR__ . '/../src/PaymentEventRepository.php';
require __DIR__ . '/../src/EntitlementRepository.php';
require __DIR__ . '/../src/ProductMatcher.php';
require __DIR__ . '/../src/Purchase/PurchaseIntentRepository.php';
require __DIR__ . '/../src/Purchase/TransactionEventLockRepository.php';
require __DIR__ . '/../src/Purchase/GrantAdjustmentReducer.php';
require __DIR__ . '/../src/Purchase/TransactionGrantRepository.php';
require __DIR__ . '/../src/Purchase/PendingAdjustmentRepository.php';
require __DIR__ . '/../src/Purchase/ReconciliationBlockRepository.php';
require __DIR__ . '/../src/Purchase/RefundCompleteness.php';
require __DIR__ . '/../src/Purchase/PurchaseWebhookHandler.php';

try {
    $environmentConfig = \KanaGame\Paddle\PaddleEnvironmentConfig::resolve($config);
    $pending = new \KanaGame\Paddle\Purchase\PendingAdjustmentRepository($pdo);
    $handler = new \KanaGame\Paddle\Purchase\PurchaseWebhookHandler(
        $pdo,
        new \KanaGame\Paddle\PaddleSignature($environmentConfig->webhookSecret),
        new \KanaGame\Paddle\PaymentEventRepository($pdo),
        new \KanaGame\Paddle\Purchase\TransactionEventLockRepository($pdo),
        new \KanaGame\Paddle\Purchase\PurchaseIntentRepository($pdo),
        new \KanaGame\Paddle\Purchase\TransactionGrantRepository($pdo),
        $pending,
        new \KanaGame\Paddle\Purchase\ReconciliationBlockRepository($pdo),
        new \KanaGame\Paddle\EntitlementRepository($pdo),
        $environmentConfig->priceId,
        $environmentConfig->productId,
    );

    $processed = $handler->reconcileLegacyUnreconciledAdjustments();
} catch (\Throwable) {
    fwrite(STDERR, "BLOCKED: cutover reconciliation failed closed; no identifiers emitted.\n");
    exit(2);
}

$after = countGrantBackedUnreconciledAdjustments($pdo);
$blocksAfter = countUnresolvedReconciliationBlocksIfAvailable($pdo);
if ($blocksAfter === null) {
    fwrite(STDERR, "BLOCKED: migration 0009 quarantine table is missing.\n");
    exit(2);
}
fwrite(STDOUT, "reconciledTransactions={$processed} remainingGrantBackedUnreconciledTransactions={$after} unresolvedReconciliationBlocks={$blocksAfter}\n");

exit($after === 0 && $blocksAfter === 0 ? 0 : 1);
