<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

use KanaGame\Paddle\Auth\CurrentUserService;

/**
 * Authenticated purchase-intent creation. Depends ONLY on
 * CurrentUserService (PR A's lightweight session-to-user resolver) and
 * PurchaseIntentRepository — no Magic Link, Mailer, or RateLimiter
 * dependency, matching the "session-only consumer" pattern
 * CurrentUserService exists for.
 *
 * The browser can never supply a user id: createIntent() resolves the
 * user exclusively from the (server-verified) session token, and the
 * generated purchase_ref is bound to that resolved user at creation
 * time, inside this one call.
 */
final class PurchaseIntentService
{
    public function __construct(
        private readonly PurchaseIntentRepository $intents,
        private readonly CurrentUserService $currentUser,
        private readonly int $intentExpiryMinutes,
    ) {
    }

    /**
     * Returns the raw purchase_ref (returned to the caller exactly
     * once — never persisted, never logged) or null if the session
     * token does not resolve to an authenticated user.
     */
    public function createIntent(string $rawSessionToken, string $productKey): ?string
    {
        $user = $this->currentUser->resolve($rawSessionToken);
        if ($user === null) {
            return null;
        }

        $rawPurchaseRef = $this->generateRawPurchaseRef();
        $expiresAt = new \DateTimeImmutable("+{$this->intentExpiryMinutes} minutes");
        $this->intents->create($user['user_id'], $productKey, $rawPurchaseRef, $expiresAt);

        return $rawPurchaseRef;
    }

    private function generateRawPurchaseRef(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }
}
