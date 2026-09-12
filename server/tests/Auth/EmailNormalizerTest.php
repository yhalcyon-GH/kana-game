<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\EmailNormalizer;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/EmailNormalizer.php';

/**
 * @return array<string, callable(): void>
 */
function emailNormalizerTests(): array
{
    return [
        'normalize() lowercases the email' => function () {
            assertSame('user@example.com', EmailNormalizer::normalize('User@Example.com'), 'should be lowercased');
        },

        'normalize() trims leading/trailing whitespace' => function () {
            assertSame('user@example.com', EmailNormalizer::normalize('  user@example.com  '), 'should be trimmed');
        },

        'normalize() does NOT fold Gmail dot aliases' => function () {
            assertSame('a.b@example.com', EmailNormalizer::normalize('a.b@example.com'), 'dots must be preserved -- no alias folding per the design spec');
        },

        'normalize() does NOT fold Gmail plus aliases' => function () {
            assertSame('user+tag@example.com', EmailNormalizer::normalize('user+tag@example.com'), 'plus-tags must be preserved -- no alias folding per the design spec');
        },
    ];
}
