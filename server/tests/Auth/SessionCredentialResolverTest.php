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

        'resolve() returns a none() result (token=null, ambiguous=false) when neither credential is present' => function () {
            $result = SessionCredentialResolver::resolve(null, null);
            assertSame(null, $result->token, 'no credential at all must resolve to a null token');
            assertFalse($result->ambiguous, 'a genuinely missing credential must never be reported as ambiguous');
        },

        'resolve() returns the Bearer token when only Bearer is present' => function () {
            $result = SessionCredentialResolver::resolve('bearer-tok', null);
            assertSame('bearer-tok', $result->token, 'Bearer-only must resolve to the Bearer token');
            assertFalse($result->ambiguous, 'a single credential must never be ambiguous');
        },

        'resolve() returns the cookie token when only the cookie is present' => function () {
            $result = SessionCredentialResolver::resolve(null, 'cookie-tok');
            assertSame('cookie-tok', $result->token, 'cookie-only must resolve to the cookie token');
            assertFalse($result->ambiguous, 'a single credential must never be ambiguous');
        },

        'resolve() returns the shared token when both credentials agree' => function () {
            $result = SessionCredentialResolver::resolve('same-tok', 'same-tok');
            assertSame('same-tok', $result->token, 'matching Bearer and cookie must resolve to that token');
            assertFalse($result->ambiguous, 'two AGREEING credentials must never be reported as ambiguous');
        },

        'resolve() reports ambiguous (token=null, ambiguous=true) when Bearer and cookie disagree' => function () {
            $result = SessionCredentialResolver::resolve('bearer-tok', 'different-cookie-tok');
            assertSame(null, $result->token, 'a Bearer/cookie mismatch must never carry either value as a resolved token');
            assertTrue($result->ambiguous, 'a Bearer/cookie mismatch must be reported as ambiguous, distinct from "no credential at all"');
        },

        'resolve()\'s ambiguous result is distinguishable from its none() result -- this is the whole point of the value object' => function () {
            $none = SessionCredentialResolver::resolve(null, null);
            $ambiguous = SessionCredentialResolver::resolve('a', 'b');

            assertSame(null, $none->token, 'none() carries no token');
            assertSame(null, $ambiguous->token, 'ambiguous() also carries no token');
            assertFalse($none->ambiguous, 'none() must not be flagged ambiguous');
            assertTrue($ambiguous->ambiguous, 'ambiguous() must be flagged ambiguous');
        },
    ];
}
