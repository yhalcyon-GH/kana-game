<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Sends a Magic Link email. NO production implementation exists in
 * this PR — the only implementation anywhere in this codebase is
 * FakeMailer, under server/tests/Auth/ (test-only, not part of the
 * deployable server/src/ tree — see that file's own doc comment for
 * why). A real SMTP/XServer-mail transport is future work requiring a
 * real credential (human checkpoint per the task brief, Section 21).
 * No production email is ever sent by this PR's code.
 */
interface Mailer
{
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void;
}
