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
    ];
}
