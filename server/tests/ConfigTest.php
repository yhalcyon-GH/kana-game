<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Config;

require_once __DIR__ . '/TestCase.php';
require_once __DIR__ . '/../src/Config.php';

/**
 * @return array<string, callable(): void>
 */
function configTests(): array
{
    return [
        // -- Required self-check: DEV_HARNESS_ENABLED must be
        // false/absent by default, so a forgotten config value can't
        // silently ship the dev-only harness -- see
        // server/dev-only/last-magic-link.php's own gate.
        'DEV_HARNESS_ENABLED is unset (falsy) when no config value is provided' => function () {
            $config = Config::fromArray([]);
            assertSame(null, $config->get('DEV_HARNESS_ENABLED'), 'with no config value set at all, DEV_HARNESS_ENABLED must be null (never silently true)');
        },

        'DEV_HARNESS_ENABLED is exposed via get() when explicitly set to "true"' => function () {
            $config = Config::fromArray(['DEV_HARNESS_ENABLED' => 'true']);
            assertSame('true', $config->get('DEV_HARNESS_ENABLED'), 'an explicitly set value should be readable');
        },

        'intWithDefault() falls back to the default for a missing key' => function () {
            $config = Config::fromArray([]);
            assertSame(42, $config->intWithDefault('SOME_MISSING_KEY', 42), 'a missing key should fall back to the given default');
        },

        'intWithDefault() falls back to the default for a non-numeric value' => function () {
            $config = Config::fromArray(['SOME_KEY' => 'not-a-number']);
            assertSame(7, $config->intWithDefault('SOME_KEY', 7), 'a non-numeric value should fall back to the given default');
        },

        'intWithDefault() parses a valid numeric value' => function () {
            $config = Config::fromArray(['SOME_KEY' => '99']);
            assertSame(99, $config->intWithDefault('SOME_KEY', 1), 'a valid numeric string should be parsed');
        },

        'allowedOrigins() returns an empty list when ALLOWED_ORIGINS is unset' => function () {
            $config = Config::fromArray([]);
            assertSame([], $config->allowedOrigins(), 'no configured origins should mean an empty list');
        },

        // -- H2 rollout compatibility fix: Config::load() must keep the
        // old, pre-H2, unscoped Paddle keys loadable (rolling-deploy
        // compatibility only -- NOT an environment fallback; see
        // server/src/Config.php's own comment on this array entry and
        // PaddleEnvironmentConfigTest.php for proof that
        // PaddleEnvironmentConfig itself never reads these three keys).
        // load() reads real environment variables first (see its own
        // preference-order comment), so these tests set/unset env vars
        // directly rather than using fromArray(), which bypasses load()'s
        // key-scanning entirely.
        'Config::load() still reads the old, pre-H2 unscoped Paddle keys from real environment variables' => function () {
            putenv('PADDLE_WEBHOOK_SECRET=legacy-secret-value');
            putenv('PADDLE_FULL_TAMAMIZU_PRICE_ID=pri_legacy');
            putenv('PADDLE_FULL_TAMAMIZU_PRODUCT_ID=pro_legacy');
            try {
                $config = Config::load();
                assertSame('legacy-secret-value', $config->get('PADDLE_WEBHOOK_SECRET'), 'the old webhook secret key must still be loadable');
                assertSame('pri_legacy', $config->get('PADDLE_FULL_TAMAMIZU_PRICE_ID'), 'the old price id key must still be loadable');
                assertSame('pro_legacy', $config->get('PADDLE_FULL_TAMAMIZU_PRODUCT_ID'), 'the old product id key must still be loadable');
            } finally {
                putenv('PADDLE_WEBHOOK_SECRET');
                putenv('PADDLE_FULL_TAMAMIZU_PRICE_ID');
                putenv('PADDLE_FULL_TAMAMIZU_PRODUCT_ID');
            }
        },

        'Config::load() reads the new H2 scoped Paddle keys alongside the old ones, with both present' => function () {
            putenv('PADDLE_ENVIRONMENT=sandbox');
            putenv('PADDLE_SANDBOX_WEBHOOK_SECRET=new-sandbox-secret');
            putenv('PADDLE_SANDBOX_FULL_TAMAMIZU_PRICE_ID=pri_new_sandbox');
            putenv('PADDLE_SANDBOX_FULL_TAMAMIZU_PRODUCT_ID=pro_new_sandbox');
            putenv('PADDLE_WEBHOOK_SECRET=legacy-secret-value');
            putenv('PADDLE_FULL_TAMAMIZU_PRICE_ID=pri_legacy');
            putenv('PADDLE_FULL_TAMAMIZU_PRODUCT_ID=pro_legacy');
            try {
                $config = Config::load();
                assertSame('sandbox', $config->get('PADDLE_ENVIRONMENT'), 'the new environment key must be loadable');
                assertSame('new-sandbox-secret', $config->get('PADDLE_SANDBOX_WEBHOOK_SECRET'), 'the new scoped secret key must be loadable');
                assertSame('pri_new_sandbox', $config->get('PADDLE_SANDBOX_FULL_TAMAMIZU_PRICE_ID'), 'the new scoped price id key must be loadable');
                assertSame('pro_new_sandbox', $config->get('PADDLE_SANDBOX_FULL_TAMAMIZU_PRODUCT_ID'), 'the new scoped product id key must be loadable');
                // Both old and new are readable at once -- this is exactly
                // the overlap window the rolling-deploy fix requires;
                // Config itself does no filtering/interpretation between them.
                assertSame('legacy-secret-value', $config->get('PADDLE_WEBHOOK_SECRET'), 'the old key must remain readable at the same time as the new ones');
            } finally {
                putenv('PADDLE_ENVIRONMENT');
                putenv('PADDLE_SANDBOX_WEBHOOK_SECRET');
                putenv('PADDLE_SANDBOX_FULL_TAMAMIZU_PRICE_ID');
                putenv('PADDLE_SANDBOX_FULL_TAMAMIZU_PRODUCT_ID');
                putenv('PADDLE_WEBHOOK_SECRET');
                putenv('PADDLE_FULL_TAMAMIZU_PRICE_ID');
                putenv('PADDLE_FULL_TAMAMIZU_PRODUCT_ID');
            }
        },
    ];
}
