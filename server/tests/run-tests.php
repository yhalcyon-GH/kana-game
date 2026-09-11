<?php

declare(strict_types=1);

/**
 * Dependency-free test runner for the Paddle webhook PoC's PHP code.
 * Run with: php server/tests/run-tests.php
 *
 * No PHPUnit/composer install required — this repo has no PHP dependency
 * manager, and this PoC intentionally stays that way (see
 * docs/paddle-webhook-poc.md). Each *Test.php file returns an associative
 * array of "test name" => callable; this runner just calls each one and
 * reports pass/fail.
 */

require_once __DIR__ . '/TestCase.php';

use KanaGame\Paddle\Tests\TestFailure;

$testFiles = [
    __DIR__ . '/ConfigTest.php' => 'KanaGame\\Paddle\\Tests\\configTests',
    __DIR__ . '/PaddleSignatureTest.php' => 'KanaGame\\Paddle\\Tests\\paddleSignatureTests',
    __DIR__ . '/ProductMatcherTest.php' => 'KanaGame\\Paddle\\Tests\\productMatcherTests',
    __DIR__ . '/WebhookHandlerTest.php' => 'KanaGame\\Paddle\\Tests\\webhookHandlerTests',
    __DIR__ . '/EntitlementRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\entitlementRepositoryTests',
    __DIR__ . '/CorsTest.php' => 'KanaGame\\Paddle\\Tests\\corsTests',
    __DIR__ . '/UuidTest.php' => 'KanaGame\\Paddle\\Tests\\uuidTests',
    __DIR__ . '/Auth/UserRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\userRepositoryTests',
    __DIR__ . '/Auth/MagicLinkTokenRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\magicLinkTokenRepositoryTests',
    __DIR__ . '/Auth/SessionRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\sessionRepositoryTests',
    __DIR__ . '/Auth/RateLimiterTest.php' => 'KanaGame\\Paddle\\Tests\\rateLimiterTests',
    __DIR__ . '/Auth/EmailNormalizerTest.php' => 'KanaGame\\Paddle\\Tests\\emailNormalizerTests',
    __DIR__ . '/Auth/EmailValidatorTest.php' => 'KanaGame\\Paddle\\Tests\\emailValidatorTests',
    __DIR__ . '/Auth/CurrentUserServiceTest.php' => 'KanaGame\\Paddle\\Tests\\currentUserServiceTests',
    __DIR__ . '/Auth/MagicLinkUrlBuilderTest.php' => 'KanaGame\\Paddle\\Tests\\magicLinkUrlBuilderTests',
    __DIR__ . '/Auth/MagicLinkAuthServiceTest.php' => 'KanaGame\\Paddle\\Tests\\magicLinkAuthServiceTests',
    __DIR__ . '/Purchase/PurchaseIntentRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\purchaseIntentRepositoryTests',
    __DIR__ . '/Purchase/TransactionGrantRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\transactionGrantRepositoryTests',
    __DIR__ . '/Purchase/PendingAdjustmentRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\pendingAdjustmentRepositoryTests',
    __DIR__ . '/Purchase/PurchaseIntentServiceTest.php' => 'KanaGame\\Paddle\\Tests\\purchaseIntentServiceTests',
    __DIR__ . '/Purchase/PurchaseWebhookHandlerTest.php' => 'KanaGame\\Paddle\\Tests\\purchaseWebhookHandlerTests',
    __DIR__ . '/Purchase/PurchaseWebhookHandlerIsolationTest.php' => 'KanaGame\\Paddle\\Tests\\purchaseWebhookHandlerIsolationTests',
    __DIR__ . '/Purchase/CurrentUserEntitlementServiceTest.php' => 'KanaGame\\Paddle\\Tests\\currentUserEntitlementServiceTests',
    __DIR__ . '/DevOnly/DevHarnessMagicLinkStoreTest.php' => 'KanaGame\\Paddle\\Tests\\devHarnessMagicLinkStoreTests',
    __DIR__ . '/DevOnly/DevHarnessMailerTest.php' => 'KanaGame\\Paddle\\Tests\\devHarnessMailerTests',
    __DIR__ . '/DevOnly/LastMagicLinkEntrypointTest.php' => 'KanaGame\\Paddle\\Tests\\lastMagicLinkEntrypointTests',
];

$totalPassed = 0;
$totalFailed = 0;
$failures = [];

foreach ($testFiles as $file => $providerFunction) {
    require_once $file;
    /** @var array<string, callable(): void> $tests */
    $tests = $providerFunction();
    $shortFile = basename($file);

    foreach ($tests as $name => $test) {
        try {
            $test();
            $totalPassed++;
            echo "  \033[32m✓\033[0m {$shortFile}: {$name}\n";
        } catch (TestFailure $e) {
            $totalFailed++;
            $failures[] = "{$shortFile}: {$name} — {$e->getMessage()}";
            echo "  \033[31m✗\033[0m {$shortFile}: {$name} — {$e->getMessage()}\n";
        } catch (\Throwable $e) {
            $totalFailed++;
            $failures[] = "{$shortFile}: {$name} — unexpected " . get_class($e) . ": {$e->getMessage()}";
            echo "  \033[31m✗\033[0m {$shortFile}: {$name} — unexpected " . get_class($e) . ": {$e->getMessage()}\n";
        }
    }
}

echo "\n" . ($totalFailed === 0 ? "\033[32m" : "\033[31m") . "{$totalPassed} passed, {$totalFailed} failed\033[0m\n";

exit($totalFailed === 0 ? 0 : 1);
