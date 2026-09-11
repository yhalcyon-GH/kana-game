<?php

declare(strict_types=1);

/**
 * DEV-ONLY. Retrieves (and consumes) the most recently issued magic
 * link for a given email, so the /account-test frontend harness can
 * follow it without real email delivery. See
 * server/src/DevOnly/DevHarnessMagicLinkStore.php's doc comment for
 * why this table intentionally stores a raw magic-link URL — an
 * exception scoped entirely to this file's own gated dev-only path.
 *
 * GET /api/dev-only/last-magic-link.php?email=<normalized-email>
 * -> 200 {"magic_link_url": "https://.../#/verify?token=..."}
 * -> 404 {"error": "no pending magic link for this email"}
 * -> 403 {"error": "dev harness disabled"}  -- ALWAYS this response
 *    (never a different shape) when DEV_HARNESS_ENABLED is not
 *    explicitly true, which is the default/absent state. This check
 *    happens before anything else in this file runs.
 *
 * server/dev-only/ is excluded from the production deployment manifest
 * (see docs/paddle-auth-phase3a-pr-c.md) — this file must never be
 * uploaded to a production Xserver deployment. The DEV_HARNESS_ENABLED
 * gate is a second, independent layer of protection in case that
 * exclusion is ever missed.
 *
 * The raw magic_link_url returned here is NEVER logged by this file.
 *
 * Every response (every status code) carries Cache-Control: no-store —
 * the success response returns a one-time-use raw magic-link URL, which
 * must never be cache-eligible even briefly. Set unconditionally before
 * any branching, so no response path can be added later that forgets it.
 *
 * Applies the same allowlist-based Cors::applyHeaders() as every other
 * browser-facing endpoint (server/auth/*.php, purchase-intent.php,
 * entitlement-me.php) — this is a plain GET with no custom headers/
 * Authorization, so it's a CORS "simple request" and never triggers a
 * preflight; applyHeaders() alone is sufficient, no OPTIONS handling
 * needed (contrast server/auth/me.php, which needs Cors::
 * applyPreflightHeaders() because its Authorization header does trigger
 * one). Without this, the browser still lets the GET reach the server
 * (a simple request isn't blocked pre-flight) and DevHarnessMagicLinkStore
 * ::consume() still runs and deletes the row, but the browser refuses to
 * let JS read the response body — indistinguishable from "no pending
 * link" at the /account-test UI, while silently consuming the link.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/DevOnly/DevHarnessMagicLinkStore.php';

use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;
use KanaGame\Paddle\DevOnly\DevHarnessMagicLinkStore;

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
    $store = new DevHarnessMagicLinkStore($pdo);
    $magicLinkUrl = $store->consume($emailNormalized);
} catch (\Throwable $e) {
    // NEVER log $e->getMessage() -- see the rest of this codebase's
    // logging discipline (server/auth/*.php, server/paddle-webhook.php).
    error_log('last-magic-link.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if ($magicLinkUrl === null) {
    http_response_code(404);
    echo json_encode(['error' => 'no pending magic link for this email']);
    exit;
}

echo json_encode(['magic_link_url' => $magicLinkUrl]);
