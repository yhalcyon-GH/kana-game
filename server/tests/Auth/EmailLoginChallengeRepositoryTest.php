<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\EmailLoginChallengeRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/EmailLoginChallengeRepository.php';

function makeEmailLoginChallengeRepositoryTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE email_login_challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenge_token_hash TEXT NOT NULL UNIQUE,
            email_normalized TEXT NOT NULL,
            code_mac TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            used_at TEXT NULL,
            invalidated_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

const ELC_TEST_PEPPER = 'test-login-code-pepper';

/**
 * @return array<string, callable(): void>
 */
function emailLoginChallengeRepositoryTests(): array
{
    return [
        'issue() then consumeAttempt() with the correct code succeeds exactly once' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawToken = 'raw-challenge-token-1';
            $repo->issue('user@example.com', $rawToken, '042817', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $first = $repo->consumeAttempt($rawToken, '042817', ELC_TEST_PEPPER, 5);
            $second = $repo->consumeAttempt($rawToken, '042817', ELC_TEST_PEPPER, 5);

            assertTrue($first->success, 'first correct-code attempt should succeed');
            assertSame('ok', $first->reason, 'reason should be ok on success');
            assertFalse($second->success, 'a second attempt against an already-used challenge must fail, even with the correct code');
        },

        'consumeAttempt() with the wrong code fails and increments attempts, without consuming the challenge' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawToken = 'raw-challenge-token-2';
            $repo->issue('user2@example.com', $rawToken, '111111', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $wrong = $repo->consumeAttempt($rawToken, '999999', ELC_TEST_PEPPER, 5);
            assertFalse($wrong->success, 'wrong code must fail');
            assertSame('incorrect_code', $wrong->reason, 'reason should be incorrect_code for a wrong code');

            $right = $repo->consumeAttempt($rawToken, '111111', ELC_TEST_PEPPER, 5);
            assertTrue($right->success, 'the correct code must still work after one wrong attempt');
        },

        'consumeAttempt() is dead after LOGIN_CODE_MAX_ATTEMPTS wrong attempts, even with the correct code' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawToken = 'raw-challenge-token-3';
            $repo->issue('user3@example.com', $rawToken, '222222', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            for ($i = 0; $i < 5; $i++) {
                $result = $repo->consumeAttempt($rawToken, '000000', ELC_TEST_PEPPER, 5);
                assertFalse($result->success, "wrong attempt {$i} must fail");
            }

            $final = $repo->consumeAttempt($rawToken, '222222', ELC_TEST_PEPPER, 5);
            assertFalse($final->success, 'the challenge must be dead after 5 wrong attempts, even with the correct code');
            assertSame('attempts_exhausted', $final->reason, 'reason should be attempts_exhausted after the limit is reached');
        },

        'consumeAttempt() fails for an expired challenge' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawToken = 'raw-challenge-token-4';
            $repo->issue('user4@example.com', $rawToken, '333333', ELC_TEST_PEPPER, new \DateTimeImmutable('-1 minute'));

            $result = $repo->consumeAttempt($rawToken, '333333', ELC_TEST_PEPPER, 5);
            assertFalse($result->success, 'an expired challenge must never succeed, even with the correct code');
            assertSame('invalid', $result->reason, 'reason should be invalid for an expired challenge');
        },

        'consumeAttempt() fails for an unknown token' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $result = $repo->consumeAttempt('never-issued', '000000', ELC_TEST_PEPPER, 5);
            assertFalse($result->success, 'an unknown token must fail');
            assertSame('invalid', $result->reason, 'reason should be invalid for an unknown token');
        },

        'invalidateActiveForEmail() makes a resend supersede the prior open challenge (resend invalidation)' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawTokenOld = 'raw-challenge-old';
            $rawTokenNew = 'raw-challenge-new';
            $repo->issue('resend@example.com', $rawTokenOld, '444444', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $repo->invalidateActiveForEmail('resend@example.com');
            $repo->issue('resend@example.com', $rawTokenNew, '555555', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $oldResult = $repo->consumeAttempt($rawTokenOld, '444444', ELC_TEST_PEPPER, 5);
            $newResult = $repo->consumeAttempt($rawTokenNew, '555555', ELC_TEST_PEPPER, 5);

            assertFalse($oldResult->success, 'the superseded old challenge must never succeed, even with its own correct code');
            assertTrue($newResult->success, 'the new challenge issued after resend must succeed normally');
        },

        'invalidateActiveForEmail() does not touch an already-used challenge (no-op on a settled row)' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawToken = 'raw-challenge-settled';
            $repo->issue('settled@example.com', $rawToken, '666666', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));
            $repo->consumeAttempt($rawToken, '666666', ELC_TEST_PEPPER, 5);

            $repo->invalidateActiveForEmail('settled@example.com');

            $row = $pdo->query("SELECT used_at, invalidated_at FROM email_login_challenges WHERE email_normalized = 'settled@example.com'")->fetch();
            assertTrue($row['used_at'] !== null, 'used_at must remain set');
            assertTrue($row['invalidated_at'] === null, 'invalidateActiveForEmail() must not mark an already-used row as invalidated');
        },

        'issue() never stores the plaintext code anywhere in the row' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $repo->issue('plaintext-check@example.com', 'raw-plaintext-check', '777777', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $row = $pdo->query("SELECT * FROM email_login_challenges WHERE email_normalized = 'plaintext-check@example.com'")->fetch();
            foreach ($row as $column => $value) {
                if (is_string($value)) {
                    assertFalse(str_contains($value, '777777'), "column {$column} must never contain the plaintext code");
                }
            }
        },

        'code_mac differs when the same code+pepper is issued under two different challenge tokens (MAC is bound to the challenge token, not email+code alone)' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $repo->issue('bound@example.com', 'raw-token-x', '888888', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));
            $repo->issue('bound2@example.com', 'raw-token-y', '888888', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $rows = $pdo->query('SELECT code_mac FROM email_login_challenges ORDER BY id')->fetchAll();
            assertTrue($rows[0]['code_mac'] !== $rows[1]['code_mac'], 'the same code under a different challenge token must produce a different code_mac');
        },

        'consumeAttempt() with the correct code but the WRONG pepper fails (pepper isolation)' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawToken = 'raw-pepper-isolation';
            $repo->issue('pepper@example.com', $rawToken, '123123', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $wrongPepper = $repo->consumeAttempt($rawToken, '123123', 'a-completely-different-pepper', 5);
            assertFalse($wrongPepper->success, 'the correct code under the wrong pepper must fail exactly like a wrong code -- the pepper is part of the effective secret');

            $rightPepper = $repo->consumeAttempt($rawToken, '123123', ELC_TEST_PEPPER, 5);
            assertTrue($rightPepper->success, 'the correct code under the correct pepper must still work (the wrong-pepper attempt above must not have poisoned the row beyond a normal attempts++)');
        },
    ];
}
