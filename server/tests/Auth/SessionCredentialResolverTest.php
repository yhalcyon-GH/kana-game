<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\SessionCredentialResolver;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/SessionCredentialResolver.php';

/**
 * @return array<string, callable(): void>
 */
function sessionCredentialResolverTests(): array
{
    return [
        'extractBearerToken() reads the token from a well-formed header' => function () {
            assertSame('abc123', SessionCredentialResolver::extractBearerToken('Bearer abc123'), 'should strip the "Bearer " prefix');
        },

        'extractBearerToken() returns null for a missing header' => function () {
            assertSame(null, SessionCredentialResolver::extractBearerToken(null), 'null header must resolve to null');
        },

        'extractBearerToken() returns null for a header without the Bearer scheme' => function () {
            assertSame(null, SessionCredentialResolver::extractBearerToken('Basic abc123'), 'a non-Bearer scheme must resolve to null');
        },

        'extractBearerToken() returns null for "Bearer " with an empty token' => function () {
            assertSame(null, SessionCredentialResolver::extractBearerToken('Bearer '), 'an empty token after the scheme must resolve to null, not empty string');
        },

        'resolve() returns null when neither credential is present' => function () {
            assertSame(null, SessionCredentialResolver::resolve(null, null), 'no credential at all must resolve to null');
        },

        'resolve() returns the Bearer token when only Bearer is present' => function () {
            assertSame('bearer-tok', SessionCredentialResolver::resolve('bearer-tok', null), 'Bearer-only must resolve to the Bearer token');
        },

        'resolve() returns the cookie token when only the cookie is present' => function () {
            assertSame('cookie-tok', SessionCredentialResolver::resolve(null, 'cookie-tok'), 'cookie-only must resolve to the cookie token');
        },

        'resolve() returns the shared token when both credentials agree' => function () {
            assertSame('same-tok', SessionCredentialResolver::resolve('same-tok', 'same-tok'), 'matching Bearer and cookie must resolve to that token');
        },

        'resolve() rejects (returns null) when Bearer and cookie disagree' => function () {
            assertSame(
                null,
                SessionCredentialResolver::resolve('bearer-tok', 'different-cookie-tok'),
                'a Bearer/cookie mismatch must never be resolved to either value -- this is the ambiguous-credential reject case',
            );
        },
    ];
}
