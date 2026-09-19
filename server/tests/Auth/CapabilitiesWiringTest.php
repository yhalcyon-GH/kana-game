<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

function loadCapabilitiesSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../auth/capabilities.php');
    assertTrue($source !== false, 'could not read auth/capabilities.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function capabilitiesWiringTests(): array
{
    return [
        'capabilities.php only GET is accepted' => function () {
            $source = loadCapabilitiesSource();
            assertTrue(str_contains($source, "!== 'GET'"), 'must check REQUEST_METHOD !== GET');
            assertTrue(str_contains($source, '405'), 'must return 405 for non-GET requests');
        },
        'capabilities.php reflects EMAIL_CODE_AUTH_ENABLED as a boolean, defaulting closed' => function () {
            $source = loadCapabilitiesSource();
            assertTrue(str_contains($source, "EMAIL_CODE_AUTH_ENABLED') === 'true'"), 'must compare against the exact string "true", same convention as every other feature flag in this codebase');
            assertTrue(str_contains($source, 'email_code_auth'), 'must include email_code_auth key in response');
        },
        'capabilities.php never touches the database (no Db::connect())' => function () {
            $source = loadCapabilitiesSource();
            assertFalse(str_contains($source, 'Db::connect'), 'a public capability probe must have zero DB dependency, so a DB outage never masks the capability flag');
        },
    ];
}
