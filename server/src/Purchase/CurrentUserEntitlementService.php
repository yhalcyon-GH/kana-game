<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\EntitlementRepository;

/**
 * Authenticated, current-user-only entitlement lookup — the Phase 3A
 * real-user path. Depends only on CurrentUserService (session -> user)
 * and EntitlementRepository. Deliberately has NO parameter for a
 * caller-supplied user id or product key — lookupForSession() takes
 * only the raw session token; identity and product (fixed to
 * 'full_tamamizu') are entirely server-controlled, never
 * browser-influenced. This is what makes "user A cannot read user B's
 * entitlement" true by construction rather than by a runtime check
 * that could be bypassed.
 */
final class CurrentUserEntitlementService
{
    public function __construct(
        private readonly CurrentUserService $currentUser,
        private readonly EntitlementRepository $entitlements,
        private readonly string $productKey,
    ) {
    }

    /**
     * @return array{user_id: string, product: string, active: bool, updated_at: string|null}|null
     */
    public function lookupForSession(string $rawSessionToken): ?array
    {
        $user = $this->currentUser->resolve($rawSessionToken);
        if ($user === null) {
            return null;
        }

        $entitlement = $this->entitlements->find($user['user_id'], $this->productKey);

        return [
            'user_id' => $user['user_id'],
            'product' => $this->productKey,
            'active' => $entitlement !== null && $entitlement['active'],
            'updated_at' => $entitlement['updated_at'] ?? null,
        ];
    }
}
