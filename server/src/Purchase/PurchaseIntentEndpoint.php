<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Purchase;

use KanaGame\Paddle\PaddleEnvironmentConfig;

/**
 * Phase H2 (environment-assertion gap fix) — the testable orchestration
 * behind server/purchase-intent.php's request handling, extracted so
 * the environment-assertion decision (reject vs. create) can be
 * directly unit-tested against an injected PDO/SQLite, the same way
 * PurchaseWebhookHandler is tested rather than the paddle-webhook.php
 * script itself. The entrypoint script stays a thin wiring layer:
 * parse the request, call handle(), turn the result into an HTTP
 * response.
 *
 * Frontend VITE_PADDLE_ENVIRONMENT and backend PADDLE_ENVIRONMENT were
 * previously independent, with no mechanical check that they agree
 * before a checkout could open — a mismatch (e.g. frontend configured
 * for Live, backend still on Sandbox) would let a real Live payment
 * complete while this backend could never process the matching
 * webhook (wrong secret/catalog), leaving the payer charged but never
 * entitled. handle() requires the caller to assert its own configured
 * environment and rejects BEFORE creating any purchase_intents row if
 * it disagrees with $environmentConfig's authoritative value — see
 * docs/paddle-environment-separation.md.
 *
 * The client-asserted environment is a CLAIM, never a selection: it
 * can only cause a request to be rejected here, never choose which
 * $environmentConfig (i.e. which server-side PADDLE_ENVIRONMENT) is
 * in effect — that is fixed before this class is even constructed,
 * by PaddleEnvironmentConfig::resolve() in server/purchase-intent.php.
 */
final class PurchaseIntentEndpoint
{
    public function __construct(
        private readonly PaddleEnvironmentConfig $environmentConfig,
        private readonly PurchaseIntentService $service,
    ) {
    }

    /**
     * @return array{status: int, body: array<string, mixed>}
     */
    public function handle(mixed $clientAssertedEnvironment, string $rawSessionToken, string $productKey): array
    {
        if ($clientAssertedEnvironment !== 'sandbox' && $clientAssertedEnvironment !== 'live') {
            return ['status' => 400, 'body' => ['error' => 'missing or invalid environment']];
        }

        if ($clientAssertedEnvironment !== $this->environmentConfig->environment) {
            // Rejected BEFORE any DB write -- PurchaseIntentService::
            // createIntent() (and therefore PurchaseIntentRepository::
            // create()) is never called on this path.
            return ['status' => 409, 'body' => ['error' => 'environment mismatch']];
        }

        $rawPurchaseRef = $this->service->createIntent($rawSessionToken, $productKey);
        if ($rawPurchaseRef === null) {
            return ['status' => 401, 'body' => ['error' => 'unauthorized']];
        }

        return ['status' => 200, 'body' => ['purchase_ref' => $rawPurchaseRef, 'environment' => $this->environmentConfig->environment]];
    }
}
