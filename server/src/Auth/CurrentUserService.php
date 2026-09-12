<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * The ONLY service me.php and logout.php depend on — and, in PR B, the
 * ONLY service purchase-intent.php will depend on to resolve "who is
 * the current user?". Deliberately has NO dependency on
 * MagicLinkTokenRepository, RateLimiter, or Mailer, so a session-only
 * consumer never has to construct rate-limit/mail infrastructure just
 * to answer "who is this?".
 */
final class CurrentUserService
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly SessionRepository $sessions,
        private readonly int $sessionExpiryHours,
    ) {
    }

    public function createSession(string $userId): string
    {
        $rawToken = $this->generateRawToken();
        $expiresAt = new \DateTimeImmutable("+{$this->sessionExpiryHours} hours");
        $this->sessions->create($userId, $rawToken, $expiresAt);

        return $rawToken;
    }

    /**
     * @return array{user_id: string, email_normalized: string}|null
     */
    public function resolve(string $rawSessionToken): ?array
    {
        $userId = $this->sessions->findActiveUserIdForRawToken($rawSessionToken);
        if ($userId === null) {
            return null;
        }

        $user = $this->users->findById($userId);
        if ($user === null) {
            // Defensive — the sessions.user_id -> users.id FK (ON
            // DELETE CASCADE, see the migration) should make this
            // unreachable in production, but a session must never be
            // treated as valid if it can't resolve to a real user.
            return null;
        }

        return ['user_id' => $user['id'], 'email_normalized' => $user['email_normalized']];
    }

    public function logout(string $rawSessionToken): void
    {
        $this->sessions->revoke($rawSessionToken);
    }

    private function generateRawToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }
}
