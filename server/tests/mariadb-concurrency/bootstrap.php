<?php

declare(strict_types=1);

namespace KanaGame\Paddle\MariadbConcurrency;

/**
 * Shared requires + a real-MariaDB PDO factory for this harness. See
 * README.md for why this directory exists and how it differs from
 * server/tests/run-tests.php's SQLite-backed suite.
 *
 * Deliberately reuses (never modifies) the real production classes via
 * Config::fromArray()/Db::connect() -- the exact same connection code
 * path Production uses -- fed only ephemeral, CI-generated credentials
 * read from MARIADB_CONCURRENCY_DB_* environment variables (never
 * DB_HOST/DB_NAME/DB_USER/DB_PASSWORD, and never server/config.php).
 */

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Config.php';
require_once __DIR__ . '/../../src/Db.php';
require_once __DIR__ . '/../../src/Uuid.php';
require_once __DIR__ . '/../../src/PaddleSignature.php';
require_once __DIR__ . '/../../src/PaymentEventRepository.php';
require_once __DIR__ . '/../../src/EntitlementRepository.php';
require_once __DIR__ . '/../../src/ProductMatcher.php';
require_once __DIR__ . '/../../src/Auth/EmailNormalizer.php';
require_once __DIR__ . '/../../src/Auth/EmailValidator.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';
require_once __DIR__ . '/../../src/Auth/CurrentUserService.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkTokenRepository.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkUrlBuilder.php';
require_once __DIR__ . '/../../src/Auth/RateLimiter.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkAuthService.php';
require_once __DIR__ . '/../../src/Auth/EmailLoginChallengeRepository.php';
require_once __DIR__ . '/../../src/Auth/OtpAuthService.php';
require_once __DIR__ . '/../../src/Auth/PersistentSessionRepository.php';
require_once __DIR__ . '/../../src/Purchase/PurchaseIntentRepository.php';
require_once __DIR__ . '/../../src/Purchase/TransactionGrantRepository.php';
require_once __DIR__ . '/../../src/Purchase/PendingAdjustmentRepository.php';
require_once __DIR__ . '/../../src/Purchase/RefundCompleteness.php';
require_once __DIR__ . '/../../src/Purchase/PurchaseWebhookHandler.php';
// Test-only helpers, reused verbatim (never modified) to keep this
// harness's request wiring/payload shapes in lockstep with the
// already-reviewed SQLite-backed suite -- see README.md. Requiring
// these two files has no executable side effects: each only declares
// functions/consts (makeMagicLinkAuthServiceHarness()'s wiring
// pattern; pwhSign(), pwhTransactionCompletedPayload(),
// pwhAdjustmentPayload(), makePurchaseWebhookHandler(), and the
// PWH_TEST_* consts) -- their own makeXxxTestDb() SQLite factories are
// simply never called from this harness.
require_once __DIR__ . '/../Auth/FakeMailer.php';
require_once __DIR__ . '/../Auth/MagicLinkAuthServiceTest.php';
require_once __DIR__ . '/../Auth/OtpAuthServiceTest.php';
require_once __DIR__ . '/../Purchase/PurchaseWebhookHandlerTest.php';

use KanaGame\Paddle\Config;
use KanaGame\Paddle\Db;
use PDO;

/**
 * One fresh PDO connection to the disposable CI MariaDB instance. Every
 * caller (the orchestrator for setup/verification, and each separate
 * worker PROCESS for its own connection) calls this independently --
 * never shares a PDO across processes, and the orchestrator's own
 * setup/verification connections are themselves distinct PDOs from any
 * worker's.
 */
function connectMariadbConcurrencyTestDb(): PDO
{
    // Db::connect()'s DSN has no port parameter at all (see
    // server/src/Db.php -- unmodified here) -- it always connects on
    // the default MySQL/MariaDB port, 3306. The CI workflow's MariaDB
    // service container is published on the runner's default 3306
    // specifically so this unmodified production connection code works
    // unchanged. MARIADB_CONCURRENCY_DB_PORT is intentionally NOT read
    // here -- if the workflow ever needs a non-default port, Db.php's
    // own DSN-building would need extending, which is out of scope for
    // this diagnostic-only PR.
    $host = getenv('MARIADB_CONCURRENCY_DB_HOST');
    $name = getenv('MARIADB_CONCURRENCY_DB_NAME');
    $user = getenv('MARIADB_CONCURRENCY_DB_USER');
    $password = getenv('MARIADB_CONCURRENCY_DB_PASSWORD');

    if ($host === false || $name === false || $user === false || $password === false) {
        fwrite(STDERR, "MARIADB_CONCURRENCY_DB_* environment variables are not fully set.\n");
        exit(2);
    }

    $config = Config::fromArray([
        'DB_HOST' => $host,
        'DB_NAME' => $name,
        'DB_USER' => $user,
        'DB_PASSWORD' => $password,
    ]);

    return Db::connect($config);
}
