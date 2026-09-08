<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

/**
 * Dependency-free UUIDv4 generator (RFC 4122) — this repo has no
 * Composer/PHP dependency manager, so this uses only random_bytes(),
 * the same primitive already used for magic-link/session/purchase-ref
 * token generation elsewhere in this codebase.
 */
final class Uuid
{
    public static function v4(): string
    {
        $bytes = random_bytes(16);

        // Set version to 0100 (UUIDv4) — byte 6, high nibble.
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        // Set variant to 10xx (RFC 4122) — byte 8, high two bits.
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

        $hex = bin2hex($bytes);

        return sprintf(
            '%s-%s-%s-%s-%s',
            substr($hex, 0, 8),
            substr($hex, 8, 4),
            substr($hex, 12, 4),
            substr($hex, 16, 4),
            substr($hex, 20, 12),
        );
    }

    private function __construct()
    {
    }
}
