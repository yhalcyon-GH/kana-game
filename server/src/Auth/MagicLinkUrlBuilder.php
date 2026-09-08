<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Builds the Magic Link URL sent to a user. SAFE BY CONSTRUCTION: the
 * "#/verify" fragment route is a literal string in THIS FILE, never
 * read from config — config only ever supplies the origin/path prefix
 * that comes BEFORE the fragment delimiter. This means a config mistake
 * (e.g. an operator omitting "#/verify" from a config value, or a typo
 * that turns "#/verify" into a literal "/verify" query path) CANNOT
 * cause the raw token to end up in the server-visible portion of the
 * URL — the fragment delimiter is not something a config file gets to
 * decide.
 */
final class MagicLinkUrlBuilder
{
    private const FRAGMENT_ROUTE = '#/verify';

    private readonly string $baseUrl;

    public function __construct(string $frontendBaseUrl)
    {
        $this->baseUrl = rtrim($frontendBaseUrl, '/') . '/';
    }

    public function build(string $rawToken): string
    {
        return $this->baseUrl . self::FRAGMENT_ROUTE . '?token=' . urlencode($rawToken);
    }
}
