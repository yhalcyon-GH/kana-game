<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * The result of EmailLoginChallengeRepository::consumeAttempt(). Never
 * distinguishes "unknown token" from "expired" from "already
 * used/invalidated" beyond the single reason 'invalid' -- same
 * enumeration-safety posture as MagicLinkTokenRepository::consume().
 * 'incorrect_code' and 'attempts_exhausted' ARE distinguished from each
 * other and from 'invalid', because the OTP UX needs to tell "wrong code,
 * try again" apart from "this challenge is dead, request a new code" --
 * neither of those two reveals anything about a DIFFERENT email/attacker
 * target the way distinguishing "unknown" from "expired" would.
 */
final class EmailLoginChallengeConsumeResult
{
    private function __construct(
        public readonly bool $success,
        public readonly string $reason,
    ) {
    }

    public static function ok(): self
    {
        return new self(true, 'ok');
    }

    public static function invalid(): self
    {
        return new self(false, 'invalid');
    }

    public static function incorrectCode(): self
    {
        return new self(false, 'incorrect_code');
    }

    public static function attemptsExhausted(): self
    {
        return new self(false, 'attempts_exhausted');
    }
}

/**
 * Reads/writes email_login_challenges. The raw challenge token is never
 * stored (only SHA-256(raw)), and the plaintext code is never stored
 * (only HMAC-SHA256(raw_challenge_token + ":" + code, LOGIN_CODE_PEPPER)
 * — code_mac). Binding the MAC to the raw challenge token (not just
 * email+code) is what makes verification "bound to the challenge token,
 * not email+code alone" per the design spec.
 *
 * consumeAttempt() enforces single-use via the same atomic conditional
 * UPDATE + affected-row-count pattern as MagicLinkTokenRepository::
 * consume() for the SUCCESS path, so concurrent verify-code calls with
 * the correct code against the same challenge resolve to exactly one
 * success (see the mariadb-concurrency scenario D added in Task 17). The
 * FAILURE path (wrong code) uses the SAME atomic-conditional-UPDATE
 * pattern, gated on "attempts < maxAttempts" in the WHERE clause: no
 * more than LOGIN_CODE_MAX_ATTEMPTS guesses (successful or not) can ever
 * be accepted against one challenge, however many race in concurrently
 * -- MariaDB's ordinary row-level locking on UPDATE serializes them, so
 * whichever request's UPDATE actually commits is evaluated against the
 * row's true, up-to-date attempts count, not a stale pre-read (see
 * mariadb-concurrency scenario F, added specifically to prove this).
 */
