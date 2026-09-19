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
 * Never exposes RESEND_API_KEY, MAGIC_LINK_FROM_EMAIL,
 * MAGIC_LINK_FROM_NAME, or LOGIN_CODE_PEPPER's actual values — only
 * booleans derived from whether they are present.
 *
 * Also covers Email OTP sign-in readiness (EMAIL_CODE_AUTH_ENABLED /
 * LOGIN_CODE_PEPPER) for the same reason: the public capability probe
 * (server/auth/capabilities.php) can correctly report
 * {"email_code_auth":false} either because the feature is
 * intentionally off, or because it is on but misconfigured, and an
 * operator/AI session reading only that probe's response cannot tell
 * those two states apart. Exposing safe booleans here lets a fixed
 * read-only preflight distinguish "OTP intentionally/configurationally
 * disabled" from "the frontend is stale" without ever printing the
 * pepper value itself.
 */
final class ProductionAuthReadiness
{
    private function __construct(
        public readonly bool $webCookieAuthActive,
        public readonly bool $productionMagicLinkMailerConfigured,
        public readonly bool $emailCodeAuthEnabled,
        public readonly bool $loginCodePepperConfigured,
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

        // Matches capabilities.php's own exact-string convention: only
        // the literal 'true' counts as enabled.
        $emailCodeAuthEnabled = $config->get('EMAIL_CODE_AUTH_ENABLED') === 'true';

        $loginCodePepper = $config->get('LOGIN_CODE_PEPPER');
        $loginCodePepperConfigured = $loginCodePepper !== null && $loginCodePepper !== '';

        return new self($webCookieAuthActive, $mailerConfigured, $emailCodeAuthEnabled, $loginCodePepperConfigured);
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

    /**
     * True only when Email OTP sign-in can actually work end-to-end:
     * the feature flag is on AND a login-code pepper is configured.
     * False when the flag is off (intentionally/configurationally
     * disabled -- not a misconfiguration) or when the flag is on but
     * the pepper is missing (a misconfiguration the CLI preflight
     * treats as a hard failure).
     */
    public function emailCodeAuthReady(): bool
    {
        return $this->emailCodeAuthEnabled && $this->loginCodePepperConfigured;
    }
}
