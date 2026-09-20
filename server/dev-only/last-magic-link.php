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
 * POST /api/dev-only/last-magic-link.php {"email": "<normalized-email>"}
 * Content-Type: application/json (required)
 * -> 200 {"magic_link_url": "https://.../#/verify?token=..."}
 * -> 404 {"error": "no pending magic link for this email"}
 * -> 403 {"error": "dev harness disabled"}  -- ALWAYS this response
 *    (never a different shape) when DEV_HARNESS_ENABLED is not
 *    explicitly true, which is the default/absent state. This check
 *    happens before anything else in this file runs, except the
 *    unauthenticated OPTIONS-preflight short-circuit below (a fixed
 *    204 that reveals nothing about harness/dev-only state).
 *
 * Issue #360: this endpoint used to be a plain GET with the email in
 * the query string. CORS already prevented a cross-site browser page
 * from READING the response (see the CORS doc comment below), but a
 * cross-site GET is a browser "simple request" -- it still reaches the
 * server and still lets DevHarnessMagicLinkStore::consume() delete the
 * pending row as a side effect, even though the attacker can never see
 * the result. POST + a required `application/json` body closes this:
 * a hostile cross-site <form> cannot set an `application/json`
 * Content-Type (form encodings are limited to the three CORS-simple
 * MIME types), and a hostile cross-site `fetch`/XHR that DOES set one
 * becomes CORS-preflighted, so the browser only sends the real request
 * once Cors::applyPreflightHeaders() has already allowlisted the
 * Origin. The explicit Origin re-check below is defense-in-depth for
 * any direct (non-browser) caller that supplies a spoofed Origin
 * header without going through preflight at all.
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
 * any response-status branch, so no response path can be added later
 * that forgets it.
 *
 * Applies the same allowlist-based Cors::applyHeaders()/
 * applyPreflightHeaders() as the other POST+JSON browser-facing
 * endpoints (server/auth/request-link.php, server/auth/request-code.php)
 * — this is now a non-"simple" request (application/json body), so a
 * browser sends a real OPTIONS preflight first; applyPreflightHeaders()
 * answers it with the allowed methods/headers for an allowlisted
 * Origin and nothing (no CORS headers) otherwise, which is what makes
 * the browser refuse to send the follow-up POST from a disallowed
 * Origin at all.
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

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    $cors->applyPreflightHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
    http_response_code(204);
    exit;
}

$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);

header('Content-Type: application/json');
header('Cache-Control: no-store');

if ($config->get('DEV_HARNESS_ENABLED') !== 'true') {
    http_response_code(403);
    echo json_encode(['error' => 'dev harness disabled']);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

// A hostile cross-site <form> POST cannot set this Content-Type (forms
// are limited to the three CORS-simple MIME types) -- requiring it here
// is itself part of this endpoint's CSRF defense, not just a body-shape
// check. Checked before any body/Origin handling below.
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
if (!preg_match('#^\s*application/json\s*(;.*)?$#i', $contentType)) {
    http_response_code(415);
    echo json_encode(['error' => 'unsupported content type']);
    exit;
}

// Reject a present, non-allowlisted Origin before reading/consuming the
// credential -- a direct (non-browser) caller that supplies a spoofed
// Origin header without going through a real CORS preflight must not
// reach the store. A caller with no Origin header at all (direct
// test/dev callers, curl, server-to-server) is unaffected.
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? null;
if ($requestOrigin !== null && $requestOrigin !== '' && !$cors->isOriginAllowed($requestOrigin)) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$body = json_decode(file_get_contents('php://input') ?: '', true);
$emailNormalized = is_array($body) ? ($body['email'] ?? null) : null;
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
