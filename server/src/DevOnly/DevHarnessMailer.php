<?php

declare(strict_types=1);

namespace KanaGame\Paddle\DevOnly;

use KanaGame\Paddle\Auth\Mailer;

require_once __DIR__ . '/../Auth/Mailer.php';

/**
 * DEV-ONLY. Implements Mailer by storing the magic-link URL / login code
 * in DevHarnessMagicLinkStore / DevHarnessLoginCodeStore instead of
 * sending real email — enabled ONLY when the constructor's $enabled flag
 * (sourced from DEV_HARNESS_ENABLED, which defaults false/absent) is
 * true. When disabled, both sendMagicLink() and sendLoginCode() are
 * complete no-ops — no row is written, matching the same "safe by
 * default" shape as the inline no-op Mailer used elsewhere in this
 * codebase.
 *
 * No production entrypoint ever constructs this class. request-link.php
 * and request-code.php only substitute DevHarnessMailer for their usual
 * inline no-op Mailer when DEV_HARNESS_ENABLED is explicitly true — see
 * those files' own comments.
 *
 * The raw magic-link URL / login code is never logged by this class —
 * see DevHarnessMagicLinkStore's and DevHarnessLoginCodeStore's own doc
 * comments for why storing them in these two dev-only tables is an
 * intentional, scoped exception to this codebase's normal raw-value
 * handling.
 *
 * $captureExpiryMinutes is shared by both send*() methods: it's just a
 * dev-only capture-window TTL (how long a developer has to retrieve the
 * link/code via the /account-test harness before it's swept as
 * expired), not a real security boundary, so reusing one value sourced
 * from MAGIC_LINK_TOKEN_EXPIRY_MINUTES for both is intentional rather
 * than a gap.
 */
final class DevHarnessMailer implements Mailer
{
    public function __construct(
        private readonly DevHarnessMagicLinkStore $magicLinkStore,
        private readonly DevHarnessLoginCodeStore $loginCodeStore,
        private readonly bool $enabled,
        private readonly int $captureExpiryMinutes,
    ) {
    }

    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
        if (!$this->enabled) {
            return;
        }

        $this->magicLinkStore->store($emailNormalized, $magicLinkUrl, new \DateTimeImmutable("+{$this->captureExpiryMinutes} minutes"));
    }

    /**
     * Structurally symmetric to sendMagicLink() above: when disabled,
     * a complete no-op (this class is ONLY EVER constructed by
     * request-code.php when DEV_HARNESS_ENABLED === 'true' already, so
     * $enabled here is a secondary defensive flag, same as
     * sendMagicLink()'s -- there is no remaining "misconfigured but
     * harness on" case that needs a warning log, so this has no log
     * line in its enabled path, matching sendMagicLink() exactly).
     */
    public function sendLoginCode(string $emailNormalized, string $code): void
    {
        if (!$this->enabled) {
            return;
        }

        $this->loginCodeStore->store($emailNormalized, $code, new \DateTimeImmutable("+{$this->captureExpiryMinutes} minutes"));
    }
}
