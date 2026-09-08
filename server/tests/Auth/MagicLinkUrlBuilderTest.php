<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\MagicLinkUrlBuilder;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkUrlBuilder.php';

/**
 * @return array<string, callable(): void>
 */
function magicLinkUrlBuilderTests(): array
{
    return [
        'build() produces a URL containing the fragment verify route with the token' => function () {
            $builder = new MagicLinkUrlBuilder('https://yhalcyon-gh.github.io/kana-game/');
            $url = $builder->build('raw-token-value');

            assertTrue(str_contains($url, '#/verify?token=raw-token-value'), "expected fragment route with token, got: {$url}");
        },

        'build() places the raw token strictly AFTER the fragment delimiter' => function () {
            $builder = new MagicLinkUrlBuilder('https://yhalcyon-gh.github.io/kana-game/');
            $url = $builder->build('secret-abc-123');

            $fragmentPosition = strpos($url, '#');
            $tokenPosition = strpos($url, 'secret-abc-123');

            assertTrue($fragmentPosition !== false, 'the URL must contain a fragment delimiter');
            assertTrue($tokenPosition !== false, 'the URL must contain the token');
            assertTrue($tokenPosition > $fragmentPosition, 'the raw token must appear strictly after the # delimiter');
        },

        'build() never places the raw token in the server-visible portion of the URL (before #)' => function () {
            $builder = new MagicLinkUrlBuilder('https://yhalcyon-gh.github.io/kana-game/');
            $url = $builder->build('never-server-visible-token');

            $serverVisiblePortion = strtok($url, '#');
            assertFalse(
                str_contains($serverVisiblePortion, 'never-server-visible-token'),
                'the raw token must never appear in the portion of the URL a browser would send to a server',
            );
        },

        'build() URL-encodes the token' => function () {
            $builder = new MagicLinkUrlBuilder('https://yhalcyon-gh.github.io/kana-game/');
            $url = $builder->build('token/with+special=chars');

            assertTrue(str_contains($url, urlencode('token/with+special=chars')), 'the token must be urlencoded in the query portion after the fragment');
        },

        'build() normalizes a base URL missing a trailing slash' => function () {
            $builder = new MagicLinkUrlBuilder('https://yhalcyon-gh.github.io/kana-game');
            $url = $builder->build('tok');

            assertTrue(str_contains($url, '/kana-game/#/verify?token=tok'), "expected a single slash before the fragment, got: {$url}");
        },

        'build() does not duplicate a trailing slash already present in the base URL' => function () {
            $builder = new MagicLinkUrlBuilder('https://yhalcyon-gh.github.io/kana-game/');
            $url = $builder->build('tok');

            assertFalse(str_contains($url, '//#'), "must not produce a doubled slash before the fragment, got: {$url}");
        },
    ];
}
