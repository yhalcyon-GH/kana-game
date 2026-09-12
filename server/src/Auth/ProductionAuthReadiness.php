<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use KanaGame\Paddle\Config;

/**
 * Operator-facing (never end-user-facing) config readiness check for
 * Production Web cookie auth — see docs/adr/0001-cross-site-auth-
 * transport.md. Exists so a deployment that turned on
 * WEB_SESSION_COOKIE_ENABLED without also configuring a real Resend
 * mailer can be detected MECHANICALLY (by a test, or a future CLI/
 * ops preflight script — see this class's own doc comment on why no
 * new public HTTP endpoint was added for this) rather than silently
 * shipping a "production" deployment where no user can ever actually
 * receive a Magic Link.
 *
 * Deliberately does NOT change request-link.php's own behavior or
 * response shape: that endpoint's generic, enumeration-safe 200
 * {"status":"ok"} contract is completely independent of this class
 * and must stay that way (an operator-facing readiness signal and an
 * end-user-facing HTTP response are two different audiences with two
 * different safe-disclosure rules).
 *
 * Never exposes RESEND_API_KEY, MAGIC_LINK_FROM_EMAIL, or
 * MAGIC_LINK_FROM_NAME's actual values — only booleans derived from
 * whether they are present.
 */
final class ProductionAuthReadiness
{
    private function __construct(
        public readonly bool $webCookieAuthActive,
        public readonly bool $productionMagicLinkMailerConfigured,
    ) {
    }

    public static function fromConfig(Config $config): self
    {
        // "Production Web cookie auth is actually in effect" requires
        // BOTH the cookie flag on AND the dev harness off -- matching
        // request-link.php's own mailer-priority order (DEV_HARNESS_ENABLED
        // always wins there), so this readiness check reflects the same
        // real-world precedence rather than a simpler-but-wrong reading
        // of WEB_SESSION_COOKIE_ENABLED alone (a dev/Sandbox deployment
        // can harmlessly have both flags set during testing).
        $webCookieAuthActive = $config->get('WEB_SESSION_COOKIE_ENABLED') === 'true'
            && $config->get('DEV_HARNESS_ENABLED') !== 'true';

        $mailerConfigured = $config->get('RESEND_API_KEY') !== null
            && $config->get('MAGIC_LINK_FROM_EMAIL') !== null
            && $config->get('MAGIC_LINK_FROM_NAME') !== null;

        return new self($webCookieAuthActive, $mailerConfigured);
    }

    /**
     * True when Production Web cookie auth is active but this
     * deployment cannot actually send a production Magic Link email --
     * a misconfiguration an operator should fix before treating this
     * deployment as production-ready. False whenever cookie auth isn't
     * active at all (a dev/Sandbox deployment with no mailer configured
     * is completely normal, not a misconfiguration).
     */
    public function isMisconfigured(): bool
    {
        return $this->webCookieAuthActive && !$this->productionMagicLinkMailerConfigured;
    }
}
