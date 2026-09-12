<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

/**
 * Loads server-side configuration from a local, gitignored PHP file
 * (`server/config.php`, copied from `server/config.example.php`) or from
 * real environment variables — never from anything checked into git.
 *
 * See server/config.example.php for the full list of expected values and
 * `docs/paddle-webhook-poc.md` for how to populate this file on Xserver.
 * This file intentionally contains NO real secrets/IDs — only the loading
 * mechanism and validation.
 */
final class Config
{
    /** @var array<string, string> */
    private array $values;

    /**
     * @param array<string, string> $values
     */
    private function __construct(array $values)
    {
        $this->values = $values;
    }

    public static function load(): self
    {
        // Prefer real environment variables (e.g. set via Xserver's own
        // panel or an .htaccess/php-fpm pool config) when present, falling
        // back to a local, gitignored server/config.php that returns an
        // associative array. Neither path is ever committed with real
        // values — see server/config.example.php.
        $configFile = __DIR__ . '/../config.php';
        $fileValues = [];
        if (is_file($configFile)) {
            /** @var mixed $loaded */
            $loaded = require $configFile;
            if (is_array($loaded)) {
                $fileValues = $loaded;
            }
        }

        $keys = [
            'DB_HOST',
            'DB_NAME',
            'DB_USER',
            'DB_PASSWORD',
            'PADDLE_WEBHOOK_SECRET',
            'PADDLE_FULL_TAMAMIZU_PRICE_ID',
            'PADDLE_FULL_TAMAMIZU_PRODUCT_ID',
            'ALLOWED_ORIGINS',
            'RATE_LIMIT_PEPPER',
            'RATE_LIMIT_EMAIL_PER_HOUR',
            'RATE_LIMIT_IP_PER_HOUR',
            'MAGIC_LINK_TOKEN_EXPIRY_MINUTES',
            'SESSION_EXPIRY_HOURS',
            'MAGIC_LINK_FRONTEND_BASE_URL',
            'DEV_HARNESS_ENABLED',
            'WEB_SESSION_COOKIE_ENABLED',
            'WEB_SESSION_COOKIE_NAME',
            'RESEND_API_KEY',
            'MAGIC_LINK_FROM_EMAIL',
            'MAGIC_LINK_FROM_NAME',
        ];

        $values = [];
        foreach ($keys as $key) {
            $fromEnv = getenv($key);
            if ($fromEnv !== false && $fromEnv !== '') {
                $values[$key] = $fromEnv;
                continue;
            }
            if (isset($fileValues[$key]) && $fileValues[$key] !== '') {
                $values[$key] = (string) $fileValues[$key];
            }
        }

        return new self($values);
    }

    /**
     * Only for tests — builds a Config directly from an in-memory array,
     * bypassing env/file loading entirely.
     *
     * @param array<string, string> $values
     */
    public static function fromArray(array $values): self
    {
        return new self($values);
    }

    public function get(string $key): ?string
    {
        return $this->values[$key] ?? null;
    }

    public function require(string $key): string
    {
        $value = $this->get($key);
        if ($value === null || $value === '') {
            throw new \RuntimeException("Missing required server configuration: {$key}");
        }
        return $value;
    }

    /**
     * @return list<string>
     */
    public function allowedOrigins(): array
    {
        $raw = $this->get('ALLOWED_ORIGINS') ?? '';
        $origins = array_map('trim', explode(',', $raw));
        return array_values(array_filter($origins, static fn (string $origin): bool => $origin !== ''));
    }

    public function intWithDefault(string $key, int $default): int
    {
        $value = $this->get($key);
        if ($value === null || $value === '' || !ctype_digit($value)) {
            return $default;
        }
        return (int) $value;
    }
}
