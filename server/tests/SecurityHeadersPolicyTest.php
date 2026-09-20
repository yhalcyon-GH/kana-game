<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/TestCase.php';

/**
 * @return array<string, callable(): void>
 */
function securityHeadersPolicyTests(): array
{
    return [
        'root API .htaccess defines the reviewed baseline security headers' => function () {
            $source = file_get_contents(__DIR__ . '/../.htaccess');
            assertTrue($source !== false, 'server/.htaccess must exist');

            $required = [
                'Header always set Strict-Transport-Security "max-age=31536000"',
                'Header always set X-Content-Type-Options "nosniff"',
                'Header always set X-Frame-Options "DENY"',
                'Header always set Referrer-Policy "no-referrer"',
                'Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"',
                'Header always set Content-Security-Policy "default-src \'none\'; frame-ancestors \'none\'; base-uri \'none\'; form-action \'none\'"',
            ];

            foreach ($required as $header) {
                assertTrue(str_contains($source, $header), "missing reviewed security header policy: {$header}");
            }
        },
    ];
}
