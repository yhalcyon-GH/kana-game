<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

use PDO;

/**
 * Idempotency ledger — one row per Paddle `event_id` ever safely processed
 * (whether it resulted in an entitlement change or was recognized and
 * intentionally ignored). See server/sql/schema.sql's payment_events table.
 */
final class PaymentEventRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * True if this exact Paddle event_id has already been recorded as
     * processed — the webhook handler must treat this as "safe to
     * acknowledge again, do not reprocess" (see docs/paddle-webhook-poc.md's
     * retry-behavior notes: Paddle retries on anything other than HTTP 200).
     */
    public function alreadyProcessed(string $paddleEventId): bool
    {
        $statement = $this->pdo->prepare(
            'SELECT 1 FROM payment_events WHERE paddle_event_id = :event_id LIMIT 1',
        );
        $statement->execute(['event_id' => $paddleEventId]);
        return $statement->fetchColumn() !== false;
    }

    /**
     * Records a processed event. Relies on the UNIQUE constraint on
     * paddle_event_id as the actual idempotency guarantee (a duplicate
     * insert throws, which the caller treats as "already processed" —
     * see WebhookHandler) rather than trusting alreadyProcessed() alone
     * against a race between two concurrent deliveries.
     */
    public function record(
        string $paddleEventId,
        string $eventType,
        ?string $paddleTransactionId,
        \DateTimeImmutable $occurredAt,
    ): void {
        $statement = $this->pdo->prepare(
            'INSERT INTO payment_events
                (paddle_event_id, event_type, paddle_transaction_id, occurred_at, processed_at)
             VALUES
                (:event_id, :event_type, :transaction_id, :occurred_at, :processed_at)',
        );
        $statement->execute([
            'event_id' => $paddleEventId,
            'event_type' => $eventType,
            'transaction_id' => $paddleTransactionId,
            'occurred_at' => $occurredAt->format('Y-m-d H:i:s'),
            'processed_at' => (new \DateTimeImmutable())->format('Y-m-d H:i:s'),
        ]);
    }
}
