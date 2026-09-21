<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

/**
 * Canonical formatter for Paddle event timestamps persisted for ordering.
 *
 * Paddle occurred_at values can carry fractional seconds. Truncating them to
 * whole seconds makes two distinct events compare equal and can let arrival
 * order decide entitlement state. Every persisted Paddle event-time used for
 * ordering therefore keeps six fractional digits, matching MariaDB DATETIME(6).
 */
final class PaddleEventTime
{
    public static function format(\DateTimeInterface $occurredAt): string
    {
        return $occurredAt->format('Y-m-d H:i:s.u');
    }
}
