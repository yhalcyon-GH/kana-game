<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Deliberately minimal: lowercase + trim only. No Gmail dot/plus-alias
 * folding — merging identities this way requires its own reviewed
 * migration, not an automatic normalization change.
 */
final class EmailNormalizer
{
    public static function normalize(string $rawEmail): string
    {
        return strtolower(trim($rawEmail));
    }

    private function __construct()
    {
    }
}
