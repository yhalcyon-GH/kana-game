<?php

declare(strict_types=1);

/**
 * Read-only entitlement lookup — Phase 2 PoC endpoint.
 *
 * GET /api/entitlement.php?user_id=sandbox-test-user
 * -> {"user_id": "sandbox-test-user", "product": "full_tamamizu", "active": true, "updated_at": "..."}
 *
 * This endpoint never writes anything — entitlement state is only ever
 * changed by a signature-verified Paddle webhook (see paddle-webhook.php).
 * Deploy at, e.g., https://<your-domain>/api/entitlement.php — see
 * docs/paddle-webhook-poc.md.
 */

require __DIR__ . '/src/Config.php';
require __DIR__ . '/src/Db.php';
require __DIR__ . '/src/EntitlementRepository.php';
require __DIR__ . '/src/Cors.php';
require __DIR__ . '/src/WebhookHandler.php';
require __DIR__ . '/src/SandboxUser.php';

use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;
use KanaGame\Paddle\EntitlementRepository;
use KanaGame\Paddle\WebhookHandler;

$config = Config::load();
$cors = new Cors($config->allowedOrigins());
$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);

header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    // CORS preflight — no body needed, headers were already applied above.
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$userId = $_GET['user_id'] ?? null;

// Validate strictly: only the exact known Sandbox PoC test identifier is
// accepted (see server/src/SandboxUser.php) — this endpoint deliberately
// cannot be used to probe for other users' entitlement state, since none
// exist in this PoC and none should be guessable/enumerable if this code
// is ever extended.
if (!is_string($userId) || $userId !== \KanaGame\Paddle\SandboxUser::ID) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid or missing user_id']);
    exit;
}

try {
    $pdo = Db::connect($config);
    $entitlements = new EntitlementRepository($pdo);
    $entitlement = $entitlements->find($userId, WebhookHandler::PRODUCT_KEY_FULL_TAMAMIZU);
} catch (\Throwable $e) {
    error_log('entitlement.php: lookup failure: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if ($entitlement === null) {
    echo json_encode([
        'user_id' => $userId,
        'product' => WebhookHandler::PRODUCT_KEY_FULL_TAMAMIZU,
        'active' => false,
        'updated_at' => null,
    ]);
    exit;
}

echo json_encode([
    'user_id' => $userId,
    'product' => $entitlement['product_key'],
    'active' => $entitlement['active'],
    'updated_at' => $entitlement['updated_at'],
]);
