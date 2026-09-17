<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * @internal Value object for OtpAuthService::requestCode(). Deliberately
 * carries only the opaque challenge token (or null) -- never the code,
 * never whether the email is a known user.
 */
final class OtpRequestResult
{
    private function __construct(public readonly ?string $challengeToken)
    {
    }

    public static function issued(string $challengeToken): self
    {
        return new self($challengeToken);
    }

    public static function notIssued(): self
    {
        return new self(null);
    }
}

/**
 * Orchestrates the 6-digit email OTP request/verify flow -- the same
 * shape as MagicLinkAuthService, kept as a SEPARATE class (not a
 * refactor of MagicLinkAuthService) per the spec's explicit instruction
 * that Magic Link stays untouched/compatible as fallback.
 *
 * requestCode() ordering mirrors MagicLinkAuthService::requestLink():
 * IP throttle (login_code_ip bucket) -> validate/normalize email ->
 * email throttle (login_code_email bucket) -> invalidate any prior open
 * challenge for that email -> generate a fresh 6-digit code + opaque
 * challenge token -> persist -> send. Unlike requestLink() (which always
 * "succeeds" with zero return-value signal), requestCode() DOES return
 * whether a challenge was issued, because the frontend needs a concrete
 * challenge token to submit the code against -- a malformed or
 * rate-limited request still gets NO challenge and NO email, which is
 * the only signal a caller can observe either way.
 */
final class OtpAuthService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly EmailLoginChallengeRepository $challenges,
        private readonly PersistentSessionRepository $persistentSessions,
        private readonly UserRepository $users,
        private readonly SessionRepository $sessions,
        private readonly RateLimiter $rateLimiter,
        private readonly Mailer $mailer,
        private readonly CurrentUserService $currentUser,
        private readonly string $codePepper,
        private readonly int $codeTtlMinutes,
        private readonly int $maxAttempts,
        private readonly int $persistentLoginDays,
        private readonly int $maxPersistentSessions,
    ) {
    }

    public function requestCode(string $rawEmail, string $clientIp): OtpRequestResult
    {
        if (!$this->rateLimiter->checkAndRecordLoginCodeIp($clientIp)) {
            return OtpRequestResult::notIssued();
        }

        $email = EmailNormalizer::normalize($rawEmail);
        if (!EmailValidator::isValid($email)) {
            return OtpRequestResult::notIssued();
        }

        if (!$this->rateLimiter->checkAndRecordLoginCodeEmail($email)) {
            return OtpRequestResult::notIssued();
        }

        $this->challenges->invalidateActiveForEmail($email);

        $code = $this->generateCode();
        $rawChallengeToken = $this->generateRawToken();
        $expiresAt = new \DateTimeImmutable("+{$this->codeTtlMinutes} minutes");
        $this->challenges->issue($email, $rawChallengeToken, $code, $this->codePepper, $expiresAt);

        // The plaintext code exists only in this local variable and
        // crosses exactly one boundary -- this sendLoginCode() call --
        // before going out of scope. Never logged, never returned to the
        // caller of requestCode() itself (only the opaque challenge
        // token is), never placed in a URL.
        $this->mailer->sendLoginCode($email, $code);

        return OtpRequestResult::issued($rawChallengeToken);
    }

    private function generateCode(): string
    {
        // random_int is CSPRNG-backed (see PHP manual) -- str_pad
        // preserves leading zeros, which sprintf('%06d', ...) alone would
        // also do, but random_int's inclusive upper bound is used
        // directly here for clarity that the full 000000-999999 range
        // (not 000000-999998 or similar off-by-one) is reachable.
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    private function generateRawToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }
}
