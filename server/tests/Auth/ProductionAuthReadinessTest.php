<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\ProductionAuthReadiness;
use KanaGame\Paddle\Config;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Config.php';
require_once __DIR__ . '/../../src/Auth/ProductionAuthReadiness.php';

/**
 * @param array<string, string> $values
 */
function readinessFromValues(array $values): ProductionAuthReadiness
{
    return ProductionAuthReadiness::fromConfig(Config::fromArray($values));
}

/**
 * @return array<string, callable(): void>
 */
function productionAuthReadinessTests(): array
{
    return [
        // A. DEV_HARNESS_ENABLED=true always wins, even with full Resend
        // config present -- matches request-link.php's own mailer
        // priority order exactly.
        'DEV_HARNESS_ENABLED=true means Web cookie auth is not considered active, even with full Resend config present' => function () {
            $readiness = readinessFromValues([
                'WEB_SESSION_COOKIE_ENABLED' => 'true',
                'DEV_HARNESS_ENABLED' => 'true',
                'RESEND_API_KEY' => 'key',
                'MAGIC_LINK_FROM_EMAIL' => 'noreply@example.com',
                'MAGIC_LINK_FROM_NAME' => 'Tamamizu',
            ]);
            assertFalse($readiness->webCookieAuthActive, 'the dev harness must take priority, same as request-link.php\'s own mailer selection');
            assertFalse($readiness->isMisconfigured(), 'a dev-harness deployment is never "misconfigured production" regardless of Resend config');
        },

        // B. cookie mode ON + all three Resend values present -> ready.
        'cookie mode on with all three Resend values present is production-ready' => function () {
            $readiness = readinessFromValues([
                'WEB_SESSION_COOKIE_ENABLED' => 'true',
                'RESEND_API_KEY' => 'key',
                'MAGIC_LINK_FROM_EMAIL' => 'noreply@example.com',
                'MAGIC_LINK_FROM_NAME' => 'Tamamizu',
            ]);
            assertTrue($readiness->webCookieAuthActive, 'cookie mode with no dev harness must count as active');
            assertTrue($readiness->productionMagicLinkMailerConfigured, 'all three Resend values present must count as configured');
            assertFalse($readiness->isMisconfigured(), 'fully configured production Web auth must not be flagged as misconfigured');
        },

        // C. cookie mode ON + API key only -> NOT ready.
        'cookie mode on with only RESEND_API_KEY set is NOT production-ready' => function () {
            $readiness = readinessFromValues([
                'WEB_SESSION_COOKIE_ENABLED' => 'true',
                'RESEND_API_KEY' => 'key',
            ]);
            assertFalse($readiness->productionMagicLinkMailerConfigured, 'an API key alone must not count as configured');
            assertTrue($readiness->isMisconfigured(), 'cookie auth active with an incomplete mailer config must be flagged misconfigured');
        },

        // D. cookie mode ON + missing from-email -> NOT ready.
        'cookie mode on with a missing MAGIC_LINK_FROM_EMAIL is NOT production-ready' => function () {
            $readiness = readinessFromValues([
                'WEB_SESSION_COOKIE_ENABLED' => 'true',
                'RESEND_API_KEY' => 'key',
                'MAGIC_LINK_FROM_NAME' => 'Tamamizu',
            ]);
            assertFalse($readiness->productionMagicLinkMailerConfigured, 'a missing from-email must not count as configured');
            assertTrue($readiness->isMisconfigured(), 'a missing from-email while cookie auth is active must be flagged misconfigured');
        },

        // E. cookie mode ON + missing from-name -> NOT ready.
        'cookie mode on with a missing MAGIC_LINK_FROM_NAME is NOT production-ready' => function () {
            $readiness = readinessFromValues([
                'WEB_SESSION_COOKIE_ENABLED' => 'true',
                'RESEND_API_KEY' => 'key',
                'MAGIC_LINK_FROM_EMAIL' => 'noreply@example.com',
            ]);
            assertFalse($readiness->productionMagicLinkMailerConfigured, 'a missing from-name must not count as configured');
            assertTrue($readiness->isMisconfigured(), 'a missing from-name while cookie auth is active must be flagged misconfigured');
        },

        // F. cookie mode OFF + no Resend config -> unaffected, matches
        // existing dev/Sandbox compatibility (never flagged).
        'cookie mode off with no Resend config at all is not flagged as misconfigured (the existing dev/Sandbox default)' => function () {
            $readiness = readinessFromValues([]);
            assertFalse($readiness->webCookieAuthActive, 'cookie mode is off by default');
            assertFalse($readiness->isMisconfigured(), 'a plain dev/Sandbox deployment (cookie mode off, no mailer) must never be flagged -- this is the normal, unaffected default');
        },

        'cookie mode off with a partial Resend config is still not flagged (cookie auth was never active to begin with)' => function () {
            $readiness = readinessFromValues(['RESEND_API_KEY' => 'key']);
            assertFalse($readiness->webCookieAuthActive, 'cookie mode is off');
            assertFalse($readiness->isMisconfigured(), 'cookie auth was never active, so an incomplete mailer config is irrelevant');
        },

        // G. readiness never exposes secret/raw values -- only booleans.
        'ProductionAuthReadiness exposes only booleans, never the underlying secret/config values' => function () {
            $readiness = readinessFromValues([
                'WEB_SESSION_COOKIE_ENABLED' => 'true',
                'RESEND_API_KEY' => 'super-secret-resend-key',
                'MAGIC_LINK_FROM_EMAIL' => 'noreply@example.com',
                'MAGIC_LINK_FROM_NAME' => 'Tamamizu',
            ]);

            $reflection = new \ReflectionClass($readiness);
            foreach ($reflection->getProperties() as $property) {
                $value = $property->getValue($readiness);
                assertTrue(is_bool($value), "property {$property->getName()} must be a bool, never a raw config/secret value");
            }
        },
    ];
}
