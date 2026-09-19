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
 *
 * resolveOrRefresh() is the session-refresh-from-persistent-credential
 * hook: when the normal session cookie is missing/expired but a valid,
 * non-revoked, non-expired persistent_sessions row resolves from the
 * remember-me credential, this mints a brand-new sessions row (linked
 * back to that persistent session) and returns its raw token for the
 * caller to re-issue as a fresh Set-Cookie -- no user-visible re-login.
 * $persistentSessions is optional so every pre-existing 3-arg call site
 * (request-link.php, verify.php, and every existing test's harness)
 * keeps compiling; those sites simply never get the refresh behavior
 * until they're updated to pass it.
 */
final class CurrentUserService
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly SessionRepository $sessions,
        private readonly int $sessionExpiryHours,
        private readonly ?PersistentSessionRepository $persistentSessions = null,
    ) {
    }

    public function createSession(string $userId, ?int $persistentSessionId = null): string
    {
        $rawToken = $this->generateRawToken();
        $expiresAt = new \DateTimeImmutable("+{$this->sessionExpiryHours} hours");
        $this->sessions->create($userId, $rawToken, $expiresAt, $persistentSessionId);

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

    /**
     * @return array{user: array{user_id: string, email_normalized: string}|null, refreshed_session_token: ?string}
     */
    public function resolveOrRefresh(?string $sessionRawToken, ?string $persistentRawToken): array
    {
        if ($sessionRawToken !== null) {
            $user = $this->resolve($sessionRawToken);
            if ($user !== null) {
                return ['user' => $user, 'refreshed_session_token' => null];
            }
        }

        if ($this->persistentSessions === null || $persistentRawToken === null) {
            return ['user' => null, 'refreshed_session_token' => null];
        }

        $persistentSession = $this->persistentSessions->findActiveByRawToken($persistentRawToken);
        if ($persistentSession === null) {
            return ['user' => null, 'refreshed_session_token' => null];
        }

        $user = $this->users->findById($persistentSession['user_id']);
        if ($user === null) {
            return ['user' => null, 'refreshed_session_token' => null];
        }

        $this->persistentSessions->touch($persistentSession['id']);
        $newRawSessionToken = $this->createSession($user['id'], $persistentSession['id']);

        return [
            'user' => ['user_id' => $user['id'], 'email_normalized' => $user['email_normalized']],
            'refreshed_session_token' => $newRawSessionToken,
        ];
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
