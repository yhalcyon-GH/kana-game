<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

require_once __DIR__ . '/WebhookResult.php';

/**
 * Core webhook business logic: verify signature, parse the envelope,
 * enforce idempotency, and — only for a purchase-completion event that
 * matches the configured Full Tamamizu price/product — activate the
 * Sandbox test user's entitlement. A refund-family event revokes it.
 *
 * Event names/shapes are exactly what docs/paddle-webhook-poc.md's
 * "Official Paddle docs checked" section cites from
 * developer.paddle.com — see that file before changing any string here.
 */
final class WebhookHandler
{
    // Confirmed: developer.paddle.com/webhooks/transactions/transaction-completed.
    private const EVENT_TRANSACTION_COMPLETED = 'transaction.completed';

    // Confirmed: developer.paddle.com/webhooks/adjustments/adjustment-created.
    // Paddle Billing has no dedicated `transaction.refunded` event — refunds
    // and chargebacks are both modeled as adjustment.* events, distinguished
    // by data.action (see isRefundAction()).
    private const EVENT_ADJUSTMENT_CREATED = 'adjustment.created';
    private const EVENT_ADJUSTMENT_UPDATED = 'adjustment.updated';

    // Confirmed action values for a refund on the adjustment.created page's
    // example payload family. Chargeback-family actions
    // (chargeback/chargeback_reverse/chargeback_warning/
    // chargeback_warning_reverse) were found on the same docs page but are
    // NOT handled here — Phase 2 only implements Sandbox Refund per the
    // Acceptance Criteria; see docs/paddle-webhook-poc.md's "Refund/
    // dispute/reversal" section for what's confirmed vs. deferred.
    private const REFUND_ACTION = 'refund';

    public const PRODUCT_KEY_FULL_TAMAMIZU = 'full_tamamizu';

    public function __construct(
        private readonly PaddleSignature $signature,
        private readonly PaymentEventRepository $events,
        private readonly EntitlementRepository $entitlements,
        private readonly string $expectedPriceId,
        private readonly string $expectedProductId,
    ) {
    }

    public function handle(string $rawBody, ?string $signatureHeader): WebhookResult
    {
        if ($signatureHeader === null || $signatureHeader === '' || !$this->signature->verify($rawBody, $signatureHeader)) {
            return WebhookResult::invalidSignature();
        }

        $payload = json_decode($rawBody, true);
        if (!is_array($payload)) {
            return WebhookResult::malformedPayload();
        }

        $eventId = $payload['event_id'] ?? null;
        $eventType = $payload['event_type'] ?? null;
        $occurredAtRaw = $payload['occurred_at'] ?? null;
        $data = $payload['data'] ?? null;

        if (!is_string($eventId) || $eventId === '' || !is_string($eventType) || $eventType === '' || !is_string($occurredAtRaw) || !is_array($data)) {
            return WebhookResult::malformedPayload();
        }

        if ($this->events->alreadyProcessed($eventId)) {
            return WebhookResult::duplicateEvent();
        }

        try {
            $occurredAt = new \DateTimeImmutable($occurredAtRaw);
        } catch (\Exception) {
            return WebhookResult::malformedPayload();
        }

        $transactionId = $this->extractTransactionId($eventType, $data);

        $handled = match ($eventType) {
            self::EVENT_TRANSACTION_COMPLETED => $this->handleTransactionCompleted($data),
            self::EVENT_ADJUSTMENT_CREATED, self::EVENT_ADJUSTMENT_UPDATED => $this->handleAdjustment($data),
            default => false,
        };

        try {
            $this->events->record($eventId, $eventType, $transactionId, $occurredAt);
        } catch (\PDOException $e) {
            // A UNIQUE-constraint violation here means a concurrent
            // delivery of the SAME event already won the race — treat
            // that as a duplicate, not a failure, so Paddle doesn't retry
            // needlessly. Any other DB error is a genuine temporary
            // failure Paddle should retry for (see
            // docs/paddle-webhook-poc.md's retry-behavior notes: any
            // non-200 triggers a retry).
            if ($this->isUniqueConstraintViolation($e)) {
                return WebhookResult::duplicateEvent();
            }
            return WebhookResult::serverError();
        }

        return $handled ? WebhookResult::processed($eventType) : WebhookResult::ignoredEvent($eventType);
    }

