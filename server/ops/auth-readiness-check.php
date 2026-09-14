<?php

declare(strict_types=1);

/**
 * Operator-run, read-only CLI preflight for Production Web cookie auth
 * readiness. Closes the gap noted in ProductionAuthReadiness's own doc
 * comment: that class existed with a unit test but no actual invocation
 * path, so nothing ever ran it against a real deployment's config.
 *
 * Usage (on the server, or against a local server/config.php):
 *   php server/ops/auth-readiness-check.php
 *
 * Exit code 0: not misconfigured (either cookie auth is off, which is a
 *   normal dev/Sandbox state, or it's on and a real mailer is configured).
 * Exit code 1: WEB_SESSION_COOKIE_ENABLED is on but no real Magic Link
 *   mailer is configured -- Live sign-in cannot work. Fix before treating
 *   this deployment as production-ready.
 *
 * Never prints secret values -- only the same booleans
 * ProductionAuthReadiness exposes.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Auth/ProductionAuthReadiness.php';

use KanaGame\Paddle\Auth\ProductionAuthReadiness;
use KanaGame\Paddle\Config;

$config = Config::load();
$readiness = ProductionAuthReadiness::fromConfig($config);

fwrite(
    STDOUT,
    sprintf(
        "webCookieAuthActive=%s productionMagicLinkMailerConfigured=%s\n",
        $readiness->webCookieAuthActive ? 'true' : 'false',
        $readiness->productionMagicLinkMailerConfigured ? 'true' : 'false',
    ),
);

if ($readiness->isMisconfigured()) {
    fwrite(
        STDERR,
        "MISCONFIGURED: WEB_SESSION_COOKIE_ENABLED is on but no real Magic Link " .
        "mailer is configured (RESEND_API_KEY / MAGIC_LINK_FROM_EMAIL / " .
        "MAGIC_LINK_FROM_NAME incomplete). Live sign-in cannot work.\n",
    );
    exit(1);
}

fwrite(STDOUT, "OK\n");
exit(0);
