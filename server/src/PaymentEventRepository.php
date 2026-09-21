<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

require_once __DIR__ . '/PaddleEventTime.php';

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
            'occurred_at' => PaddleEventTime::format($occurredAt),
            'processed_at' => (new \DateTimeImmutable())->format('Y-m-d H:i:s'),
        ]);
    }

    /**
     * Phase H1-2: atomically claims a Paddle event_id as "being
     * processed now." This is the FIRST write PurchaseWebhookHandler
     * makes inside its per-request DB transaction — not a
     * record-on-success step at the end — so that:
     *  - a concurrent/racing duplicate delivery loses the UNIQUE
     *    (paddle_event_id) constraint race here and is turned away
     *    (returns false) before touching any other table;
     *  - a crash/exception anywhere later in that same transaction
     *    rolls this claim back too, so a Paddle retry of the same
     *    event_id is processed fresh rather than silently swallowed as
     *    "already processed" by a claim that survived while the rest
     *    of the work did not.
     * Returns true iff this call won the claim. Returns false (does not
     * throw) for a duplicate paddle_event_id — the same UNIQUE-
     * violation-as-no-op treatment as TransactionGrantRepository::
     * create() and PurchaseIntentRepository::consume() rely on
     * elsewhere in this codebase.
     */
    public function claim(
        string $paddleEventId,
        string $eventType,
        ?string $paddleTransactionId,
        \DateTimeImmutable $occurredAt,
    ): bool {
        try {
            $this->record($paddleEventId, $eventType, $paddleTransactionId, $occurredAt);
            return true;
        } catch (\PDOException $e) {
            if ($this->isUniqueConstraintViolation($e)) {
                return false;
            }
            throw $e;
        }
    }


    private function isUniqueConstraintViolation(\PDOException $e): bool
    {
        return $e->getCode() === '23000' || str_contains($e->getMessage(), 'UNIQUE constraint failed');
    }
}
