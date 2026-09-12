<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * The result of SessionCredentialResolver::resolve() — deliberately NOT
 * a bare `?string`, because that shape cannot distinguish "no
 * credential was supplied at all" from "two DIFFERENT credentials were
 * supplied" (Bearer + cookie disagreeing). Those two cases must be
 * handled differently by at least one caller (auth/logout.php's
 * idempotent-no-op-on-missing-credential contract must NOT also apply
 * to an ambiguous/disagreeing pair — see that file's own doc comment)
 * even though every OTHER caller in this codebase currently treats both
 * as "not authenticated" (a 401), which remains equally safe for those.
 *
 * Kept intentionally tiny: three states, two of which never carry a
 * token.
 */
final class SessionCredentialResolution
{
    private function __construct(
        public readonly ?string $token,
        public readonly bool $ambiguous,
    ) {
    }

    /** No credential was supplied at all (neither Bearer nor cookie). */
    public static function none(): self
    {
        return new self(null, false);
    }

    /** Exactly one credential was supplied, or both agreed. */
    public static function resolved(string $token): self
    {
        return new self($token, false);
    }

    /**
     * Bearer and cookie were BOTH supplied and DISAGREED. Never carries
     * a token — callers must never guess which of the two was "real."
     */
    public static function ambiguous(): self
    {
        return new self(null, true);
    }
}
