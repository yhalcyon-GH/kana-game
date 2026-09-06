<?php

declare(strict_types=1);

/**
 * Copy this file to server/config.php on Xserver (NOT in this repository —
 * server/config.php is gitignored, see .gitignore) and fill in real
 * values there. See docs/paddle-webhook-poc.md for exactly where each
 * value comes from and how to deploy this.
 *
 * NEVER commit server/config.php or put real values directly into this
 * example file. Config::load() (server/src/Config.php) also accepts these
 * same keys as real environment variables, if your hosting setup makes
 * that easier than a PHP file (e.g. an .htaccess SetEnv, or a php-fpm
 * pool's `env[...]` directives) — use whichever mechanism Xserver
 * actually supports; this file is one option, not the only one.
 */

return [
    // MySQL connection — create a dedicated DB user for this app with the
    // minimum privileges needed on the entitlement PoC database only.
    'DB_HOST' => '',
    'DB_NAME' => '',
    'DB_USER' => '',
    'DB_PASSWORD' => '',

    // From Paddle Sandbox dashboard -> Developer tools -> Notifications ->
    // (your destination) -> shown ONCE at creation time, prefixed
    // pdl_ntfset_... See docs/paddle-webhook-poc.md's setup steps. If lost,
    // rotate the destination's secret in the dashboard rather than
    // guessing/reusing an old value.
    'PADDLE_WEBHOOK_SECRET' => '',

    // The existing Full Tamamizu Sandbox price/product ids from PR #211's
    // Sandbox catalog (pri_... / pro_...). Used to verify a
    // transaction.completed event is for the expected offer before
    // activating any entitlement — see server/src/WebhookHandler.php.
    // These are not secrets, but keeping them in server config (not
    // hardcoded) avoids ever mixing up a Sandbox id with a future Live id.
    'PADDLE_FULL_TAMAMIZU_PRICE_ID' => '',
    'PADDLE_FULL_TAMAMIZU_PRODUCT_ID' => '',

    // Comma-separated list of exact origins allowed to call
    // entitlement.php via CORS (see server/src/Cors.php). No wildcards.
    // Example for local development + the deployed GitHub Pages app:
    //   'http://localhost:5173,http://localhost:4173,https://yhalcyon-gh.github.io'
    'ALLOWED_ORIGINS' => '',
];
