<?php

declare(strict_types=1);

/**
 * Paddle webhook receiver — Phase 3A production entrypoint.
 *
 * Deploy at, e.g., https://<your-domain>/api/paddle-webhook.php on
 * Xserver — see docs/paddle-webhook-poc.md (Phase 2) and
 * docs/paddle-auth-phase3a-pr-b.md (Phase 3A) for deployment and Paddle
 * Sandbox notification-destination setup steps.
 *
 * Security model:
 * - The RAW request body is read once via php://input and never
 *   re-serialized before signature verification (Paddle's own docs
 *   explicitly warn that re-formatting the body breaks the signature —
 *   see server/src/PaddleSignature.php's doc comment).
 * - Signature verification (HMAC-SHA256, Paddle-Signature header, 5s
 *   timestamp tolerance) happens BEFORE the payload is trusted for
 *   anything else.
 * - As of Phase 3A, this entrypoint runs PurchaseWebhookHandler — the
 *   real-user path: only a signature-verified transaction.completed
 *   event for the configured Full Tamamizu price+product, carrying a
 *   valid custom_data.purchase_ref that resolves an unexpired,
 *   unconsumed purchase_intents row, ever activates an entitlement.
 *   Nothing in this file (or any client-side page) can grant
 *   entitlement — see server/src/Purchase/PurchaseWebhookHandler.php.
 * - Phase 2's fixed-Sandbox-user WebhookHandler (server/src/
 *   WebhookHandler.php) is NOT wired to this or any other live
 *   entrypoint as of Phase 3A — it remains fully intact and covered by
 *   its own tests (server/tests/WebhookHandlerTest.php) as a
 *   development-only compatibility reference, not a reachable
 *   production code path.
 */

require __DIR__ . '/src/Config.php';
require __DIR__ . '/src/Db.php';
require __DIR__ . '/src/PaddleSignature.php';
require __DIR__ . '/src/PaymentEventRepository.php';
require __DIR__ . '/src/EntitlementRepository.php';
require __DIR__ . '/src/ProductMatcher.php';
require __DIR__ . '/src/Purchase/PurchaseIntentRepository.php';
require __DIR__ . '/src/Purchase/TransactionGrantRepository.php';
require __DIR__ . '/src/Purchase/PendingAdjustmentRepository.php';
require __DIR__ . '/src/Purchase/PurchaseWebhookHandler.php';

use KanaGame\Paddle\Config;
use KanaGame\Paddle\Db;
use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\PaddleSignature;
use KanaGame\Paddle\PaymentEventRepository;
use KanaGame\Paddle\Purchase\PendingAdjustmentRepository;
use KanaGame\Paddle\Purchase\PurchaseIntentRepository;
use KanaGame\Paddle\Purchase\PurchaseWebhookHandler;
use KanaGame\Paddle\Purchase\TransactionGrantRepository;

header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

// Read the RAW body exactly once, before any parsing — see the file-level
// doc comment and PaddleSignature.php.
$rawBody = file_get_contents('php://input');
if ($rawBody === false) {
    http_response_code(400);
    echo json_encode(['error' => 'could not read request body']);
    exit;
}

$signatureHeader = $_SERVER['HTTP_PADDLE_SIGNATURE'] ?? null;

try {
    $config = Config::load();
    $secret = $config->require('PADDLE_WEBHOOK_SECRET');
    $expectedPriceId = $config->require('PADDLE_FULL_TAMAMIZU_PRICE_ID');
    $expectedProductId = $config->require('PADDLE_FULL_TAMAMIZU_PRODUCT_ID');
    $pdo = Db::connect($config);
} catch (\Throwable $e) {
    // Configuration/DB connectivity problems are server-side and
    // temporary from Paddle's perspective — return 5xx so Paddle retries,
    // and never leak exception details/DB credentials into the response.
    // Never log $e->getMessage() -- see server/src/Purchase/
    // PurchaseWebhookHandler.php's own doc comment for why an exception
    // message could itself carry sensitive payload-derived data.
    error_log('paddle-webhook: startup failure: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

$handler = new PurchaseWebhookHandler(
    new PaddleSignature($secret),
    new PaymentEventRepository($pdo),
    new PurchaseIntentRepository($pdo),
    new TransactionGrantRepository($pdo),
    new PendingAdjustmentRepository($pdo),
    new EntitlementRepository($pdo),
    $expectedPriceId,
    $expectedProductId,
);

try {
    $result = $handler->handle($rawBody, $signatureHeader);
} catch (\Throwable $e) {
    // Never log the raw payload/customer data, and never log
    // $e->getMessage() — see docs/paddle-webhook-poc.md's Privacy
    // section and PurchaseWebhookHandler's own doc comment. Only the
    // exception's class (no message, no payload contents) goes to the
    // server error log.
    error_log('paddle-webhook: unexpected error: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

http_response_code($result->statusCode);
echo json_encode(['message' => $result->message]);
