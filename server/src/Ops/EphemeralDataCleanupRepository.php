<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Ops;

use DateTimeImmutable;
use PDO;

/**
 * Bounded cleanup for short-lived authentication and purchase-attribution
 * artifacts. This class deliberately never touches users, transaction_grants,
 * payment_events, pending_adjustments, reconciliation blocks, or entitlements.
 *
 * Every delete re-checks the same eligibility predicate used by preview(), so
 * a row that changes between candidate selection and deletion is preserved.
 */
final class EphemeralDataCleanupRepository
{
    public const DEFAULT_GRACE_DAYS = 30;
    public const DEFAULT_BATCH_LIMIT = 500;

    /** @var list<string> */
    private const TABLE_KEYS = [
        'magicLinkTokens',
        'emailLoginChallenges',
        'sessions',
        'persistentSessions',
        'purchaseIntents',
    ];

    public function __construct(
        private readonly PDO $pdo,
        private readonly int $batchLimit = self::DEFAULT_BATCH_LIMIT,
    ) {
        if ($this->batchLimit < 1 || $this->batchLimit > 5000) {
            throw new \InvalidArgumentException('batchLimit must be between 1 and 5000');
        }
    }

    /**
     * @return array{
     *   magicLinkTokens:int,
     *   emailLoginChallenges:int,
     *   sessions:int,
     *   persistentSessions:int,
     *   purchaseIntents:int
     * }
     */
    public function preview(DateTimeImmutable $cutoff): array
    {
        $cutoffString = $cutoff->format('Y-m-d H:i:s');

        return [
            'magicLinkTokens' => $this->count(
                'magic_link_tokens',
                '(expires_at < :cutoff OR (used_at IS NOT NULL AND used_at < :cutoff))',
                $cutoffString,
            ),
            'emailLoginChallenges' => $this->count(
                'email_login_challenges',
                '(expires_at < :cutoff OR (used_at IS NOT NULL AND used_at < :cutoff) OR (invalidated_at IS NOT NULL AND invalidated_at < :cutoff))',
                $cutoffString,
            ),
            'sessions' => $this->count(
                'sessions',
                '(expires_at < :cutoff OR (revoked_at IS NOT NULL AND revoked_at < :cutoff))',
                $cutoffString,
            ),
            'persistentSessions' => $this->count(
                'persistent_sessions',
                '(expires_at < :cutoff OR (revoked_at IS NOT NULL AND revoked_at < :cutoff))
                 AND NOT EXISTS (
                   SELECT 1 FROM sessions s WHERE s.persistent_session_id = persistent_sessions.id
                 )',
                $cutoffString,
            ),
            'purchaseIntents' => $this->count(
                'purchase_intents',
                'consumed_at IS NULL
                 AND expires_at < :cutoff
                 AND NOT EXISTS (
                   SELECT 1 FROM transaction_grants tg WHERE tg.purchase_intent_id = purchase_intents.id
                 )',
                $cutoffString,
            ),
        ];
    }

    /**
     * Deletes at most batchLimit rows per table in one transaction.
     * Sessions are deleted before persistent_sessions so a parent becomes
     * eligible only after its retained child rows are gone.
     *
     * @return array{
     *   magicLinkTokens:int,
     *   emailLoginChallenges:int,
     *   sessions:int,
     *   persistentSessions:int,
     *   purchaseIntents:int
     * }
     */
    public function applyOneBatch(DateTimeImmutable $cutoff): array
    {
        $cutoffString = $cutoff->format('Y-m-d H:i:s');
        $deleted = array_fill_keys(self::TABLE_KEYS, 0);

        $this->pdo->beginTransaction();
        try {
            $deleted['sessions'] = $this->deleteBatch(
                'sessions',
                '(expires_at < :cutoff OR (revoked_at IS NOT NULL AND revoked_at < :cutoff))',
                $cutoffString,
            );
            $deleted['persistentSessions'] = $this->deleteBatch(
                'persistent_sessions',
                '(expires_at < :cutoff OR (revoked_at IS NOT NULL AND revoked_at < :cutoff))
                 AND NOT EXISTS (
                   SELECT 1 FROM sessions s WHERE s.persistent_session_id = persistent_sessions.id
                 )',
                $cutoffString,
            );
            $deleted['magicLinkTokens'] = $this->deleteBatch(
                'magic_link_tokens',
                '(expires_at < :cutoff OR (used_at IS NOT NULL AND used_at < :cutoff))',
                $cutoffString,
            );
            $deleted['emailLoginChallenges'] = $this->deleteBatch(
                'email_login_challenges',
                '(expires_at < :cutoff OR (used_at IS NOT NULL AND used_at < :cutoff) OR (invalidated_at IS NOT NULL AND invalidated_at < :cutoff))',
                $cutoffString,
            );
            $deleted['purchaseIntents'] = $this->deleteBatch(
                'purchase_intents',
                'consumed_at IS NULL
                 AND expires_at < :cutoff
                 AND NOT EXISTS (
                   SELECT 1 FROM transaction_grants tg WHERE tg.purchase_intent_id = purchase_intents.id
                 )',
                $cutoffString,
            );

            $this->pdo->commit();
            return $deleted;
        } catch (\Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    private function count(string $table, string $predicate, string $cutoff): int
    {
        $statement = $this->pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE {$predicate}");
        $statement->execute(['cutoff' => $cutoff]);

        return (int) $statement->fetchColumn();
    }

    private function deleteBatch(string $table, string $predicate, string $cutoff): int
    {
        $ids = $this->selectCandidateIds($table, $predicate, $cutoff);
        if ($ids === []) {
            return 0;
        }

        $placeholders = implode(', ', array_fill(0, count($ids), '?'));
        $sql = "DELETE FROM {$table}
                WHERE id IN ({$placeholders})
                  AND " . str_replace(':cutoff', '?', $predicate);
        $statement = $this->pdo->prepare($sql);
        $statement->execute([...$ids, $cutoff]);

        return $statement->rowCount();
    }

    /** @return list<int> */
    private function selectCandidateIds(string $table, string $predicate, string $cutoff): array
    {
        $sql = "SELECT id FROM {$table}
                WHERE {$predicate}
                ORDER BY id ASC
                LIMIT {$this->batchLimit}";
        $statement = $this->pdo->prepare($sql);
        $statement->execute(['cutoff' => $cutoff]);

        return array_map(
            static fn (mixed $id): int => (int) $id,
            $statement->fetchAll(PDO::FETCH_COLUMN),
        );
    }
}
