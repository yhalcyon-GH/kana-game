<?php

declare(strict_types=1);

/**
 * Public, unauthenticated feature-capability probe.
 *
 * GET /api/auth/capabilities.php
 * -> 200 {"email_code_auth": true|false}
 *
 * Deliberately has NO database dependency -- the frontend uses this to
 * decide whether to show OTP sign-in UI at all, falling back to Magic
 * Link when absent/false/unreachable (see the design spec), so a DB
 * outage must never make this probe itself fail in a way that could be
 * confused with "OTP is off." A network-level failure to reach this
 * endpoint at all is the frontend's own fallback trigger, not something
 * this file needs to special-case.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Cors.php';

use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;

$config = Config::load();
$cors = new Cors($config->allowedOrigins());

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    $cors->applyPreflightHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
    http_response_code(204);
    exit;
}

$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

echo json_encode([
    'email_code_auth' => $config->get('EMAIL_CODE_AUTH_ENABLED') === 'true',
]);