    /**
     * @param array<mixed> $data
     */
    private function extractTransactionId(string $eventType, array $data): ?string
    {
        if ($eventType === self::EVENT_TRANSACTION_COMPLETED) {
            $id = $data['id'] ?? null;
            return is_string($id) ? $id : null;
        }
        $id = $data['transaction_id'] ?? null;
        return is_string($id) ? $id : null;
    }

    /**
     * @param array<mixed> $data The transaction.completed event's `data` object.
     */
    private function handleTransactionCompleted(array $data): bool
    {
        $status = $data['status'] ?? null;
        if ($status !== 'completed') {
            return false;
        }

        $transactionId = $data['id'] ?? null;
        if (!is_string($transactionId) || $transactionId === '') {
            return false;
        }

        if (!$this->matchesFullTamamizu($data)) {
            return false;
        }

        $customData = $data['custom_data'] ?? null;
        $internalUserId = is_array($customData) ? ($customData['internal_user_id'] ?? null) : null;
        if (!is_string($internalUserId) || $internalUserId === '') {
            return false;
        }

        $this->entitlements->activate($internalUserId, self::PRODUCT_KEY_FULL_TAMAMIZU, $transactionId);
        return true;
    }

    /**
     * Verifies the transaction's line items include the configured Full
     * Tamamizu price AND product id — never activate entitlement for an
     * unrecognized price/product (see docs/paddle-webhook-poc.md, "Full
     * Tamamizu の対象検証"). Delegates to ProductMatcher (extracted,
     * behavior-preserving refactor — see that class's own doc comment)
     * so this exact logic is shared with Phase 3A's
     * PurchaseWebhookHandler instead of existing as two copies.
     *
     * @param array<mixed> $data
     */
    private function matchesFullTamamizu(array $data): bool
    {
        return ProductMatcher::matches($data, $this->expectedPriceId, $this->expectedProductId);
    }

    /**
     * @param array<mixed> $data The adjustment.created/updated event's `data` object.
     */
    private function handleAdjustment(array $data): bool
    {
        $action = $data['action'] ?? null;
        if ($action !== self::REFUND_ACTION) {
            // Chargeback-family actions and non-refund adjustment types are
            // intentionally not handled in Phase 2 — see the class-level
            // doc comment and docs/paddle-webhook-poc.md.
            return false;
        }

        $transactionId = $data['transaction_id'] ?? null;
        if (!is_string($transactionId) || $transactionId === '') {
            return false;
        }

        // A refund's own adjustment payload does not carry the original
        // transaction's line items or custom_data, so it cannot re-derive
        // internal_user_id/product from this event alone. Phase 2's PoC
        // scope (a single fixed Sandbox test user) makes this safe: we
        // revoke the one entitlement row Phase 2 ever creates for that
        // user. A real multi-user Phase 3 would need to look up the
        // original transaction (e.g. via the Paddle API, or by keeping the
        // transaction_id -> user_id mapping learned at purchase time) —
        // this limitation is called out in docs/paddle-webhook-poc.md.
        $this->entitlements->revoke(SandboxUser::ID, self::PRODUCT_KEY_FULL_TAMAMIZU, $transactionId);
        return true;
    }

    private function isUniqueConstraintViolation(\PDOException $e): bool
    {
        // MySQL: SQLSTATE 23000 with driver code 1062 ("Duplicate entry").
        // SQLite (used only by the local test runner): SQLSTATE 23000 with
        // a "UNIQUE constraint failed" message.
        return $e->getCode() === '23000' || str_contains($e->getMessage(), 'UNIQUE constraint failed');
    }
}