final class EmailLoginChallengeRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function issue(
        string $emailNormalized,
        string $rawChallengeToken,
        string $code,
        string $pepper,
        \DateTimeImmutable $expiresAt,
    ): void {
        $statement = $this->pdo->prepare(
            'INSERT INTO email_login_challenges
                (challenge_token_hash, email_normalized, code_mac, expires_at, attempts, created_at)
             VALUES (:challenge_token_hash, :email, :code_mac, :expires_at, 0, CURRENT_TIMESTAMP)',
        );
        $statement->execute([
            'challenge_token_hash' => hash('sha256', $rawChallengeToken),
            'email' => $emailNormalized,
            'code_mac' => $this->computeCodeMac($rawChallengeToken, $code, $pepper),
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        ]);
    }

    /**
     * Supersedes any still-open (not used, not already invalidated)
     * challenge for this email -- called before issuing a fresh one on
     * resend. A settled (used or already-invalidated) row is left
     * untouched.
     */
    public function invalidateActiveForEmail(string $emailNormalized): void
    {
        $nowExpression = $this->nowExpression();
        $statement = $this->pdo->prepare(
            "UPDATE email_login_challenges
             SET invalidated_at = {$nowExpression}
             WHERE email_normalized = :email AND used_at IS NULL AND invalidated_at IS NULL",
        );
        $statement->execute(['email' => $emailNormalized]);
    }

    public function findEmailForRawToken(string $rawChallengeToken): ?string
    {
        $expectedHash = hash('sha256', $rawChallengeToken);
        $statement = $this->pdo->prepare(
            'SELECT email_normalized, challenge_token_hash FROM email_login_challenges WHERE challenge_token_hash = :hash LIMIT 1',
        );
        $statement->execute(['hash' => $expectedHash]);
        /** @var array{email_normalized: string, challenge_token_hash: string}|false $row */
        $row = $statement->fetch();

        if ($row === false || !hash_equals($expectedHash, $row['challenge_token_hash'])) {
            return null;
        }

        return $row['email_normalized'];
    }

    public function consumeAttempt(
        string $rawChallengeToken,
        string $code,
        string $pepper,
        int $maxAttempts,
    ): EmailLoginChallengeConsumeResult {
        $tokenHash = hash('sha256', $rawChallengeToken);
        $nowExpression = $this->nowExpression();

        // This initial SELECT is intentionally non-locking. It only reads
        // fields that are either immutable once set (code_mac, expires_at)
        // or monotonic/settled once true (used_at, invalidated_at) -- none
        // of these can be raced back into a "not yet" state by a
        // concurrent request, so a stale read here can only ever make us
        // MORE conservative (return early with 'invalid'), never less.
        // `attempts` is the one field that genuinely races under
        // concurrent guesses; it is deliberately NOT gated on here --
        // both branches below re-check it as part of an atomic conditional
        // UPDATE instead (see the WHERE ... AND attempts < :maxAttempts
        // clauses), so no more than $maxAttempts increments (successful or
        // not) can ever be accepted against one challenge, regardless of
        // how many requests race in concurrently. See mariadb-concurrency
        // scenario F, which exercises exactly this race with real
        // MariaDB.
        $select = $this->pdo->prepare(
            'SELECT code_mac, used_at, invalidated_at, expires_at FROM email_login_challenges
             WHERE challenge_token_hash = :hash LIMIT 1',
        );
        $select->execute(['hash' => $tokenHash]);
        /** @var array{code_mac: string, used_at: ?string, invalidated_at: ?string, expires_at: string}|false $row */
        $row = $select->fetch();

        if ($row === false) {
            return EmailLoginChallengeConsumeResult::invalid();
        }
        if ($row['used_at'] !== null || $row['invalidated_at'] !== null) {
            return EmailLoginChallengeConsumeResult::invalid();
        }
        if (new \DateTimeImmutable($row['expires_at']) <= new \DateTimeImmutable('now')) {
            return EmailLoginChallengeConsumeResult::invalid();
        }

        $expectedMac = $this->computeCodeMac($rawChallengeToken, $code, $pepper);

        if (hash_equals($row['code_mac'], $expectedMac)) {
            // Atomic: a correct-code consume only succeeds if the row is
            // STILL open (single-use, matching MagicLinkTokenRepository::
            // consume()'s pattern) AND still under the attempt budget at
            // the moment MariaDB evaluates this UPDATE's WHERE clause --
            // not at the moment of the SELECT above. Concurrent wrong-code
            // UPDATEs on this same row serialize against this one via
            // ordinary InnoDB row locking, so whichever of them commits
            // first is the value this WHERE clause actually sees.
            $consume = $this->pdo->prepare(
                "UPDATE email_login_challenges
                 SET used_at = {$nowExpression}
                 WHERE challenge_token_hash = :hash AND used_at IS NULL AND invalidated_at IS NULL
                   AND attempts < :maxAttempts",
            );
            $consume->execute(['hash' => $tokenHash, 'maxAttempts' => $maxAttempts]);

            if ($consume->rowCount() === 1) {
                return EmailLoginChallengeConsumeResult::ok();
            }
            // Lost the race to a concurrent successful consumeAttempt()
            // (used_at got set first -- see mariadb-concurrency scenario
            // D), or the attempt budget was exhausted by concurrent
            // wrong-code guesses before this UPDATE's row lock was
            // granted. Re-read to report the correct reason rather than
            // guessing from the stale pre-image.
            $recheck = $this->pdo->prepare(
                'SELECT attempts FROM email_login_challenges WHERE challenge_token_hash = :hash LIMIT 1',
            );
            $recheck->execute(['hash' => $tokenHash]);
            $attemptsNow = $recheck->fetchColumn();
            if ($attemptsNow !== false && (int) $attemptsNow >= $maxAttempts) {
                return EmailLoginChallengeConsumeResult::attemptsExhausted();
            }
            return EmailLoginChallengeConsumeResult::invalid();
        }

        // Same atomic guard as the success path: this increment is only
        // accepted (rowCount() === 1) while attempts is still under the
        // cap AT UPDATE TIME. No more than $maxAttempts total increments
        // (across this branch and the success branch's own failed-race
        // path never increments) can ever be accepted against one
        // challenge, however many wrong guesses race in concurrently --
        // the (maxAttempts+1)th and later concurrent UPDATEs all see
        // attempts already >= maxAttempts once they acquire the row lock
        // and affect zero rows.
        $increment = $this->pdo->prepare(
            'UPDATE email_login_challenges
             SET attempts = attempts + 1
             WHERE challenge_token_hash = :hash AND used_at IS NULL AND invalidated_at IS NULL
               AND attempts < :maxAttempts',
        );
        $increment->execute(['hash' => $tokenHash, 'maxAttempts' => $maxAttempts]);

        if ($increment->rowCount() === 1) {
            return EmailLoginChallengeConsumeResult::incorrectCode();
        }
        // Either already used/invalidated by a concurrent successful
        // consume (re-check to report 'invalid' rather than a misleading
        // 'attempts_exhausted'), or the budget was already spent.
        $recheck = $this->pdo->prepare(
            'SELECT used_at, invalidated_at FROM email_login_challenges WHERE challenge_token_hash = :hash LIMIT 1',
        );
        $recheck->execute(['hash' => $tokenHash]);
        $settledRow = $recheck->fetch();
        if ($settledRow !== false && ($settledRow['used_at'] !== null || $settledRow['invalidated_at'] !== null)) {
            return EmailLoginChallengeConsumeResult::invalid();
        }
        return EmailLoginChallengeConsumeResult::attemptsExhausted();
    }

    private function computeCodeMac(string $rawChallengeToken, string $code, string $pepper): string
    {
        return hash_hmac('sha256', $rawChallengeToken . ':' . $code, $pepper);
    }

    private function nowExpression(): string
    {
        return $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';
    }
}
