<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

/**
 * Phase H2 — resolves the ONE Paddle environment (Sandbox or Live) this
 * deployment is configured to serve, and the config triplet (webhook
 * secret, price id, product id) that belongs to THAT environment only.
 *
 * This is a config-consistency guard, not a runtime environment
 * switch: a single webhook deployment has exactly one Paddle
 * notification destination, so it always serves exactly one
 * environment at a time. What this class prevents is the OTHER
 * failure mode -- a config file where, say, a Live webhook secret
 * ends up paired with a leftover Sandbox price id because both lived
 * as flat, unscoped keys with no structural link between them.
 *
 * Every value is read from an environment-PREFIXED key
 * (PADDLE_SANDBOX_* / PADDLE_LIVE_*) chosen by PADDLE_ENVIRONMENT.
 * This class NEVER reads the other environment's keys at all -- not
 * "reads them and ignores them," genuinely never looks them up -- so
 * cross-environment mixing is structurally impossible here, not just
 * checked after the fact. There is no fallback of any kind: an unset
 * or unrecognized PADDLE_ENVIRONMENT, or any missing key for the
 * SELECTED environment, throws rather than guessing or defaulting to
 * Sandbox.
 *
 * Superseded the old unscoped PADDLE_WEBHOOK_SECRET /
 * PADDLE_FULL_TAMAMIZU_PRICE_ID / PADDLE_FULL_TAMAMIZU_PRODUCT_ID keys
 * (pre-H2, single-environment-only). Those are deliberately NOT read
 * by this class as an implicit Sandbox fallback -- see
 * docs/paddle-environment-separation.md for the exact Production
 * config.php migration this requires before H2 is next deployed.
 */
final class PaddleEnvironmentConfig
{
    private const SANDBOX = 'sandbox';
    private const LIVE = 'live';
    private const ALLOWED_ENVIRONMENTS = [self::SANDBOX, self::LIVE];

    private function __construct(
        public readonly string $environment,
        public readonly string $webhookSecret,
        public readonly string $priceId,
        public readonly string $productId,
    ) {
    }

    public static function resolve(Config $config): self
    {
        $environment = $config->require('PADDLE_ENVIRONMENT');
        if (!in_array($environment, self::ALLOWED_ENVIRONMENTS, true)) {
            throw new \RuntimeException(
                "Invalid PADDLE_ENVIRONMENT: '{$environment}'. Must be exactly 'sandbox' or 'live' -- no other value, and no default, is accepted.",
            );
        }

        $prefix = $environment === self::LIVE ? 'PADDLE_LIVE_' : 'PADDLE_SANDBOX_';

        return new self(
            $environment,
            $config->require("{$prefix}WEBHOOK_SECRET"),
            $config->require("{$prefix}FULL_TAMAMIZU_PRICE_ID"),
            $config->require("{$prefix}FULL_TAMAMIZU_PRODUCT_ID"),
        );
    }
}
