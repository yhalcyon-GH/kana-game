<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

/**
 * Verifies a Paddle transaction's line items include a configured
 * price AND product id — never activate entitlement for an
 * unrecognized price/product. Extracted verbatim (behavior-preserving
 * refactor, no semantic change) from WebhookHandler::
 * matchesFullTamamizu() so both the Phase 2 WebhookHandler and Phase 3A
 * PurchaseWebhookHandler (server/src/Purchase/) share the exact same
 * security-relevant matching logic instead of maintaining two copies
 * that could silently drift apart.
 */
final class ProductMatcher
{
    /**
     * @param array<mixed> $data The transaction's data object (or
     *   anything carrying an `items` array in the same shape).
     */
    public static function matches(array $data, string $expectedPriceId, string $expectedProductId): bool
    {
        $items = $data['items'] ?? null;
        if (!is_array($items)) {
            return false;
        }

        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $price = $item['price'] ?? null;
            if (!is_array($price)) {
                continue;
            }
            $priceId = $price['id'] ?? null;
            $productId = $price['product_id'] ?? null;
            if ($priceId === $expectedPriceId && $productId === $expectedProductId) {
                return true;
            }
        }

        return false;
    }

    private function __construct()
    {
    }
}
