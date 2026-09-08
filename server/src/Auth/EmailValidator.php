<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Quality gate, not a security gate — rejects an email that could
 * never be deliverable or that would not fit the users.email_normalized
 * VARCHAR(255) column, before it reaches the rate limiter or the mailer.
 * An invalid email still gets the same generic 200 response from
 * request-link.php (see MagicLinkAuthService::requestLink()) — this
 * class only decides whether the request-link flow proceeds internally,
 * never what the caller sees.
 */
final class EmailValidator
{
    private const MAX_LENGTH = 255;

    public static function isValid(string $normalizedEmail): bool
    {
        if ($normalizedEmail === '' || strlen($normalizedEmail) > self::MAX_LENGTH) {
            return false;
        }

        return filter_var($normalizedEmail, FILTER_VALIDATE_EMAIL) !== false;
    }

    private function __construct()
    {
    }
}
