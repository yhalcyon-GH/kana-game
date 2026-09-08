<?php

declare(strict_types=1);

namespace KanaGame\Paddle\DevOnly;

use KanaGame\Paddle\Auth\Mailer;

require_once __DIR__ . '/../Auth/Mailer.php';

/**
 * DEV-ONLY. Implements Mailer by storing the magic-link URL in
 * DevHarnessMagicLinkStore instead of sending real email — enabled
 * ONLY when the constructor's $enabled flag (sourced from
 * DEV_HARNESS_ENABLED, which defaults false/absent) is true. When
 * disabled, sendMagicLink() is a complete no-op — no row is written,
 * matching the same "safe by default" shape as the inline no-op Mailer
 * used elsewhere in this codebase.
 *
 * No production entrypoint ever constructs this class. request-link.php
 * only substitutes DevHarnessMailer for its usual inline no-op Mailer
 * when DEV_HARNESS_ENABLED is explicitly true — see that file's own
 * comment.
 *
 * The raw magic-link URL (including its raw token) is never logged by
 * this class — see DevHarnessMagicLinkStore's own doc comment for why
 * storing it in this one dev-only table is an intentional, scoped
 * exception to this codebase's normal raw-token handling.
 */
final class DevHarnessMailer implements Mailer
{
    public function __construct(
        private readonly DevHarnessMagicLinkStore $store,
        private readonly bool $enabled,
        private readonly int $linkExpiryMinutes,
    ) {
    }

    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
        if (!$this->enabled) {
            return;
        }

        $this->store->store($emailNormalized, $magicLinkUrl, new \DateTimeImmutable("+{$this->linkExpiryMinutes} minutes"));
    }
}
