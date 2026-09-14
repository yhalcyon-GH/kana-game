<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Config;
use KanaGame\Paddle\PaddleEnvironmentConfig;

require_once __DIR__ . '/TestCase.php';
require_once __DIR__ . '/../src/Config.php';
require_once __DIR__ . '/../src/PaddleEnvironmentConfig.php';

const PEC_SANDBOX_VALUES = [
    'PADDLE_ENVIRONMENT' => 'sandbox',
    'PADDLE_SANDBOX_WEBHOOK_SECRET' => 'sandbox-secret',
    'PADDLE_SANDBOX_FULL_TAMAMIZU_PRICE_ID' => 'pri_sandbox',
    'PADDLE_SANDBOX_FULL_TAMAMIZU_PRODUCT_ID' => 'pro_sandbox',
];

const PEC_LIVE_VALUES = [
    'PADDLE_ENVIRONMENT' => 'live',
    'PADDLE_LIVE_WEBHOOK_SECRET' => 'live-secret',
    'PADDLE_LIVE_FULL_TAMAMIZU_PRICE_ID' => 'pri_live',
    'PADDLE_LIVE_FULL_TAMAMIZU_PRODUCT_ID' => 'pro_live',
];

/**
 * @return array<string, callable(): void>
 */
function paddleEnvironmentConfigTests(): array
{
    return [
        'sandbox selected + full sandbox config resolves to the sandbox triplet' => function () {
            $result = PaddleEnvironmentConfig::resolve(Config::fromArray(PEC_SANDBOX_VALUES));
            assertSame('sandbox', $result->environment, 'environment should be sandbox');
            assertSame('sandbox-secret', $result->webhookSecret, 'should resolve the sandbox webhook secret');
            assertSame('pri_sandbox', $result->priceId, 'should resolve the sandbox price id');
            assertSame('pro_sandbox', $result->productId, 'should resolve the sandbox product id');
        },

        'live selected + full live config resolves to the live triplet' => function () {
            $result = PaddleEnvironmentConfig::resolve(Config::fromArray(PEC_LIVE_VALUES));
            assertSame('live', $result->environment, 'environment should be live');
            assertSame('live-secret', $result->webhookSecret, 'should resolve the live webhook secret');
            assertSame('pri_live', $result->priceId, 'should resolve the live price id');
            assertSame('pro_live', $result->productId, 'should resolve the live product id');
        },

        'missing PADDLE_ENVIRONMENT throws (fail closed, no default)' => function () {
            $values = PEC_SANDBOX_VALUES;
            unset($values['PADDLE_ENVIRONMENT']);
            $threw = false;
            try {
                PaddleEnvironmentConfig::resolve(Config::fromArray($values));
            } catch (\RuntimeException) {
                $threw = true;
            }
            assertTrue($threw, 'an unset PADDLE_ENVIRONMENT must throw, never silently default to sandbox or live');
        },

        'unknown PADDLE_ENVIRONMENT value throws' => function () {
            foreach (['production', 'Sandbox', 'LIVE', 'staging', ''] as $bad) {
                $values = PEC_SANDBOX_VALUES;
                $values['PADDLE_ENVIRONMENT'] = $bad;
                $threw = false;
                try {
                    PaddleEnvironmentConfig::resolve(Config::fromArray($values));
                } catch (\RuntimeException) {
                    $threw = true;
                }
                assertTrue($threw, "PADDLE_ENVIRONMENT='{$bad}' must be rejected -- only the exact strings 'sandbox' and 'live' are valid");
            }
        },

        'sandbox selected but missing PADDLE_SANDBOX_WEBHOOK_SECRET throws' => function () {
            $values = PEC_SANDBOX_VALUES;
            unset($values['PADDLE_SANDBOX_WEBHOOK_SECRET']);
            $threw = false;
            try {
                PaddleEnvironmentConfig::resolve(Config::fromArray($values));
            } catch (\RuntimeException) {
                $threw = true;
            }
            assertTrue($threw, 'a missing required key for the SELECTED environment must throw');
        },

        'sandbox selected but missing PADDLE_SANDBOX_FULL_TAMAMIZU_PRICE_ID throws' => function () {
            $values = PEC_SANDBOX_VALUES;
            unset($values['PADDLE_SANDBOX_FULL_TAMAMIZU_PRICE_ID']);
            $threw = false;
            try {
                PaddleEnvironmentConfig::resolve(Config::fromArray($values));
            } catch (\RuntimeException) {
                $threw = true;
            }
            assertTrue($threw, 'a missing required price id for the SELECTED environment must throw');
        },

        'sandbox selected but missing PADDLE_SANDBOX_FULL_TAMAMIZU_PRODUCT_ID throws' => function () {
            $values = PEC_SANDBOX_VALUES;
            unset($values['PADDLE_SANDBOX_FULL_TAMAMIZU_PRODUCT_ID']);
            $threw = false;
            try {
                PaddleEnvironmentConfig::resolve(Config::fromArray($values));
            } catch (\RuntimeException) {
                $threw = true;
            }
            assertTrue($threw, 'a missing required product id for the SELECTED environment must throw');
        },

        'live selected but missing any live key throws (same guard applies to both environments)' => function () {
            foreach (['PADDLE_LIVE_WEBHOOK_SECRET', 'PADDLE_LIVE_FULL_TAMAMIZU_PRICE_ID', 'PADDLE_LIVE_FULL_TAMAMIZU_PRODUCT_ID'] as $key) {
                $values = PEC_LIVE_VALUES;
                unset($values[$key]);
                $threw = false;
                try {
                    PaddleEnvironmentConfig::resolve(Config::fromArray($values));
                } catch (\RuntimeException) {
                    $threw = true;
                }
                assertTrue($threw, "missing {$key} while live is selected must throw");
            }
        },

        // -- The core anti-mixing guarantee --

        'sandbox selected with ONLY live keys present (no sandbox keys at all) throws -- there is no cross-environment fallback' => function () {
            $values = ['PADDLE_ENVIRONMENT' => 'sandbox'] + array_diff_key(PEC_LIVE_VALUES, ['PADDLE_ENVIRONMENT' => true]);
            $threw = false;
            try {
                PaddleEnvironmentConfig::resolve(Config::fromArray($values));
            } catch (\RuntimeException) {
                $threw = true;
            }
            assertTrue($threw, 'selecting sandbox must never silently resolve using the live triplet just because it happens to be present');
        },

        'live selected with ONLY sandbox keys present (no live keys at all) throws -- there is no cross-environment fallback' => function () {
            $values = ['PADDLE_ENVIRONMENT' => 'live'] + array_diff_key(PEC_SANDBOX_VALUES, ['PADDLE_ENVIRONMENT' => true]);
            $threw = false;
            try {
                PaddleEnvironmentConfig::resolve(Config::fromArray($values));
            } catch (\RuntimeException) {
                $threw = true;
            }
            assertTrue($threw, 'selecting live must never silently resolve using the sandbox triplet just because it happens to be present');
        },

        'sandbox selected with BOTH triplets present resolves to sandbox values only -- live values never leak in' => function () {
            $values = PEC_SANDBOX_VALUES + array_diff_key(PEC_LIVE_VALUES, ['PADDLE_ENVIRONMENT' => true]);
            $result = PaddleEnvironmentConfig::resolve(Config::fromArray($values));
            assertSame('sandbox-secret', $result->webhookSecret, 'must resolve the sandbox secret, not the live one');
            assertSame('pri_sandbox', $result->priceId, 'must resolve the sandbox price id, not the live one');
            assertSame('pro_sandbox', $result->productId, 'must resolve the sandbox product id, not the live one');
        },

        'live selected with BOTH triplets present resolves to live values only -- sandbox values never leak in' => function () {
            $values = PEC_LIVE_VALUES + array_diff_key(PEC_SANDBOX_VALUES, ['PADDLE_ENVIRONMENT' => true]);
            $result = PaddleEnvironmentConfig::resolve(Config::fromArray($values));
            assertSame('live-secret', $result->webhookSecret, 'must resolve the live secret, not the sandbox one');
            assertSame('pri_live', $result->priceId, 'must resolve the live price id, not the sandbox one');
            assertSame('pro_live', $result->productId, 'must resolve the live product id, not the sandbox one');
        },

        // -- H2 rollout compatibility fix: the old, pre-H2 unscoped keys
        // must NEVER be read by PaddleEnvironmentConfig, even when they
        // coexist with the new scoped keys (the exact overlap-window
        // state a Production rollout deliberately creates -- see
        // docs/paddle-environment-separation.md's "Superseded keys"
        // section). Config::load() itself was fixed to keep these old
        // keys loadable (ConfigTest.php covers that in isolation) purely
        // for the still-running OLD paddle-webhook.php's benefit;
        // PaddleEnvironmentConfig's own resolution logic is unchanged and
        // is re-proven here specifically against fixtures that ALSO carry
        // the old keys, with deliberately DIFFERENT values from the new
        // ones, so a real leak (not just a coincidental match) would be
        // caught.

        'sandbox selected, with the old unscoped keys ALSO present carrying deliberately different values, resolves to the sandbox triplet only' => function () {
            $values = PEC_SANDBOX_VALUES + [
                'PADDLE_WEBHOOK_SECRET' => 'LEGACY-value-must-never-be-used',
                'PADDLE_FULL_TAMAMIZU_PRICE_ID' => 'pri_LEGACY_must_never_be_used',
                'PADDLE_FULL_TAMAMIZU_PRODUCT_ID' => 'pro_LEGACY_must_never_be_used',
            ];
            $result = PaddleEnvironmentConfig::resolve(Config::fromArray($values));
            assertSame('sandbox-secret', $result->webhookSecret, 'must resolve the new scoped sandbox secret, never the coexisting legacy value');
            assertSame('pri_sandbox', $result->priceId, 'must resolve the new scoped sandbox price id, never the coexisting legacy value');
            assertSame('pro_sandbox', $result->productId, 'must resolve the new scoped sandbox product id, never the coexisting legacy value');
        },

        'live selected, with the old unscoped keys ALSO present carrying deliberately different values, resolves to the live triplet only' => function () {
            $values = PEC_LIVE_VALUES + [
                'PADDLE_WEBHOOK_SECRET' => 'LEGACY-value-must-never-be-used',
                'PADDLE_FULL_TAMAMIZU_PRICE_ID' => 'pri_LEGACY_must_never_be_used',
                'PADDLE_FULL_TAMAMIZU_PRODUCT_ID' => 'pro_LEGACY_must_never_be_used',
            ];
            $result = PaddleEnvironmentConfig::resolve(Config::fromArray($values));
            assertSame('live-secret', $result->webhookSecret, 'must resolve the new scoped live secret, never the coexisting legacy value');
            assertSame('pri_live', $result->priceId, 'must resolve the new scoped live price id, never the coexisting legacy value');
            assertSame('pro_live', $result->productId, 'must resolve the new scoped live product id, never the coexisting legacy value');
        },

        'ONLY the old unscoped keys present, with no PADDLE_ENVIRONMENT or scoped keys at all, still fails closed -- no legacy-to-sandbox fallback' => function () {
            $values = [
                'PADDLE_WEBHOOK_SECRET' => 'LEGACY-value-must-never-be-used',
                'PADDLE_FULL_TAMAMIZU_PRICE_ID' => 'pri_LEGACY_must_never_be_used',
                'PADDLE_FULL_TAMAMIZU_PRODUCT_ID' => 'pro_LEGACY_must_never_be_used',
            ];
            $threw = false;
            try {
                PaddleEnvironmentConfig::resolve(Config::fromArray($values));
            } catch (\RuntimeException) {
                $threw = true;
            }
            assertTrue($threw, 'a config carrying ONLY the old unscoped keys (e.g. before step 2 of the rollout migration has run) must fail closed, never silently treat the old keys as an implicit Sandbox environment');
        },
    ];
}
