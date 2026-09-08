<?php

declare(strict_types=1);

/**
 * Paddle Sandbox webhook receiver — Phase 2 PoC entrypoint.
 *
 * Deploy at, e.g., https://<your-domain>/api/paddle-webhook.php on
 * Xserver — see docs/paddle-webhook-poc.md for the full deployment and
 * Paddle Sandbox notification-destination setup steps.
 *
 * Security model (see docs/paddle-webhook-poc.md for full detail):
 * - The RAW request body is read once via php://input and never
 *   re-serialized before signature verification (Paddle's own docs
 *   explicitly warn that re-formatting the body breaks the signature —
 *   see server/src/PaddleSignature.php's doc comment).
 * - Signature verification (HMAC-SHA256, Paddle-Signature header, 5s
 *   timestamp tolerance) happens BEFORE the payload is trusted for
 *   anything else.
 * - Only a signature-verified transaction.completed event for the
 *   configured Full Tamamizu price+product, carrying a valid
 *   custom_data.internal_user_id, ever activates an entitlement. Nothing
 *   else in this file (or in the client-side PoC checkout page) can grant
 *   entitlement — see WebhookHandler.php.
 */

require __DIR__ . '/src/Config.php';
require __DIR__ . '/src/Db.php';
require __DIR__ . '/src/PaddleSignature.php';
require __DIR__ . '/src/PaymentEventRepository.php';
require __DIR__ . '/src/EntitlementRepository.php';
require __DIR__ . '/src/SandboxUser.php';
require __DIR__ . '/src/ProductMatcher.php';
require __DIR__ . '/src/WebhookHandler.php';

use KanaGame\Paddle\Config;
use KanaGame\Paddle\Db;
use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\PaddleSignature;
use KanaGame\Paddle\PaymentEventRepository;
use KanaGame\Paddle\WebhookHandler;

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
    error_log('paddle-webhook: startup failure: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

$handler = new WebhookHandler(
    new PaddleSignature($secret),
    new PaymentEventRepository($pdo),
    new EntitlementRepository($pdo),
    $expectedPriceId,
    $expectedProductId,
);

try {
    $result = $handler->handle($rawBody, $signatureHeader);
} catch (\Throwable $e) {
    // Never log the raw payload/customer data — see
    // docs/paddle-webhook-poc.md's Privacy section. Only the exception
    // message (no payload contents) goes to the server error log.
    error_log('paddle-webhook: unexpected error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

http_response_code($result->statusCode);
echo json_encode(['message' => $result->message]);
