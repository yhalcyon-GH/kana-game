<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

/**
 * Result of handling one webhook delivery — an HTTP entrypoint
 * (server/paddle-webhook.php) turns this into a status code + body. Kept
 * separate from any one handler so it's shared, unambiguously, by both
 * the legacy Phase 2 WebhookHandler and Phase 3A's PurchaseWebhookHandler
 * (server/src/Purchase/PurchaseWebhookHandler.php) — this repo has no
 * autoloader, so anything using this class must require_once this file
 * directly rather than relying on another file having already loaded it.
 */
final class WebhookResult
{
    private function __construct(
        public readonly int $statusCode,
        public readonly string $message,
    ) {
    }

    public static function invalidSignature(): self
    {
        return new self(401, 'invalid signature');
    }

    public static function malformedPayload(): self
    {
        return new self(400, 'malformed payload');
    }

    public static function duplicateEvent(): self
    {
        return new self(200, 'duplicate event, already processed');
    }

    public static function ignoredEvent(string $eventType): self
    {
        return new self(200, "event ignored: {$eventType}");
    }

    public static function processed(string $eventType): self
    {
        return new self(200, "event processed: {$eventType}");
    }

    public static function serverError(): self
    {
        return new self(500, 'temporary server error');
    }
}
