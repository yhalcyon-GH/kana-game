<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Uuid;

require_once __DIR__ . '/TestCase.php';
require_once __DIR__ . '/../src/Uuid.php';

/**
 * @return array<string, callable(): void>
 */
function uuidTests(): array
{
    return [
        'v4() returns a string matching the UUIDv4 format' => function () {
            $id = Uuid::v4();
            $pattern = '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';
            assertTrue((bool) preg_match($pattern, $id), "expected UUIDv4 format, got: {$id}");
        },

        'v4() returns a different value on each call' => function () {
            $first = Uuid::v4();
            $second = Uuid::v4();
            assertFalse($first === $second, 'two calls should not produce the same UUID');
        },

        'v4() always sets the version nibble to 4' => function () {
            $id = Uuid::v4();
            $versionChar = $id[14];
            assertSame('4', $versionChar, 'the version nibble (13th hex digit) must be "4"');
        },

        'v4() always sets the variant bits per RFC 4122 (8, 9, a, or b)' => function () {
            $id = Uuid::v4();
            $variantChar = $id[19];
            assertTrue(
                in_array($variantChar, ['8', '9', 'a', 'b'], true),
                "expected variant character to be one of 8/9/a/b, got: {$variantChar}",
            );
        },
    ];
}
