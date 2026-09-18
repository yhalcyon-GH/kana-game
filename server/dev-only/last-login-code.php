<?php

declare(strict_types=1);

/**
 * DEV-ONLY. Retrieves (and consumes) the most recently issued 6-digit
 * email sign-in code for a given email, so the /account-test frontend
 * harness can complete the OTP flow without real email delivery. Mirrors
 * server/dev-only/last-magic-link.php exactly, for the OTP flow instead
 * of the Magic Link flow -- see server/src/DevOnly/
 * DevHarnessLoginCodeStore.php's doc comment for why this table
 * intentionally stores a raw, plaintext code -- an exception scoped
 * entirely to this file's own gated dev-only path.
 *
 * GET /api/dev-only/last-login-code.php?email=<normalized-email>
 * -> 200 {"login_code": "123456"}
 * -> 404 {"error": "no pending login code for this email"}
 * -> 403 {"error": "dev harness disabled"}  -- ALWAYS this response
 *    (never a different shape) when DEV_HARNESS_ENABLED is not
 *    explicitly true, which is the default/absent state. This check
 *    happens before anything else in this file runs.
 *
 * server/dev-only/ is excluded from the production deployment manifest
 * (see docs/paddle-auth-phase3a-pr-c.md and docs/xserver-api-deployment-
 * plan.md) -- this file must never be uploaded to a production Xserver
 * deployment. The DEV_HARNESS_ENABLED gate is a second, independent
 * layer of protection in case that exclusion is ever missed.
 *
 * The raw login_code returned here is NEVER logged by this file.
 *
 * Every response (every status code) carries Cache-Control: no-store --
 * the success response returns a one-time-use raw sign-in code, which
 * must never be cache-eligible even briefly. Set unconditionally before
 * any branching, so no response path can be added later that forgets it.
 *
 * Applies the same allowlist-based Cors::applyHeaders() as every other
 * browser-facing endpoint (server/auth/*.php, purchase-intent.php,
 * entitlement-me.php, last-magic-link.php) -- this is a plain GET with
 * no custom headers/Authorization, so it's a CORS "simple request" and
 * never triggers a preflight; applyHeaders() alone is sufficient, no
 * OPTIONS handling needed. Without this, the browser still lets the GET
 * reach the server (a simple request isn't blocked pre-flight) and
 * DevHarnessLoginCodeStore::consume() still runs and deletes the row,
 * but the browser refuses to let JS read the response body --
 * indistinguishable from "no pending code" at the /account-test UI,
 * while silently consuming the code.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/DevOnly/DevHarnessLoginCodeStore.php';

use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;
use KanaGame\Paddle\DevOnly\DevHarnessLoginCodeStore;

$config = Config::load();
$cors = new Cors($config->allowedOrigins());
$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);

header('Content-Type: application/json');
header('Cache-Control: no-store');

if ($config->get('DEV_HARNESS_ENABLED') !== 'true') {
    http_response_code(403);
    echo json_encode(['error' => 'dev harness disabled']);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$emailNormalized = $_GET['email'] ?? null;
if (!is_string($emailNormalized) || $emailNormalized === '') {
    http_response_code(400);
    echo json_encode(['error' => 'missing email']);
    exit;
}

try {
    $pdo = Db::connect($config);
    $store = new DevHarnessLoginCodeStore($pdo);
    $loginCode = $store->consume($emailNormalized);
} catch (\Throwable $e) {
    // NEVER log $e->getMessage() -- see the rest of this codebase's
    // logging discipline (server/auth/*.php, server/paddle-webhook.php).
    error_log('last-login-code.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if ($loginCode === null) {
    http_response_code(404);
    echo json_encode(['error' => 'no pending login code for this email']);
    exit;
}

echo json_encode(['login_code' => $loginCode]);
