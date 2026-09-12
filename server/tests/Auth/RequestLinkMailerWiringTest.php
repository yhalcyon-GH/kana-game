<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

/**
 * Source-inspection regression tests for request-link.php's mailer
 * selection wiring (Phase 3B ResendMailer integration). Same rationale
 * as WebSessionCookieWiringTest.php / LastMagicLinkEntrypointTest.php:
 * this is a plain top-level script with real config/DB dependencies
 * this repo's dependency-free CLI test runner cannot exercise over a
 * real HTTP+DB round trip, so the WIRING is asserted via source text.
 * ResendMailer's own send/failure logic is separately unit-tested in
 * ResendMailerTest.php.
 */
function loadRequestLinkSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../auth/request-link.php');
    assertTrue($source !== false, 'could not read auth/request-link.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function requestLinkMailerWiringTests(): array
{
    return [
        'request-link.php requires and imports ResendMailer' => function () {
            $source = loadRequestLinkSource();
            assertTrue(
                str_contains($source, "require __DIR__ . '/../src/Auth/ResendMailer.php';"),
                'must require ResendMailer.php',
            );
            assertTrue(
                str_contains($source, 'use KanaGame\\Paddle\\Auth\\ResendMailer;'),
                'must import the ResendMailer class',
            );
        },

        'the DEV_HARNESS_ENABLED check takes priority over Resend' => function () {
            $source = loadRequestLinkSource();
            $devHarnessPos = strpos($source, "\$config->get('DEV_HARNESS_ENABLED') === 'true'");
            $resendPos = strpos($source, 'new ResendMailer(');
            assertTrue($devHarnessPos !== false && $resendPos !== false, 'expected both checks to be present');
            assertTrue(
                $devHarnessPos < $resendPos,
                'the DEV_HARNESS_ENABLED branch must be checked (and therefore win) before ResendMailer is ever considered',
            );
        },

        'ResendMailer is constructed only when all three of RESEND_API_KEY, MAGIC_LINK_FROM_EMAIL, and MAGIC_LINK_FROM_NAME are non-null' => function () {
            $source = loadRequestLinkSource();
            assertTrue(str_contains($source, "\$config->get('RESEND_API_KEY')"), 'must read RESEND_API_KEY');
            assertTrue(str_contains($source, "\$config->get('MAGIC_LINK_FROM_EMAIL')"), 'must read MAGIC_LINK_FROM_EMAIL');
            assertTrue(str_contains($source, "\$config->get('MAGIC_LINK_FROM_NAME')"), 'must read MAGIC_LINK_FROM_NAME');

            assertTrue(
                (bool) preg_match(
                    '/\$resendApiKey !== null && \$resendFromEmail !== null && \$resendFromName !== null/',
                    $source,
                ),
                'all three Resend config values must be checked for non-null before constructing ResendMailer -- an incomplete config must never construct a half-configured mailer',
            );
        },

        'an incomplete/absent Resend config falls through to the existing safe no-op mailer' => function () {
            $source = loadRequestLinkSource();
            $resendConditionPos = strpos($source, '$resendApiKey !== null');
            $elsePos = strpos($source, '} else {', $resendConditionPos === false ? 0 : $resendConditionPos);
            $noopAssignPos = strpos($source, '$mailer = $noopMailer;');
            assertTrue($resendConditionPos !== false && $elsePos !== false && $noopAssignPos !== false, 'expected an else branch assigning the no-op mailer');
            assertTrue($elsePos < $noopAssignPos, 'the no-op mailer must be the fallback (else) branch, never a branch that could also match a real config');
        },
    ];
}
