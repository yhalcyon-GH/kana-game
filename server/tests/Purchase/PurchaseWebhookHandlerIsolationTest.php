<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

/**
 * Regression test for a real bug: server/src/Purchase/PurchaseWebhookHandler.php
 * uses KanaGame\Paddle\WebhookResult but, before this fix, never required
 * the file declaring it — it only worked when something else (in
 * practice, WebhookHandlerTest.php running earlier in run-tests.php's
 * shared process) happened to load WebhookResult first. The real
 * production entrypoint (server/paddle-webhook.php) hit this directly:
 * every request — including a routine unsigned one — threw
 * `Class "KanaGame\Paddle\WebhookResult" not found` and surfaced as an
 * opaque 500.
 *
 * This test proves the fix by running server/paddle-webhook.php's own
 * require graph — and ONLY that graph, deliberately excluding
 * WebhookHandler.php — in a genuinely separate PHP process, so no
 * load-order coincidence from another test file can hide a regression.
 *
 * @return array<string, callable(): void>
 */
function purchaseWebhookHandlerIsolationTests(): array
{
    return [
        'PurchaseWebhookHandler resolves WebhookResult from its own require graph, in a clean process, without WebhookHandler.php ever being loaded' => function () {
            $srcDir = __DIR__ . '/../../src';
            $script = <<<PHP
                <?php
                declare(strict_types=1);
                require '{$srcDir}/Config.php';
                require '{$srcDir}/PaddleSignature.php';
                require '{$srcDir}/PaymentEventRepository.php';
                require '{$srcDir}/EntitlementRepository.php';
                require '{$srcDir}/ProductMatcher.php';
                require '{$srcDir}/Purchase/PurchaseIntentRepository.php';
                require '{$srcDir}/Purchase/TransactionGrantRepository.php';
                require '{$srcDir}/Purchase/PendingAdjustmentRepository.php';
                require '{$srcDir}/Purchase/PurchaseWebhookHandler.php';

                use KanaGame\\Paddle\\PaddleSignature;
                use KanaGame\\Paddle\\PaymentEventRepository;
                use KanaGame\\Paddle\\EntitlementRepository;
                use KanaGame\\Paddle\\Purchase\\PendingAdjustmentRepository;
                use KanaGame\\Paddle\\Purchase\\PurchaseIntentRepository;
                use KanaGame\\Paddle\\Purchase\\PurchaseWebhookHandler;
                use KanaGame\\Paddle\\Purchase\\TransactionGrantRepository;

                if (class_exists('KanaGame\\\\Paddle\\\\WebhookHandler', false)) {
                    fwrite(STDERR, 'WebhookHandler.php was unexpectedly loaded');
                    exit(2);
                }

                \$pdo = new PDO('sqlite::memory:');
                \$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                \$pdo->exec('CREATE TABLE payment_events (id INTEGER PRIMARY KEY AUTOINCREMENT, paddle_event_id TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL, paddle_transaction_id TEXT NULL, occurred_at TEXT NOT NULL, processed_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
                \$pdo->exec('CREATE TABLE entitlements (id INTEGER PRIMARY KEY AUTOINCREMENT, internal_user_id TEXT NOT NULL, product_key TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0, paddle_transaction_id TEXT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (internal_user_id, product_key))');
                \$pdo->exec('CREATE TABLE purchase_intents (id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_ref_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, product_key TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT NULL, paddle_transaction_id TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
                \$pdo->exec('CREATE TABLE transaction_grants (paddle_transaction_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, product_key TEXT NOT NULL, purchase_intent_id INTEGER NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT "active", granted_at TEXT NOT NULL, status_changed_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
                \$pdo->exec('CREATE TABLE pending_adjustments (id INTEGER PRIMARY KEY AUTOINCREMENT, paddle_transaction_id TEXT NOT NULL, action TEXT NOT NULL, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');

                \$handler = new PurchaseWebhookHandler(
                    new PaddleSignature('test-secret'),
                    new PaymentEventRepository(\$pdo),
                    new PurchaseIntentRepository(\$pdo),
                    new TransactionGrantRepository(\$pdo),
                    new PendingAdjustmentRepository(\$pdo),
                    new EntitlementRepository(\$pdo),
                    'pri_full_tamamizu',
                    'pro_full_tamamizu',
                );

                \$result = \$handler->handle('{}', null);

                if (\$result->statusCode !== 401 || \$result->message !== 'invalid signature') {
                    fwrite(STDERR, "unexpected result: {\$result->statusCode} {\$result->message}");
                    exit(1);
                }

                echo 'ok';
                PHP;

            $tmpFile = tempnam(sys_get_temp_dir(), 'pwh_isolation_');
            file_put_contents($tmpFile, $script);

            try {
                $output = [];
                $exitCode = 0;
                exec('php ' . escapeshellarg($tmpFile) . ' 2>&1', $output, $exitCode);

                assertSame(0, $exitCode, 'isolated process should exit 0; output: ' . implode("\n", $output));
                assertSame('ok', trim(implode("\n", $output)), 'isolated process should confirm WebhookResult resolved cleanly');
            } finally {
                unlink($tmpFile);
            }
        },
    ];
}
