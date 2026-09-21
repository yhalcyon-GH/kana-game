<?php

declare(strict_types=1);

/**
 * Guarded CLI-only Security Audit v1 cutover reconciler.
 *
 * Read-only inventory:
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
require __DIR__ . '/../src/PaddleEnvironmentConfig.php';
require __DIR__ . '/../src/Db.php';
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
require __DIR__ . '/../src/Purchase/RefundCompleteness.php';
require __DIR__ . '/../src/Purchase/PurchaseWebhookHandler.php';

use KanaGame\Paddle\Config;
use KanaGame\Paddle\Db;
use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\PaddleEnvironmentConfig;
use KanaGame\Paddle\PaddleSignature;
use KanaGame\Paddle\PaymentEventRepository;
use KanaGame\Paddle\Purchase\PendingAdjustmentRepository;
use KanaGame\Paddle\Purchase\PurchaseIntentRepository;
use KanaGame\Paddle\Purchase\PurchaseWebhookHandler;
use KanaGame\Paddle\Purchase\TransactionEventLockRepository;
use KanaGame\Paddle\Purchase\TransactionGrantRepository;

$apply = in_array('--apply', $argv, true);
$approved = in_array('--human-approved-security-cutover', $argv, true);

if ($apply && !$approved) {
    fwrite(STDERR, "REFUSED: --apply requires --human-approved-security-cutover.\n");
    exit(2);
}

$config = Config::load();
$pdo = Db::connect($config);
$pending = new PendingAdjustmentRepository($pdo);

$before = count($pending->findUnreconciledTransactionIdsWithGrant());
fwrite(STDOUT, "grantBackedUnreconciledTransactions={$before}\n");

if (!$apply) {
    exit($before === 0 ? 0 : 1);
}

try {
    $environmentConfig = PaddleEnvironmentConfig::resolve($config);
    $handler = new PurchaseWebhookHandler(
        $pdo,
        new PaddleSignature($environmentConfig->webhookSecret),
        new PaymentEventRepository($pdo),
        new TransactionEventLockRepository($pdo),
        new PurchaseIntentRepository($pdo),
        new TransactionGrantRepository($pdo),
        $pending,
        new EntitlementRepository($pdo),
        $environmentConfig->priceId,
        $environmentConfig->productId,
    );

    $processed = $handler->reconcileLegacyUnreconciledAdjustments();
} catch (\Throwable) {
    fwrite(STDERR, "BLOCKED: cutover reconciliation failed closed; no identifiers emitted.\n");
    exit(2);
}

$after = count($pending->findUnreconciledTransactionIdsWithGrant());
fwrite(STDOUT, "reconciledTransactions={$processed} remainingGrantBackedUnreconciledTransactions={$after}\n");

exit($after === 0 ? 0 : 1);
