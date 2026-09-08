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

    // --- Phase 3A PR A: real-user identity + Magic Link auth ---

    // HMAC pepper for rate-limit identifiers (server/src/Auth/RateLimiter.php).
    // Required in real deployment config. Never committed. Rotating this
    // only resets everyone's rate-limit window — it does not invalidate
    // any stored identity, magic-link token, or session.
    'RATE_LIMIT_PEPPER' => '',

    // Optional — defaults to 5/hour and 20/hour respectively if unset or
    // non-numeric (see Config::intWithDefault()).
    'RATE_LIMIT_EMAIL_PER_HOUR' => '',
    'RATE_LIMIT_IP_PER_HOUR' => '',

    // Optional — defaults to 15 minutes (magic-link token) and 24 hours
    // (session) if unset or non-numeric. The 24-hour session default is
    // explicitly provisional for Phase 3A (in-memory-only browser
    // transport, no refresh/rotation system yet) — see
    // docs/adr/0001-cross-site-auth-transport.md.
    'MAGIC_LINK_TOKEN_EXPIRY_MINUTES' => '',
    'SESSION_EXPIRY_HOURS' => '',

    // The frontend origin/path prefix a magic-link token is appended to
    // — e.g. 'https://yhalcyon-gh.github.io/kana-game/'. Do NOT include
    // a "#/verify" route here: server/src/Auth/MagicLinkUrlBuilder.php
    // appends that fragment route and the urlencoded token itself, in
    // code, specifically so a config mistake here cannot turn the raw
    // token into a server-visible query parameter. See
    // docs/superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-
    // design.md, section 5.
    'MAGIC_LINK_FRONTEND_BASE_URL' => '',

    // --- Phase 3A PR C: dev-only /account-test harness ---

    // Must be the EXACT string 'true' to enable. Any other value
    // (including empty/absent, which is the default) leaves the
    // dev-only harness fully disabled: request-link.php falls back to
    // its normal inline no-op Mailer, and server/dev-only/
    // last-magic-link.php refuses every request with 403. NEVER set
    // this to 'true' in a real production deployment config — see
    // docs/paddle-auth-phase3a-pr-c.md. This flag is the second,
    // independent layer of protection alongside excluding
    // server/dev-only/ from the production deployment manifest.
    'DEV_HARNESS_ENABLED' => '',
];
