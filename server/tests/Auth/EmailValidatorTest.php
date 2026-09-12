<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\EmailValidator;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/EmailValidator.php';

/**
 * @return array<string, callable(): void>
 */
function emailValidatorTests(): array
{
    return [
        'isValid() accepts a normal email address' => function () {
            assertTrue(EmailValidator::isValid('user@example.com'), 'a normal email should be valid');
        },

        'isValid() rejects a string with no @ sign' => function () {
            assertFalse(EmailValidator::isValid('not-an-email'), 'missing @ should be invalid');
        },

        'isValid() rejects an empty string' => function () {
            assertFalse(EmailValidator::isValid(''), 'empty string should be invalid');
        },

        'isValid() rejects a value longer than the email_normalized column (255 bytes)' => function () {
            $tooLong = str_repeat('a', 250) . '@example.com';
            assertFalse(EmailValidator::isValid($tooLong), 'a value over 255 bytes should be invalid');
        },

        'isValid() accepts the longest syntactically valid email PHP\'s own filter allows (254 bytes, under the 255-byte column limit)' => function () {
            // PHP's FILTER_VALIDATE_EMAIL enforces RFC 5321's 64-char
            // local-part limit and an overall ~254-byte practical cap,
            // so this class's own 255-byte column-length check can
            // never actually reject anything FILTER_VALIDATE_EMAIL
            // itself accepts -- this test proves the two checks compose
            // without the column-length check spuriously rejecting a
            // value the syntax filter already allows.
            $label = str_repeat('a', 60);
            $domain = implode('.', array_fill(0, 4, $label)) . '.com';
            $localPart = str_repeat('u', 6);
            $longestValidEmail = $localPart . '@' . $domain;
            assertSame(254, strlen($longestValidEmail), 'test setup sanity check');
            assertTrue(EmailValidator::isValid($longestValidEmail), 'a syntactically valid 254-byte email should be valid');
        },
    ];
}
