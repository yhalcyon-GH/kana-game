<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * Value object returned by MagicLinkAuthService::verify(). success=false
 * never distinguishes WHY (unknown/expired/already-used token).
 */
final class MagicLinkAuthResult
{
    /**
     * @param array{id: string, email_normalized: string}|null $user
     */
    private function __construct(
        public readonly bool $success,
        public readonly ?string $sessionToken,
        public readonly ?array $user,
    ) {
    }

    public static function invalid(): self
    {
        return new self(false, null, null);
    }

    /**
     * @param array{id: string, email_normalized: string} $user
     */
    public static function success(string $sessionToken, array $user): self
    {
        return new self(true, $sessionToken, $user);
    }
}

/**
 * Orchestrates the Magic Link request/verify flow. Depends on
 * CurrentUserService (not SessionRepository directly) to create the
 * session at the end of verify() — composing, not duplicating,
 * session-creation logic. Has NO consumer outside request-link.php and
 * verify.php; me.php/logout.php/PR B's future purchase-intent.php use
 * CurrentUserService directly and never construct this class.
 */
final class MagicLinkAuthService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly MagicLinkTokenRepository $tokens,
        private readonly UserRepository $users,
        private readonly RateLimiter $rateLimiter,
        private readonly Mailer $mailer,
        private readonly MagicLinkUrlBuilder $urlBuilder,
        private readonly CurrentUserService $currentUser,
        private readonly int $tokenExpiryMinutes,
    ) {
    }

    /**
     * Always "succeeds" from the caller's perspective — no exception,
     * no distinguishable return value for "already registered" vs.
     * "new" vs. "rate-limited" vs. "malformed."
     *
     * Ordering: the IP bucket is recorded FIRST, before email
     * validation — a malformed email must not be a free pass that
     * skips IP-based throttling. Only after the IP bucket allows this
     * request do we validate/normalize the email and then check the
     * EMAIL bucket.
     */
    public function requestLink(string $rawEmail, string $clientIp): void
    {
        if (!$this->rateLimiter->checkAndRecordIp($clientIp)) {
            return;
        }

        $email = EmailNormalizer::normalize($rawEmail);
        if (!EmailValidator::isValid($email)) {
            return;
        }

        if (!$this->rateLimiter->checkAndRecordEmail($email)) {
            return;
        }

        $rawToken = $this->generateRawToken();
        $expiresAt = new \DateTimeImmutable("+{$this->tokenExpiryMinutes} minutes");
        $this->tokens->issue($email, $rawToken, $expiresAt);

        $magicLinkUrl = $this->urlBuilder->build($rawToken);
        $this->mailer->sendMagicLink($email, $magicLinkUrl);
    }

    public function verify(string $rawToken): MagicLinkAuthResult
    {
        $this->pdo->beginTransaction();

        try {
            if (!$this->tokens->consume($rawToken)) {
                $this->pdo->rollBack();
                return MagicLinkAuthResult::invalid();
            }

            $email = $this->tokens->findEmailForRawToken($rawToken);
            if ($email === null) {
                $this->pdo->rollBack();
                return MagicLinkAuthResult::invalid();
            }

            $user = $this->users->findOrCreateByEmail($email);
            $this->tokens->bindUser($rawToken, $user['id']);

            $rawSessionToken = $this->currentUser->createSession($user['id']);

            $this->pdo->commit();

            return MagicLinkAuthResult::success($rawSessionToken, $user);
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    private function generateRawToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }
}
