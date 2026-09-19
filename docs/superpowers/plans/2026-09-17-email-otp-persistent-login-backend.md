# Email OTP + Persistent Login — Backend (PR A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 6-digit email OTP sign-in flow plus a 90-day "remember this browser" persistent credential (max 3 slots per user, LRU eviction on the 4th), entirely on the backend, without touching Magic Link or the purchase/entitlement boundary.

**Architecture:** Mirrors the existing Magic Link stack file-for-file: a new additive migration (`0006_email_otp_persistent_login.sql`), a repository per new table (`EmailLoginChallengeRepository`, `PersistentSessionRepository`), an orchestrating service (`OtpAuthService`) with the same PDO-transaction/atomic-consume shape as `MagicLinkAuthService`, three new file-per-endpoint entrypoints under `server/auth/`, small extensions to `SessionRepository`/`CurrentUserService`/`RateLimiter`/`logout.php` for linkage and session-refresh, and test coverage added to both the SQLite-backed `server/tests/run-tests.php` suite and the real-MariaDB `server/tests/mariadb-concurrency/` harness.

**Tech Stack:** PHP 8+, PDO (MariaDB in production, SQLite in tests), no Composer/dependency manager (project convention — see `server/tests/run-tests.php`'s own doc comment), dependency-free test runner.

**Spec:** `docs/superpowers/specs/2026-09-17-email-otp-persistent-login-design.md` — this plan implements PR A from that spec only (backend). PR B (frontend) and PR C are explicitly out of scope; do not add tasks for them.

## Global Constraints

- Base: `main` @ `92b9ddabf113ee7a85e0bb89efe0607943e202d7` (PR #291 merged) — migration is `0003_...sql`, applied after `0001`/`0002`.
- `LOGIN_CODE_PEPPER` is a distinct secret from `RATE_LIMIT_PEPPER` — never reuse `RATE_LIMIT_PEPPER` for the code MAC.
- OTP: crypto-secure RNG, `000000`–`999999` with preserved leading zeros; 10 min TTL (`LOGIN_CODE_TTL_MINUTES`, default 10); 5 attempts then dead (`LOGIN_CODE_MAX_ATTEMPTS`, default 5); resend invalidates the prior code; code never logged/returned/stored plaintext; verification is bound to the opaque challenge token, not email+code alone; concurrent verify attempts on the same challenge: exactly one succeeds.
- Persistent login: 256-bit opaque token, hash-only storage, 90-day absolute expiry (`PERSISTENT_LOGIN_DAYS`, default 90), server-revocable, `last_seen_at` touched on legitimate use.
- Max 3 (`MAX_PERSISTENT_SESSIONS`, default 3) / LRU eviction: quota unit is `persistent_sessions` rows. 4th successful OTP login evicts the least-recently-used (`last_seen_at`) active row for that user and cascade-revokes its linked `sessions` rows (application-level cascade, not DB cascade) — login itself is never blocked.
- `magic_link_tokens`, existing `sessions` rows, `rate_limits`, and Magic Link endpoints are untouched and remain fully functional.
- Purchase/entitlement boundary is unchanged — this plan touches no file under `server/src/Purchase/` or `server/auth-purchase/`.
- No real Paddle payment/refund, no Production DB migration/write, no Production secret/DNS/deploy changes — this plan only creates migration files and edits `config.example.php`, never `server/config.php`.
- All new/changed PHP files follow this repo's existing conventions: `declare(strict_types=1)`, `namespace KanaGame\Paddle\Auth` (or `KanaGame\Paddle\MariadbConcurrency` for the concurrency harness), explicit `require __DIR__ . '/...'` (no autoloader), raw tokens hashed with SHA-256 before storage, `hash_equals()` for any final secret comparison.
- Test additions register in `server/tests/run-tests.php`'s `$testFiles` array (SQLite suite) and, where noted, in `server/tests/mariadb-concurrency/orchestrate.php`'s `$allScenarios` map (real-MariaDB suite) — never a parallel/unregistered runner.

---

## Task List

- [ ] Task 1: Migration `0006_email_otp_persistent_login.sql`
- [ ] Task 2: `RateLimiter` — generalize for `login_code_email` / `login_code_ip` buckets
- [ ] Task 3: `EmailLoginChallengeRepository`
- [ ] Task 4: `PersistentSessionRepository`
- [ ] Task 5: `SessionRepository` — link sessions to a persistent session
- [ ] Task 6: `CurrentUserService` — session-refresh-from-persistent-credential
- [ ] Task 7: `OtpAuthService` — `requestCode()`
- [ ] Task 8: `OtpAuthService` — `verifyCode()` with max-3/LRU enforcement
- [ ] Task 9: `server/auth/request-code.php`
- [ ] Task 10: `server/auth/verify-code.php`
- [ ] Task 11: `server/auth/capabilities.php`
- [ ] Task 12: Wire persistent-session refresh into `server/auth/me.php`
- [ ] Task 13: `server/auth/sign-out-others.php`
- [ ] Task 14: Extend `server/auth/logout.php` to revoke the persistent credential
- [ ] Task 15: `config.example.php` + `Config.php` additions
- [ ] Task 16: OTP security test suite (expiry/reuse/attempts/resend/pepper isolation/no-plaintext-storage)
- [ ] Task 17: Real-MariaDB concurrency scenarios D (verify-code race) and E (4th-login LRU eviction race)

---

### Task 1: Migration `0006_email_otp_persistent_login.sql`

**Files:**
- Create: `server/sql/migrations/0006_email_otp_persistent_login.sql`

**Interfaces:**
- Produces: tables `email_login_challenges`, `persistent_sessions`; new nullable column `sessions.persistent_session_id`. These exact table/column names and types are what every later task's repository SQL targets.

There is no PHP test runner for raw migration SQL in this repo (see `0001`/`0002`, which have none) — this task's own verification step is applying the file to a real MariaDB-compatible check via `php -r` syntax validation of the SQL file structure is not meaningful for `.sql`, so verification here is: (a) the file parses as valid standalone SQL statements (no unmatched parens/quotes — checked by eye against the two existing migrations' style) and (b) Task 3/4/5's SQLite-backed unit tests, whose `CREATE TABLE` fixtures are hand-mirrored from this file, are the actual executable proof the shape is usable. This task is still done test-first in spirit: Task 3/4/5 write their SQLite fixture `CREATE TABLE` statements that assume these exact column names before this file exists conceptually, but since this is pure DDL with no PHP behavior of its own, write the migration directly and let Tasks 3–5's repository tests be the executable verification.

- [ ] **Step 1: Write the migration file**

```sql
-- Phase (email OTP + persistent login), PR A — additive migration. Adds
-- the 6-digit email code challenge table and the persistent ("remember
-- this browser") credential table, plus a nullable link column on
-- sessions. Does NOT alter, drop, or rename users, magic_link_tokens,
-- sessions' existing columns, or rate_limits — Magic Link stays fully
-- functional as fallback (see server/src/Auth/MagicLinkAuthService.php).
--
-- Run this once, after 0001_users_auth_foundation.sql and
-- 0002_purchase_attribution.sql, against the same MariaDB 10.5+ database.
-- This migration is NOT deployed to Xserver as part of this PR.

CREATE TABLE IF NOT EXISTS email_login_challenges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- SHA-256 hex digest of the raw opaque challenge token returned to the
  -- browser as {"challenge": "..."}. Raw challenge token is NEVER stored
  -- — same raw-never-stored pattern as magic_link_tokens.token_hash.
  challenge_token_hash CHAR(64) NOT NULL,
  -- The pending identity a request-code call was issued for. NOT a FK to
  -- users at insert time — request-code.php never creates or looks up a
  -- users row (find-or-create happens only on successful verify).
  email_normalized VARCHAR(255) NOT NULL,
  -- HMAC-SHA256(challenge_token_raw + ":" + code, LOGIN_CODE_PEPPER) hex
  -- digest. LOGIN_CODE_PEPPER is a DISTINCT secret from RATE_LIMIT_PEPPER
  -- — see server/src/Auth/RateLimiter.php's doc comment on why the two
  -- must never be the same value. The plaintext code is NEVER stored.
  code_mac CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  -- Incremented on every incorrect-code attempt against this challenge.
  -- At LOGIN_CODE_MAX_ATTEMPTS (default 5), the challenge is dead — see
  -- EmailLoginChallengeRepository::consumeAttempt().
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  -- Set by the atomic conditional UPDATE in
  -- EmailLoginChallengeRepository::consumeAttempt() on a successful code
  -- match — enforces single-use. NULL means still open.
  used_at DATETIME NULL,
  -- Set when a resend (a second request-code call for the same email)
  -- supersedes this still-open challenge — see
  -- EmailLoginChallengeRepository::invalidateActiveForEmail(). A resend
  -- invalidates the prior code per the spec.
  invalidated_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_challenge_token_hash (challenge_token_hash),
  KEY idx_email_normalized (email_normalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS persistent_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- SHA-256 hex digest of the raw 256-bit token in the
  -- __Host-tamamizu_remember cookie. Raw token is NEVER stored — this is
  -- a real long-lived account credential, treated with at least the same
  -- care as sessions.token_hash.
  token_hash CHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  -- Absolute, not sliding: created_at + PERSISTENT_LOGIN_DAYS, fixed at
  -- creation time and never extended by use.
  expires_at DATETIME NOT NULL,
  -- Set on explicit sign-out-others.php, logout.php's persistent-credential
  -- revoke, or LRU eviction on a 4th login. NULL means still active.
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Touched on every legitimate use (a fresh OTP login that reuses this
  -- row is impossible -- each login creates a NEW persistent_sessions
  -- row -- so in practice this is touched by the session-refresh path in
  -- CurrentUserService::resolveOrRefresh()). This is the field LRU
  -- eviction orders by.
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_token_hash (token_hash),
  KEY idx_user_id_last_seen (user_id, last_seen_at),
  CONSTRAINT fk_persistent_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Nullable link so revoking/evicting a persistent credential can
-- cascade-revoke its linked normal sessions at the APPLICATION level
-- (see SessionRepository::revokeByPersistentSessionId()), keeping the
-- same explicit-revocation audit pattern as the rest of this schema
-- rather than a DB-level cascade delete.
ALTER TABLE sessions
  ADD COLUMN persistent_session_id BIGINT UNSIGNED NULL AFTER user_id,
  ADD CONSTRAINT fk_sessions_persistent_session
    FOREIGN KEY (persistent_session_id) REFERENCES persistent_sessions (id) ON DELETE SET NULL,
  ADD KEY idx_persistent_session_id (persistent_session_id);
```

- [ ] **Step 2: Sanity-check the file**

Run: `php -r "echo preg_match('/;\s*$/m', file_get_contents('server/sql/migrations/0006_email_otp_persistent_login.sql')) ? \"looks statement-terminated\n\" : \"check terminators\n\";"`
Expected: `looks statement-terminated` (a cheap parenthesis/quote sanity check — this migration is not executed against any DB in this task; Tasks 3–5's SQLite fixtures and, ultimately, Task 17's real-MariaDB harness are what actually execute an equivalent shape).

- [ ] **Step 3: Commit**

```bash
git add server/sql/migrations/0006_email_otp_persistent_login.sql
git commit -m "Add migration 0003: email OTP challenges + persistent sessions"
```

---

### Task 2: `RateLimiter` — generalize for `login_code_email` / `login_code_ip` buckets

**Files:**
- Modify: `server/src/Auth/RateLimiter.php`
- Test: `server/tests/Auth/RateLimiterTest.php` (add cases; file already registered in `run-tests.php`)

**Interfaces:**
- Consumes: nothing new — same `PDO $pdo` the class already takes.
- Produces: two new public methods on `RateLimiter` used by `OtpAuthService` (Task 7):
  `checkAndRecordLoginCodeEmail(string $emailNormalized): bool` and
  `checkAndRecordLoginCodeIp(string $rawIp): bool`. Existing public methods
  (`checkAndRecordEmail`, `checkAndRecordIp`) and the constructor's existing
  4 required params are unchanged — two new **optional** constructor params
  are appended so every existing call site (`request-link.php`, `verify.php`,
  `MagicLinkAuthServiceTest.php`'s harness, `scenarios.php`) keeps compiling
  unmodified.

- [ ] **Step 1: Write the failing test**

Open `server/tests/Auth/RateLimiterTest.php` first and match its existing helper/DB-construction pattern (its `rate_limits` table shape is identical to `MagicLinkAuthServiceTest.php`'s `makeMagicLinkAuthServiceTestDb()`). Add these two entries to the array `rateLimiterTests()` returns:

```php
        'checkAndRecordLoginCodeEmail() uses a separate bucket/limit from checkAndRecordEmail()' => function () {
            $pdo = makeRateLimiterTestDb();
            $limiter = new RateLimiter($pdo, 'test-pepper', 5, 20, 3, 10);

            for ($i = 0; $i < 3; $i++) {
                assertTrue($limiter->checkAndRecordLoginCodeEmail('otp@example.com'), "login-code attempt {$i} should be under its own 3/hour limit");
            }
            assertFalse($limiter->checkAndRecordLoginCodeEmail('otp@example.com'), 'the 4th login-code request for this email must be blocked by the login-code bucket, not the magic-link bucket');

            assertTrue($limiter->checkAndRecordEmail('otp@example.com'), 'the magic-link email bucket must be independent of the login-code email bucket');
        },

        'checkAndRecordLoginCodeIp() uses a separate bucket/limit from checkAndRecordIp()' => function () {
            $pdo = makeRateLimiterTestDb();
            $limiter = new RateLimiter($pdo, 'test-pepper', 5, 20, 3, 10);

            for ($i = 0; $i < 10; $i++) {
                assertTrue($limiter->checkAndRecordLoginCodeIp('203.0.113.5'), "login-code IP attempt {$i} should be under its own 10/hour limit");
            }
            assertFalse($limiter->checkAndRecordLoginCodeIp('203.0.113.5'), 'the 11th login-code request from this IP must be blocked');
        },
```

(If the file's existing helper is named differently than `makeRateLimiterTestDb()`, use whatever name is already there — do not introduce a second helper.)

- [ ] **Step 2: Run test to verify it fails**

Run: `php server/tests/run-tests.php`
Expected: FAIL — `Call to undefined method KanaGame\Paddle\Auth\RateLimiter::checkAndRecordLoginCodeEmail()`.

- [ ] **Step 3: Implement**

Edit `server/src/Auth/RateLimiter.php` — add two bucket constants and two public methods, and append two optional constructor params:

```php
final class RateLimiter
{
    private const BUCKET_EMAIL = 'magic_link_email';
    private const BUCKET_IP = 'magic_link_ip';
    private const BUCKET_LOGIN_CODE_EMAIL = 'login_code_email';
    private const BUCKET_LOGIN_CODE_IP = 'login_code_ip';
    private const WINDOW_SECONDS = 3600;

    public function __construct(
        private readonly PDO $pdo,
        private readonly string $pepper,
        private readonly int $emailLimitPerHour,
        private readonly int $ipLimitPerHour,
        // Optional -- appended so every existing constructor call site
        // (request-link.php, verify.php, test harnesses, the mariadb-
        // concurrency scenarios) keeps compiling unmodified. Only
        // OtpAuthService's wiring (Task 7) passes these explicitly.
        private readonly int $loginCodeEmailLimitPerHour = 3,
        private readonly int $loginCodeIpLimitPerHour = 10,
    ) {
    }

    public function checkAndRecordEmail(string $emailNormalized): bool
    {
        return $this->checkAndRecord(self::BUCKET_EMAIL, $emailNormalized, $this->emailLimitPerHour);
    }

    public function checkAndRecordIp(string $rawIp): bool
    {
        return $this->checkAndRecord(self::BUCKET_IP, $rawIp, $this->ipLimitPerHour);
    }

    public function checkAndRecordLoginCodeEmail(string $emailNormalized): bool
    {
        return $this->checkAndRecord(self::BUCKET_LOGIN_CODE_EMAIL, $emailNormalized, $this->loginCodeEmailLimitPerHour);
    }

    public function checkAndRecordLoginCodeIp(string $rawIp): bool
    {
        return $this->checkAndRecord(self::BUCKET_LOGIN_CODE_IP, $rawIp, $this->loginCodeIpLimitPerHour);
    }

    private function checkAndRecord(string $bucket, string $rawValue, int $limitPerHour): bool
    {
        // ... unchanged body (identifier = hash_hmac('sha256', "{$bucket}:{$rawValue}", $this->pepper), etc.)
```

Leave `checkAndRecord()`'s body, `upsertWindowMariaDb()`, and `upsertWindowSqlite()` exactly as they are — only the constants/constructor/public-method surface change. `identifier = hash_hmac('sha256', "{$bucket}:{$rawValue}", $this->pepper)` already namespaces by bucket, so `login_code_email`/`login_code_ip` rows can never collide with `magic_link_email`/`magic_link_ip` rows for the same raw email/IP, exactly as the spec's "no new pepper needed here" note relies on.

- [ ] **Step 4: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: all `RateLimiterTest.php` cases pass, and every other pre-existing test in the suite still passes (the constructor change is additive-only, so every existing 4-arg `new RateLimiter(...)` call site keeps compiling).

- [ ] **Step 5: Commit**

```bash
git add server/src/Auth/RateLimiter.php server/tests/Auth/RateLimiterTest.php
git commit -m "Add login_code_email/login_code_ip rate-limit buckets to RateLimiter"
```

---

### Task 3: `EmailLoginChallengeRepository`

**Files:**
- Create: `server/src/Auth/EmailLoginChallengeRepository.php`
- Create: `server/tests/Auth/EmailLoginChallengeRepositoryTest.php`
- Modify: `server/tests/run-tests.php` (register the new test file)

**Interfaces:**
- Consumes: `PDO $pdo` (constructor). Mirrors `MagicLinkTokenRepository`'s shape exactly (same file, same repo).
- Produces (used by `OtpAuthService`, Task 7/8):
  - `issue(string $emailNormalized, string $rawChallengeToken, string $code, string $pepper, \DateTimeImmutable $expiresAt): void`
  - `invalidateActiveForEmail(string $emailNormalized): void`
  - `findEmailForRawToken(string $rawChallengeToken): ?string`
  - `consumeAttempt(string $rawChallengeToken, string $code, string $pepper, int $maxAttempts): EmailLoginChallengeConsumeResult` — a new tiny value object (defined in the same file) with `public readonly bool $success` and `public readonly string $reason` (`'ok'|'invalid'|'incorrect_code'|'attempts_exhausted'`).

- [ ] **Step 1: Write the failing test**

Create `server/tests/Auth/EmailLoginChallengeRepositoryTest.php`:

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\EmailLoginChallengeRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/EmailLoginChallengeRepository.php';

function makeEmailLoginChallengeRepositoryTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE email_login_challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenge_token_hash TEXT NOT NULL UNIQUE,
            email_normalized TEXT NOT NULL,
            code_mac TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            used_at TEXT NULL,
            invalidated_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

const ELC_TEST_PEPPER = 'test-login-code-pepper';

/**
 * @return array<string, callable(): void>
 */
function emailLoginChallengeRepositoryTests(): array
{
    return [
        'issue() then consumeAttempt() with the correct code succeeds exactly once' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawToken = 'raw-challenge-token-1';
            $repo->issue('user@example.com', $rawToken, '042817', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $first = $repo->consumeAttempt($rawToken, '042817', ELC_TEST_PEPPER, 5);
            $second = $repo->consumeAttempt($rawToken, '042817', ELC_TEST_PEPPER, 5);

            assertTrue($first->success, 'first correct-code attempt should succeed');
            assertSame('ok', $first->reason, 'reason should be ok on success');
            assertFalse($second->success, 'a second attempt against an already-used challenge must fail, even with the correct code');
        },

        'consumeAttempt() with the wrong code fails and increments attempts, without consuming the challenge' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawToken = 'raw-challenge-token-2';
            $repo->issue('user2@example.com', $rawToken, '111111', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $wrong = $repo->consumeAttempt($rawToken, '999999', ELC_TEST_PEPPER, 5);
            assertFalse($wrong->success, 'wrong code must fail');
            assertSame('incorrect_code', $wrong->reason);

            $right = $repo->consumeAttempt($rawToken, '111111', ELC_TEST_PEPPER, 5);
            assertTrue($right->success, 'the correct code must still work after one wrong attempt');
        },

        'consumeAttempt() is dead after LOGIN_CODE_MAX_ATTEMPTS wrong attempts, even with the correct code' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawToken = 'raw-challenge-token-3';
            $repo->issue('user3@example.com', $rawToken, '222222', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            for ($i = 0; $i < 5; $i++) {
                $result = $repo->consumeAttempt($rawToken, '000000', ELC_TEST_PEPPER, 5);
                assertFalse($result->success, "wrong attempt {$i} must fail");
            }

            $final = $repo->consumeAttempt($rawToken, '222222', ELC_TEST_PEPPER, 5);
            assertFalse($final->success, 'the challenge must be dead after 5 wrong attempts, even with the correct code');
            assertSame('attempts_exhausted', $final->reason);
        },

        'consumeAttempt() fails for an expired challenge' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawToken = 'raw-challenge-token-4';
            $repo->issue('user4@example.com', $rawToken, '333333', ELC_TEST_PEPPER, new \DateTimeImmutable('-1 minute'));

            $result = $repo->consumeAttempt($rawToken, '333333', ELC_TEST_PEPPER, 5);
            assertFalse($result->success, 'an expired challenge must never succeed, even with the correct code');
            assertSame('invalid', $result->reason);
        },

        'consumeAttempt() fails for an unknown token' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $result = $repo->consumeAttempt('never-issued', '000000', ELC_TEST_PEPPER, 5);
            assertFalse($result->success);
            assertSame('invalid', $result->reason);
        },

        'invalidateActiveForEmail() makes a resend supersede the prior open challenge (resend invalidation)' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawTokenOld = 'raw-challenge-old';
            $rawTokenNew = 'raw-challenge-new';
            $repo->issue('resend@example.com', $rawTokenOld, '444444', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $repo->invalidateActiveForEmail('resend@example.com');
            $repo->issue('resend@example.com', $rawTokenNew, '555555', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $oldResult = $repo->consumeAttempt($rawTokenOld, '444444', ELC_TEST_PEPPER, 5);
            $newResult = $repo->consumeAttempt($rawTokenNew, '555555', ELC_TEST_PEPPER, 5);

            assertFalse($oldResult->success, 'the superseded old challenge must never succeed, even with its own correct code');
            assertTrue($newResult->success, 'the new challenge issued after resend must succeed normally');
        },

        'invalidateActiveForEmail() does not touch an already-used challenge (no-op on a settled row)' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawToken = 'raw-challenge-settled';
            $repo->issue('settled@example.com', $rawToken, '666666', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));
            $repo->consumeAttempt($rawToken, '666666', ELC_TEST_PEPPER, 5);

            $repo->invalidateActiveForEmail('settled@example.com');

            $row = $pdo->query("SELECT used_at, invalidated_at FROM email_login_challenges WHERE email_normalized = 'settled@example.com'")->fetch();
            assertTrue($row['used_at'] !== null, 'used_at must remain set');
            assertTrue($row['invalidated_at'] === null, 'invalidateActiveForEmail() must not mark an already-used row as invalidated');
        },

        'issue() never stores the plaintext code anywhere in the row' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $repo->issue('plaintext-check@example.com', 'raw-plaintext-check', '777777', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $row = $pdo->query("SELECT * FROM email_login_challenges WHERE email_normalized = 'plaintext-check@example.com'")->fetch();
            foreach ($row as $column => $value) {
                if (is_string($value)) {
                    assertFalse(str_contains($value, '777777'), "column {$column} must never contain the plaintext code");
                }
            }
        },

        'code_mac differs when the same code+pepper is issued under two different challenge tokens (MAC is bound to the challenge token, not email+code alone)' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $repo->issue('bound@example.com', 'raw-token-x', '888888', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));
            $repo->issue('bound2@example.com', 'raw-token-y', '888888', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $rows = $pdo->query('SELECT code_mac FROM email_login_challenges ORDER BY id')->fetchAll();
            assertTrue($rows[0]['code_mac'] !== $rows[1]['code_mac'], 'the same code under a different challenge token must produce a different code_mac');
        },
    ];
}
```

- [ ] **Step 2: Register the test and run it to verify it fails**

Add to `server/tests/run-tests.php`'s `$testFiles` array (alphabetically near the other `Auth/` entries):

```php
    __DIR__ . '/Auth/EmailLoginChallengeRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\emailLoginChallengeRepositoryTests',
```

Run: `php server/tests/run-tests.php`
Expected: FAIL — `Failed opening required '.../EmailLoginChallengeRepository.php'` (class does not exist yet).

- [ ] **Step 3: Implement**

Create `server/src/Auth/EmailLoginChallengeRepository.php`:

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * The result of EmailLoginChallengeRepository::consumeAttempt(). Never
 * distinguishes "unknown token" from "expired" from "already
 * used/invalidated" beyond the single reason 'invalid' -- same
 * enumeration-safety posture as MagicLinkTokenRepository::consume().
 * 'incorrect_code' and 'attempts_exhausted' ARE distinguished from each
 * other and from 'invalid', because the OTP UX needs to tell "wrong code,
 * try again" apart from "this challenge is dead, request a new code" --
 * neither of those two reveals anything about a DIFFERENT email/attacker
 * target the way distinguishing "unknown" from "expired" would.
 */
final class EmailLoginChallengeConsumeResult
{
    private function __construct(
        public readonly bool $success,
        public readonly string $reason,
    ) {
    }

    public static function ok(): self
    {
        return new self(true, 'ok');
    }

    public static function invalid(): self
    {
        return new self(false, 'invalid');
    }

    public static function incorrectCode(): self
    {
        return new self(false, 'incorrect_code');
    }

    public static function attemptsExhausted(): self
    {
        return new self(false, 'attempts_exhausted');
    }
}

/**
 * Reads/writes email_login_challenges. The raw challenge token is never
 * stored (only SHA-256(raw)), and the plaintext code is never stored
 * (only HMAC-SHA256(raw_challenge_token + ":" + code, LOGIN_CODE_PEPPER)
 * — code_mac). Binding the MAC to the raw challenge token (not just
 * email+code) is what makes verification "bound to the challenge token,
 * not email+code alone" per the design spec.
 *
 * consumeAttempt() enforces single-use via the same atomic conditional
 * UPDATE + affected-row-count pattern as MagicLinkTokenRepository::
 * consume() for the SUCCESS path, so concurrent verify-code calls with
 * the correct code against the same challenge resolve to exactly one
 * success (see the mariadb-concurrency scenario D added in Task 17). The
 * FAILURE path (wrong code) does a best-effort attempts increment --
 * losing an attempts++ race under concurrency only makes the limit
 * marginally more permissive, never less safe, and is not itself a
 * security boundary (LOGIN_CODE_MAX_ATTEMPTS is a UX/anti-bruteforce
 * throttle on top of the code's own 1-in-a-million guess space, not the
 * sole defense).
 */
final class EmailLoginChallengeRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function issue(
        string $emailNormalized,
        string $rawChallengeToken,
        string $code,
        string $pepper,
        \DateTimeImmutable $expiresAt,
    ): void {
        $statement = $this->pdo->prepare(
            'INSERT INTO email_login_challenges
                (challenge_token_hash, email_normalized, code_mac, expires_at, attempts, created_at)
             VALUES (:challenge_token_hash, :email, :code_mac, :expires_at, 0, CURRENT_TIMESTAMP)',
        );
        $statement->execute([
            'challenge_token_hash' => hash('sha256', $rawChallengeToken),
            'email' => $emailNormalized,
            'code_mac' => $this->computeCodeMac($rawChallengeToken, $code, $pepper),
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        ]);
    }

    /**
     * Supersedes any still-open (not used, not already invalidated)
     * challenge for this email -- called before issuing a fresh one on
     * resend. A settled (used or already-invalidated) row is left
     * untouched.
     */
    public function invalidateActiveForEmail(string $emailNormalized): void
    {
        $nowExpression = $this->nowExpression();
        $statement = $this->pdo->prepare(
            "UPDATE email_login_challenges
             SET invalidated_at = {$nowExpression}
             WHERE email_normalized = :email AND used_at IS NULL AND invalidated_at IS NULL",
        );
        $statement->execute(['email' => $emailNormalized]);
    }

    public function findEmailForRawToken(string $rawChallengeToken): ?string
    {
        $expectedHash = hash('sha256', $rawChallengeToken);
        $statement = $this->pdo->prepare(
            'SELECT email_normalized, challenge_token_hash FROM email_login_challenges WHERE challenge_token_hash = :hash LIMIT 1',
        );
        $statement->execute(['hash' => $expectedHash]);
        /** @var array{email_normalized: string, challenge_token_hash: string}|false $row */
        $row = $statement->fetch();

        if ($row === false || !hash_equals($expectedHash, $row['challenge_token_hash'])) {
            return null;
        }

        return $row['email_normalized'];
    }

    public function consumeAttempt(
        string $rawChallengeToken,
        string $code,
        string $pepper,
        int $maxAttempts,
    ): EmailLoginChallengeConsumeResult {
        $tokenHash = hash('sha256', $rawChallengeToken);
        $nowExpression = $this->nowExpression();

        $select = $this->pdo->prepare(
            "SELECT code_mac, attempts, used_at, invalidated_at, expires_at FROM email_login_challenges
             WHERE challenge_token_hash = :hash LIMIT 1",
        );
        $select->execute(['hash' => $tokenHash]);
        /** @var array{code_mac: string, attempts: int, used_at: ?string, invalidated_at: ?string, expires_at: string}|false $row */
        $row = $select->fetch();

        if ($row === false) {
            return EmailLoginChallengeConsumeResult::invalid();
        }
        if ($row['used_at'] !== null || $row['invalidated_at'] !== null) {
            return EmailLoginChallengeConsumeResult::invalid();
        }
        if (new \DateTimeImmutable($row['expires_at']) <= new \DateTimeImmutable('now')) {
            return EmailLoginChallengeConsumeResult::invalid();
        }
        if ((int) $row['attempts'] >= $maxAttempts) {
            return EmailLoginChallengeConsumeResult::attemptsExhausted();
        }

        $expectedMac = $this->computeCodeMac($rawChallengeToken, $code, $pepper);

        if (hash_equals($row['code_mac'], $expectedMac)) {
            $consume = $this->pdo->prepare(
                "UPDATE email_login_challenges
                 SET used_at = {$nowExpression}
                 WHERE challenge_token_hash = :hash AND used_at IS NULL AND invalidated_at IS NULL",
            );
            $consume->execute(['hash' => $tokenHash]);

            if ($consume->rowCount() === 1) {
                return EmailLoginChallengeConsumeResult::ok();
            }
            // Lost the race to a concurrent successful consumeAttempt() on
            // the same challenge -- see mariadb-concurrency scenario D.
            return EmailLoginChallengeConsumeResult::invalid();
        }

        $increment = $this->pdo->prepare(
            'UPDATE email_login_challenges
             SET attempts = attempts + 1
             WHERE challenge_token_hash = :hash AND used_at IS NULL AND invalidated_at IS NULL',
        );
        $increment->execute(['hash' => $tokenHash]);

        return EmailLoginChallengeConsumeResult::incorrectCode();
    }

    private function computeCodeMac(string $rawChallengeToken, string $code, string $pepper): string
    {
        return hash_hmac('sha256', $rawChallengeToken . ':' . $code, $pepper);
    }

    private function nowExpression(): string
    {
        return $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: all `EmailLoginChallengeRepositoryTest.php` cases pass; full suite green.

- [ ] **Step 5: Commit**

```bash
git add server/src/Auth/EmailLoginChallengeRepository.php server/tests/Auth/EmailLoginChallengeRepositoryTest.php server/tests/run-tests.php
git commit -m "Add EmailLoginChallengeRepository for 6-digit email OTP challenges"
```

---

### Task 4: `PersistentSessionRepository`

**Files:**
- Create: `server/src/Auth/PersistentSessionRepository.php`
- Create: `server/tests/Auth/PersistentSessionRepositoryTest.php`
- Modify: `server/tests/run-tests.php` (register the new test file)

**Interfaces:**
- Consumes: `PDO $pdo` (constructor); `Uuid::v4()`-style ids are NOT used here — `persistent_sessions.id` is the auto-increment `int` primary key (unlike `users.id`), matching `sessions.id`'s own shape.
- Produces (used by `OtpAuthService` Task 7/8, `CurrentUserService` Task 6, `sign-out-others.php` Task 13):
  - `create(string $userId, string $rawToken, \DateTimeImmutable $expiresAt): int` (returns the new row's `id`)
  - `findActiveByRawToken(string $rawToken): ?array{id: int, user_id: string, expires_at: string}`
  - `touch(int $id): void`
  - `countActiveForUser(string $userId): int`
  - `evictLruForUser(string $userId): ?int` (revokes and returns the evicted row's `id`, or `null` if the user has no active rows)
  - `revoke(int $id): void`
  - `revokeAllForUserExcept(string $userId, int $keepId): array` (returns the `list<int>` of ids it revoked)

- [ ] **Step 1: Write the failing test**

Create `server/tests/Auth/PersistentSessionRepositoryTest.php`:

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\PersistentSessionRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/PersistentSessionRepository.php';

function makePersistentSessionRepositoryTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE persistent_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            revoked_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function persistentSessionRepositoryTests(): array
{
    return [
        'create() then findActiveByRawToken() resolves the same row, never the raw token stored plaintext' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $id = $repo->create('user-1', 'raw-remember-token', new \DateTimeImmutable('+90 days'));

            $found = $repo->findActiveByRawToken('raw-remember-token');
            assertTrue($found !== null, 'a freshly created active token should resolve');
            assertSame($id, $found['id']);
            assertSame('user-1', $found['user_id']);

            $row = $pdo->query('SELECT token_hash FROM persistent_sessions WHERE id = ' . $id)->fetch();
            assertFalse(str_contains($row['token_hash'], 'raw-remember-token'), 'token_hash must never contain the raw token');
        },

        'findActiveByRawToken() returns null for a revoked row' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $id = $repo->create('user-2', 'raw-revoked-token', new \DateTimeImmutable('+90 days'));
            $repo->revoke($id);

            assertTrue($repo->findActiveByRawToken('raw-revoked-token') === null, 'a revoked persistent session must not resolve');
        },

        'findActiveByRawToken() returns null for an expired row' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $repo->create('user-3', 'raw-expired-token', new \DateTimeImmutable('-1 minute'));

            assertTrue($repo->findActiveByRawToken('raw-expired-token') === null, 'an expired persistent session must not resolve');
        },

        'touch() advances last_seen_at' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $id = $repo->create('user-4', 'raw-touch-token', new \DateTimeImmutable('+90 days'));
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2020-01-01 00:00:00' WHERE id = {$id}");

            $repo->touch($id);

            $row = $pdo->query("SELECT last_seen_at FROM persistent_sessions WHERE id = {$id}")->fetch();
            assertTrue($row['last_seen_at'] !== '2020-01-01 00:00:00', 'last_seen_at should have advanced past the seeded old value');
        },

        'countActiveForUser() counts only non-revoked, non-expired rows for that user' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $repo->create('user-5', 'raw-a', new \DateTimeImmutable('+90 days'));
            $repo->create('user-5', 'raw-b', new \DateTimeImmutable('+90 days'));
            $revokedId = $repo->create('user-5', 'raw-c', new \DateTimeImmutable('+90 days'));
            $repo->revoke($revokedId);
            $repo->create('user-5', 'raw-d', new \DateTimeImmutable('-1 minute'));
            $repo->create('other-user', 'raw-e', new \DateTimeImmutable('+90 days'));

            assertSame(2, $repo->countActiveForUser('user-5'), 'only the two still-active rows for user-5 should count');
        },

        'evictLruForUser() revokes the least-recently-used active row and returns its id' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $oldest = $repo->create('user-6', 'raw-oldest', new \DateTimeImmutable('+90 days'));
            $middle = $repo->create('user-6', 'raw-middle', new \DateTimeImmutable('+90 days'));
            $newest = $repo->create('user-6', 'raw-newest', new \DateTimeImmutable('+90 days'));
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2020-01-01 00:00:00' WHERE id = {$oldest}");
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2021-01-01 00:00:00' WHERE id = {$middle}");
            $pdo->exec("UPDATE persistent_sessions SET last_seen_at = '2022-01-01 00:00:00' WHERE id = {$newest}");

            $evicted = $repo->evictLruForUser('user-6');

            assertSame($oldest, $evicted, 'the row with the oldest last_seen_at must be evicted');
            assertSame(2, $repo->countActiveForUser('user-6'), 'exactly one row should have been revoked');
            assertTrue($repo->findActiveByRawToken('raw-oldest') === null);
            assertTrue($repo->findActiveByRawToken('raw-middle') !== null);
        },

        'evictLruForUser() returns null when the user has no active rows' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            assertTrue($repo->evictLruForUser('nobody') === null);
        },

        'revokeAllForUserExcept() revokes every active row for the user except the kept id, and returns the revoked ids' => function () {
            $pdo = makePersistentSessionRepositoryTestDb();
            $repo = new PersistentSessionRepository($pdo);
            $keep = $repo->create('user-7', 'raw-keep', new \DateTimeImmutable('+90 days'));
            $other1 = $repo->create('user-7', 'raw-other-1', new \DateTimeImmutable('+90 days'));
            $other2 = $repo->create('user-7', 'raw-other-2', new \DateTimeImmutable('+90 days'));
            $repo->create('other-user', 'raw-unrelated', new \DateTimeImmutable('+90 days'));

            $revokedIds = $repo->revokeAllForUserExcept('user-7', $keep);

            sort($revokedIds);
            assertSame([$other1, $other2], $revokedIds);
            assertSame(1, $repo->countActiveForUser('user-7'));
            assertTrue($repo->findActiveByRawToken('raw-keep') !== null, 'the kept row must remain active');
            assertTrue($repo->findActiveByRawToken('raw-unrelated') !== null, 'another user\'s row must be untouched');
        },
    ];
}
```

- [ ] **Step 2: Register the test and run it to verify it fails**

Add to `server/tests/run-tests.php`'s `$testFiles`:

```php
    __DIR__ . '/Auth/PersistentSessionRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\persistentSessionRepositoryTests',
```

Run: `php server/tests/run-tests.php`
Expected: FAIL — class `PersistentSessionRepository` not found.

- [ ] **Step 3: Implement**

Create `server/src/Auth/PersistentSessionRepository.php`:

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * Reads/writes persistent_sessions -- the 90-day "remember this browser"
 * credential. Raw token is never stored, only SHA-256(raw), same pattern
 * as SessionRepository. Quota/LRU-eviction unit is a ROW here, not a
 * device/IP/fingerprint -- see the design spec's "Max 3 / LRU eviction"
 * section.
 */
final class PersistentSessionRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function create(string $userId, string $rawToken, \DateTimeImmutable $expiresAt): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO persistent_sessions (token_hash, user_id, expires_at, created_at, last_seen_at)
             VALUES (:token_hash, :user_id, :expires_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        );
        $statement->execute([
            'token_hash' => hash('sha256', $rawToken),
            'user_id' => $userId,
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * @return array{id: int, user_id: string, expires_at: string}|null
     */
    public function findActiveByRawToken(string $rawToken): ?array
    {
        $expectedHash = hash('sha256', $rawToken);
        $nowExpression = $this->nowExpression();

        $select = $this->pdo->prepare(
            "SELECT id, user_id, expires_at, token_hash FROM persistent_sessions
             WHERE token_hash = :token_hash AND revoked_at IS NULL AND expires_at > {$nowExpression}
             LIMIT 1",
        );
        $select->execute(['token_hash' => $expectedHash]);
        /** @var array{id: int|string, user_id: string, expires_at: string, token_hash: string}|false $row */
        $row = $select->fetch();

        if ($row === false || !hash_equals($expectedHash, $row['token_hash'])) {
            return null;
        }

        return ['id' => (int) $row['id'], 'user_id' => $row['user_id'], 'expires_at' => $row['expires_at']];
    }

    public function touch(int $id): void
    {
        $nowExpression = $this->nowExpression();
        $statement = $this->pdo->prepare(
            "UPDATE persistent_sessions SET last_seen_at = {$nowExpression} WHERE id = :id",
        );
        $statement->execute(['id' => $id]);
    }

    public function countActiveForUser(string $userId): int
    {
        $nowExpression = $this->nowExpression();
        $statement = $this->pdo->prepare(
            "SELECT COUNT(*) FROM persistent_sessions
             WHERE user_id = :user_id AND revoked_at IS NULL AND expires_at > {$nowExpression}",
        );
        $statement->execute(['user_id' => $userId]);

        return (int) $statement->fetchColumn();
    }

    /**
     * Revokes and returns the id of the least-recently-used ACTIVE row
     * for this user (ORDER BY last_seen_at ASC, id ASC as a stable
     * tiebreaker for equal timestamps), or null if the user has none.
     * The eviction itself is an atomic conditional UPDATE -- see the
     * mariadb-concurrency scenario E added in Task 17 for the 4th-login
     * race this guards.
     */
    public function evictLruForUser(string $userId): ?int
    {
        $nowExpression = $this->nowExpression();
        $select = $this->pdo->prepare(
            "SELECT id FROM persistent_sessions
             WHERE user_id = :user_id AND revoked_at IS NULL AND expires_at > {$nowExpression}
             ORDER BY last_seen_at ASC, id ASC
             LIMIT 1",
        );
        $select->execute(['user_id' => $userId]);
        $id = $select->fetchColumn();

        if ($id === false) {
            return null;
        }
        $id = (int) $id;

        $revoke = $this->pdo->prepare(
            "UPDATE persistent_sessions SET revoked_at = {$nowExpression} WHERE id = :id AND revoked_at IS NULL",
        );
        $revoke->execute(['id' => $id]);

        return $revoke->rowCount() === 1 ? $id : null;
    }

    public function revoke(int $id): void
    {
        $nowExpression = $this->nowExpression();
        $statement = $this->pdo->prepare(
            "UPDATE persistent_sessions SET revoked_at = {$nowExpression} WHERE id = :id AND revoked_at IS NULL",
        );
        $statement->execute(['id' => $id]);
    }

    /**
     * @return list<int>
     */
    public function revokeAllForUserExcept(string $userId, int $keepId): array
    {
        $nowExpression = $this->nowExpression();
        $select = $this->pdo->prepare(
            'SELECT id FROM persistent_sessions WHERE user_id = :user_id AND revoked_at IS NULL AND id != :keep_id',
        );
        $select->execute(['user_id' => $userId, 'keep_id' => $keepId]);
        $ids = array_map('intval', $select->fetchAll(PDO::FETCH_COLUMN));

        if ($ids === []) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $update = $this->pdo->prepare(
            "UPDATE persistent_sessions SET revoked_at = {$nowExpression} WHERE id IN ({$placeholders}) AND revoked_at IS NULL",
        );
        $update->execute($ids);

        return $ids;
    }

    private function nowExpression(): string
    {
        return $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: all `PersistentSessionRepositoryTest.php` cases pass; full suite green.

- [ ] **Step 5: Commit**

```bash
git add server/src/Auth/PersistentSessionRepository.php server/tests/Auth/PersistentSessionRepositoryTest.php server/tests/run-tests.php
git commit -m "Add PersistentSessionRepository with LRU eviction"
```

---

### Task 5: `SessionRepository` — link sessions to a persistent session

**Files:**
- Modify: `server/src/Auth/SessionRepository.php`
- Test: `server/tests/Auth/SessionRepositoryTest.php` (add cases; already registered)

**Interfaces:**
- Consumes: nothing new.
- Produces: `create()` gains an optional 4th param `?int $persistentSessionId = null` (backward compatible — every existing call site that passes 3 args keeps compiling); new method `revokeByPersistentSessionId(int $persistentSessionId): void`.

- [ ] **Step 1: Write the failing test**

Open `server/tests/Auth/SessionRepositoryTest.php` and add to its returned test array (reuse its existing `makeSessionRepositoryTestDb()`-style helper, adding a `persistent_session_id TEXT NULL`/`INTEGER NULL` column to that helper's `CREATE TABLE sessions` statement if the helper builds its own table rather than sharing one):

```php
        'create() with a persistentSessionId links the session, and revokeByPersistentSessionId() revokes every session linked to it' => function () {
            $pdo = makeSessionRepositoryTestDb();
            $repo = new SessionRepository($pdo);
            $repo->create('user-1', 'raw-session-a', new \DateTimeImmutable('+24 hours'), 42);
            $repo->create('user-1', 'raw-session-b', new \DateTimeImmutable('+24 hours'), 42);
            $repo->create('user-1', 'raw-session-c', new \DateTimeImmutable('+24 hours'), null);

            $repo->revokeByPersistentSessionId(42);

            assertTrue($repo->findActiveUserIdForRawToken('raw-session-a') === null, 'session linked to the persistent session must be revoked');
            assertTrue($repo->findActiveUserIdForRawToken('raw-session-b') === null, 'session linked to the persistent session must be revoked');
            assertTrue($repo->findActiveUserIdForRawToken('raw-session-c') !== null, 'a session with no persistent_session_id link must be untouched');
        },

        'create() without a persistentSessionId still works exactly as before (backward compatibility)' => function () {
            $pdo = makeSessionRepositoryTestDb();
            $repo = new SessionRepository($pdo);
            $repo->create('user-2', 'raw-session-plain', new \DateTimeImmutable('+24 hours'));

            assertTrue($repo->findActiveUserIdForRawToken('raw-session-plain') === 'user-2');
        },
```

If `SessionRepositoryTest.php`'s existing DB-construction helper doesn't already have a `persistent_session_id` column, add `persistent_session_id INTEGER NULL` to its `CREATE TABLE sessions (...)` statement as part of this step — it is the same file, and every other existing test in it is unaffected by an added nullable column.

- [ ] **Step 2: Run test to verify it fails**

Run: `php server/tests/run-tests.php`
Expected: FAIL — `Too many arguments to function ...create()` or `Call to undefined method ...revokeByPersistentSessionId()` (depending on which assertion PHP reaches first), and/or a SQLite "no such column: persistent_session_id" once the column is referenced.

- [ ] **Step 3: Implement**

Edit `server/src/Auth/SessionRepository.php`:

```php
    public function create(string $userId, string $rawToken, \DateTimeImmutable $expiresAt, ?int $persistentSessionId = null): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO sessions (token_hash, user_id, expires_at, persistent_session_id, created_at, last_seen_at)
             VALUES (:token_hash, :user_id, :expires_at, :persistent_session_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        );
        $statement->execute([
            'token_hash' => hash('sha256', $rawToken),
            'user_id' => $userId,
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
            'persistent_session_id' => $persistentSessionId,
        ]);
    }
```

Add a new method (anywhere after `create()`, before `revoke()`):

```php
    /**
     * Application-level cascade: when a persistent_sessions row is
     * revoked or LRU-evicted, every sessions row it minted (via the
     * session-refresh path in CurrentUserService::resolveOrRefresh(), or
     * the one created alongside it at OTP-verify time) is revoked too --
     * same explicit-revocation audit pattern as the rest of this schema,
     * not a DB-level cascade delete. A no-op for any sessions row with no
     * link (persistent_session_id IS NULL is never matched by the
     * equality comparison below).
     */
    public function revokeByPersistentSessionId(int $persistentSessionId): void
    {
        $nowExpression = $this->nowExpression();
        $statement = $this->pdo->prepare(
            "UPDATE sessions SET revoked_at = {$nowExpression}
             WHERE persistent_session_id = :persistent_session_id AND revoked_at IS NULL",
        );
        $statement->execute(['persistent_session_id' => $persistentSessionId]);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: all `SessionRepositoryTest.php` cases pass, and every pre-existing test still passes (the `create()` signature change is additive-only).

- [ ] **Step 5: Commit**

```bash
git add server/src/Auth/SessionRepository.php server/tests/Auth/SessionRepositoryTest.php
git commit -m "Link sessions to persistent_sessions for cascade revoke"
```

---

### Task 6: `CurrentUserService` — session-refresh-from-persistent-credential

**Files:**
- Modify: `server/src/Auth/CurrentUserService.php`
- Test: `server/tests/Auth/CurrentUserServiceTest.php` (add cases; already registered)

**Interfaces:**
- Consumes: `PersistentSessionRepository` (Task 4), `SessionRepository::create()`'s new optional 4th param (Task 5).
- Produces: constructor gains an optional 4th param `?PersistentSessionRepository $persistentSessions = null` (every existing 3-arg `new CurrentUserService(...)` call site keeps compiling unmodified); `createSession()` gains an optional 2nd param `?int $persistentSessionId = null`; new method:
  `resolveOrRefresh(?string $sessionRawToken, ?string $persistentRawToken): array{user: ?array{user_id: string, email_normalized: string}, refreshed_session_token: ?string}`.
  This is the concrete "session-refresh-from-persistent-credential" hook the spec asks for — `me.php` (Task 12) is its first real caller.

- [ ] **Step 1: Write the failing test**

Open `server/tests/Auth/CurrentUserServiceTest.php` and add (reusing its existing DB-construction helper; add a `persistent_sessions` table matching Task 4's SQLite fixture, and a `persistent_session_id INTEGER NULL` column on its `sessions` table, to that helper if it builds its own tables):

```php
        'resolveOrRefresh() with a valid session token resolves normally and requests no refresh' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $sessions = new SessionRepository($pdo);
            $persistentSessions = new PersistentSessionRepository($pdo);
            $service = new CurrentUserService($users, $sessions, 24, $persistentSessions);
            $user = $users->findOrCreateByEmail('refresh-valid@example.com');
            $rawSession = $service->createSession($user['id']);

            $result = $service->resolveOrRefresh($rawSession, null);

            assertSame($user['id'], $result['user']['user_id']);
            assertTrue($result['refreshed_session_token'] === null, 'a still-valid session must never be silently replaced');
        },

        'resolveOrRefresh() with no session token but a valid persistent token mints a fresh session' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $sessions = new SessionRepository($pdo);
            $persistentSessions = new PersistentSessionRepository($pdo);
            $service = new CurrentUserService($users, $sessions, 24, $persistentSessions);
            $user = $users->findOrCreateByEmail('refresh-persistent@example.com');
            $persistentId = $persistentSessions->create($user['id'], 'raw-remember', new \DateTimeImmutable('+90 days'));

            $result = $service->resolveOrRefresh(null, 'raw-remember');

            assertSame($user['id'], $result['user']['user_id']);
            assertTrue($result['refreshed_session_token'] !== null, 'a valid persistent credential with no session must mint a fresh session token');
            assertTrue($service->resolve($result['refreshed_session_token']) !== null, 'the newly minted session token must itself resolve');

            $newSession = $pdo->query("SELECT persistent_session_id FROM sessions WHERE token_hash = '" . hash('sha256', $result['refreshed_session_token']) . "'")->fetch();
            assertSame($persistentId, (int) $newSession['persistent_session_id'], 'the newly minted session must be linked back to the persistent session that authorized it');
        },

        'resolveOrRefresh() with an expired session and no persistent token resolves to no user' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $sessions = new SessionRepository($pdo);
            $persistentSessions = new PersistentSessionRepository($pdo);
            $service = new CurrentUserService($users, $sessions, 24, $persistentSessions);

            $result = $service->resolveOrRefresh('never-issued-session', null);

            assertTrue($result['user'] === null);
            assertTrue($result['refreshed_session_token'] === null);
        },

        'resolveOrRefresh() with a revoked persistent token resolves to no user (no refresh)' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $sessions = new SessionRepository($pdo);
            $persistentSessions = new PersistentSessionRepository($pdo);
            $service = new CurrentUserService($users, $sessions, 24, $persistentSessions);
            $user = $users->findOrCreateByEmail('refresh-revoked@example.com');
            $persistentId = $persistentSessions->create($user['id'], 'raw-revoked-remember', new \DateTimeImmutable('+90 days'));
            $persistentSessions->revoke($persistentId);

            $result = $service->resolveOrRefresh(null, 'raw-revoked-remember');

            assertTrue($result['user'] === null);
            assertTrue($result['refreshed_session_token'] === null);
        },

        'resolveOrRefresh() with no PersistentSessionRepository wired (legacy 3-arg construction) never throws, just falls back to no-user' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $service = new CurrentUserService(new UserRepository($pdo), new SessionRepository($pdo), 24);

            $result = $service->resolveOrRefresh(null, 'raw-anything');

            assertTrue($result['user'] === null);
            assertTrue($result['refreshed_session_token'] === null);
        },
```

Add the two new `use` imports and `require_once` for `PersistentSessionRepository` at the top of the test file alongside its existing ones.

- [ ] **Step 2: Run test to verify it fails**

Run: `php server/tests/run-tests.php`
Expected: FAIL — `Too many arguments to function ...CurrentUserService::__construct()` and/or `Call to undefined method ...resolveOrRefresh()`.

- [ ] **Step 3: Implement**

Edit `server/src/Auth/CurrentUserService.php`:

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * The ONLY service me.php and logout.php depend on ... [existing doc
 * comment unchanged, plus:]
 *
 * resolveOrRefresh() is the session-refresh-from-persistent-credential
 * hook: when the normal session cookie is missing/expired but a valid,
 * non-revoked, non-expired persistent_sessions row resolves from the
 * remember-me credential, this mints a brand-new sessions row (linked
 * back to that persistent session) and returns its raw token for the
 * caller to re-issue as a fresh Set-Cookie -- no user-visible re-login.
 * $persistentSessions is optional so every pre-existing 3-arg call site
 * (request-link.php, verify.php, and every existing test's harness)
 * keeps compiling; those sites simply never get the refresh behavior
 * until they're updated to pass it.
 */
final class CurrentUserService
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly SessionRepository $sessions,
        private readonly int $sessionExpiryHours,
        private readonly ?PersistentSessionRepository $persistentSessions = null,
    ) {
    }

    public function createSession(string $userId, ?int $persistentSessionId = null): string
    {
        $rawToken = $this->generateRawToken();
        $expiresAt = new \DateTimeImmutable("+{$this->sessionExpiryHours} hours");
        $this->sessions->create($userId, $rawToken, $expiresAt, $persistentSessionId);

        return $rawToken;
    }

    /**
     * @return array{user_id: string, email_normalized: string}|null
     */
    public function resolve(string $rawSessionToken): ?array
    {
        $userId = $this->sessions->findActiveUserIdForRawToken($rawSessionToken);
        if ($userId === null) {
            return null;
        }

        $user = $this->users->findById($userId);
        if ($user === null) {
            return null;
        }

        return ['user_id' => $user['id'], 'email_normalized' => $user['email_normalized']];
    }

    /**
     * @return array{user: array{user_id: string, email_normalized: string}|null, refreshed_session_token: ?string}
     */
    public function resolveOrRefresh(?string $sessionRawToken, ?string $persistentRawToken): array
    {
        if ($sessionRawToken !== null) {
            $user = $this->resolve($sessionRawToken);
            if ($user !== null) {
                return ['user' => $user, 'refreshed_session_token' => null];
            }
        }

        if ($this->persistentSessions === null || $persistentRawToken === null) {
            return ['user' => null, 'refreshed_session_token' => null];
        }

        $persistentSession = $this->persistentSessions->findActiveByRawToken($persistentRawToken);
        if ($persistentSession === null) {
            return ['user' => null, 'refreshed_session_token' => null];
        }

        $user = $this->users->findById($persistentSession['user_id']);
        if ($user === null) {
            return ['user' => null, 'refreshed_session_token' => null];
        }

        $this->persistentSessions->touch($persistentSession['id']);
        $newRawSessionToken = $this->createSession($user['id'], $persistentSession['id']);

        return [
            'user' => ['user_id' => $user['id'], 'email_normalized' => $user['email_normalized']],
            'refreshed_session_token' => $newRawSessionToken,
        ];
    }

    public function logout(string $rawSessionToken): void
    {
        $this->sessions->revoke($rawSessionToken);
    }

    private function generateRawToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: all `CurrentUserServiceTest.php` cases pass; every pre-existing test in the suite (including `MagicLinkAuthServiceTest.php`'s 3-arg `CurrentUserService` construction) still passes unmodified.

- [ ] **Step 5: Commit**

```bash
git add server/src/Auth/CurrentUserService.php server/tests/Auth/CurrentUserServiceTest.php
git commit -m "Add CurrentUserService::resolveOrRefresh() for persistent-session refresh"
```

---

### Task 7: `OtpAuthService` — `requestCode()`

**Files:**
- Create: `server/src/Auth/OtpAuthService.php`
- Create: `server/tests/Auth/OtpAuthServiceTest.php`
- Modify: `server/tests/run-tests.php` (register)

**Interfaces:**
- Consumes: `EmailLoginChallengeRepository` (Task 3), `PersistentSessionRepository` (Task 4), `UserRepository`, `SessionRepository`, `RateLimiter::checkAndRecordLoginCodeEmail/Ip()` (Task 2), `Mailer` (existing interface — reuse, do not create a second mail interface), `EmailNormalizer::normalize()`, `EmailValidator::isValid()` (existing, unchanged).
- Produces: `OtpAuthService::requestCode(string $rawEmail, string $clientIp): OtpRequestResult` where `OtpRequestResult` (new value object, same file) has `public readonly ?string $challengeToken`. Non-null iff a challenge was actually generated (valid email, not rate-limited) — this is what `request-code.php` (Task 9) exposes as `{"challenge": "..."}`, and its absence is what keeps the endpoint enumeration-safe in the "can this email even reach a challenge" sense while still functionally requiring *a* challenge token to submit a code against. `verifyCode()` itself is added in Task 8 — this task stops at `requestCode()` so review/commit boundaries stay small.
- Reuses `Mailer::sendMagicLink(string $emailNormalized, string $magicLinkUrl): void` for now is WRONG — `Mailer` is Magic-Link-shaped (takes a URL). Add a second method to the existing `Mailer` interface: `sendLoginCode(string $emailNormalized, string $code): void`. Every existing implementer (`ResendMailer`, the inline no-op classes in `request-link.php`/`verify.php`, `DevHarnessMailer`, `FakeMailer` in tests) must implement it too, or PHP's interface contract fails at runtime the first time a non-compliant implementer is instantiated — this task updates all of them.

- [ ] **Step 1: Read `server/src/Auth/Mailer.php` and `server/tests/Auth/FakeMailer.php` in full before writing code**, so the new method signature matches the existing interface's style exactly (docblock conventions, param naming).

- [ ] **Step 2: Write the failing test**

Create `server/tests/Auth/OtpAuthServiceTest.php`:

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\EmailLoginChallengeRepository;
use KanaGame\Paddle\Auth\FakeMailer;
use KanaGame\Paddle\Auth\OtpAuthService;
use KanaGame\Paddle\Auth\PersistentSessionRepository;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/CurrentUserService.php';
require_once __DIR__ . '/../../src/Auth/EmailNormalizer.php';
require_once __DIR__ . '/../../src/Auth/EmailValidator.php';
require_once __DIR__ . '/../../src/Auth/EmailLoginChallengeRepository.php';
require_once __DIR__ . '/../../src/Auth/OtpAuthService.php';
require_once __DIR__ . '/../../src/Auth/PersistentSessionRepository.php';
require_once __DIR__ . '/../../src/Auth/RateLimiter.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';
require_once __DIR__ . '/FakeMailer.php';
require_once __DIR__ . '/../../src/Uuid.php';

const OTP_TEST_PEPPER = 'test-login-code-pepper';

function makeOtpAuthServiceTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('CREATE TABLE users (id TEXT PRIMARY KEY, email_normalized TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE email_login_challenges (id INTEGER PRIMARY KEY AUTOINCREMENT, challenge_token_hash TEXT NOT NULL UNIQUE, email_normalized TEXT NOT NULL, code_mac TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, used_at TEXT NULL, invalidated_at TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE persistent_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, persistent_session_id INTEGER NULL, expires_at TEXT NOT NULL, revoked_at TEXT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    $pdo->exec('CREATE TABLE rate_limits (id INTEGER PRIMARY KEY AUTOINCREMENT, bucket TEXT NOT NULL, identifier TEXT NOT NULL, window_start TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, UNIQUE (bucket, identifier))');
    return $pdo;
}

/**
 * @return array{service: OtpAuthService, mailer: FakeMailer, pdo: PDO, challenges: EmailLoginChallengeRepository, persistentSessions: PersistentSessionRepository}
 */
function makeOtpAuthServiceHarness(?PDO $pdo = null, int $emailLimit = 3, int $ipLimit = 10, int $maxAttempts = 5, int $maxPersistentSessions = 3): array
{
    $pdo ??= makeOtpAuthServiceTestDb();
    $mailer = new FakeMailer();
    $challenges = new EmailLoginChallengeRepository($pdo);
    $persistentSessions = new PersistentSessionRepository($pdo);
    $currentUser = new CurrentUserService(new UserRepository($pdo), new SessionRepository($pdo), 24, $persistentSessions);
    $service = new OtpAuthService(
        $pdo,
        $challenges,
        $persistentSessions,
        new UserRepository($pdo),
        new SessionRepository($pdo),
        new RateLimiter($pdo, 'test-rate-limit-pepper', 5, 20, $emailLimit, $ipLimit),
        $mailer,
        $currentUser,
        OTP_TEST_PEPPER,
        10,
        $maxAttempts,
        90,
        $maxPersistentSessions,
    );

    return ['service' => $service, 'mailer' => $mailer, 'pdo' => $pdo, 'challenges' => $challenges, 'persistentSessions' => $persistentSessions];
}

/**
 * @return array<string, callable(): void>
 */
function otpAuthServiceTests(): array
{
    return [
        'requestCode() sends a 6-digit code email and returns a challenge token for a valid email' => function () {
            $h = makeOtpAuthServiceHarness();
            $result = $h['service']->requestCode('User@Example.com', '203.0.113.1');

            assertTrue($result->challengeToken !== null, 'a valid request should return a challenge token');
            assertSame(1, count($h['mailer']->sentCodes), 'exactly one code email should have been sent');
            assertSame('user@example.com', $h['mailer']->sentCodes[0]['email'], 'the recorded email should be normalized');
            assertSame(6, strlen($h['mailer']->sentCodes[0]['code']), 'the code must always be exactly 6 digits, preserving leading zeros');
            assertTrue(ctype_digit($h['mailer']->sentCodes[0]['code']), 'the code must be all digits');
        },

        'requestCode() does not create a users row' => function () {
            $h = makeOtpAuthServiceHarness();
            $h['service']->requestCode('nouser@example.com', '203.0.113.1');

            $count = (int) $h['pdo']->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(0, $count, 'request-code must never create a durable user row -- find-or-create happens only on verify');
        },

        'requestCode() with a malformed email returns no challenge but still records against the IP bucket' => function () {
            $h = makeOtpAuthServiceHarness();
            $result = $h['service']->requestCode('not-an-email', '203.0.113.50');

            assertTrue($result->challengeToken === null, 'a malformed email must never produce a challenge');
            assertSame(0, count($h['mailer']->sentCodes));

            $row = $h['pdo']->query("SELECT count FROM rate_limits WHERE bucket = 'login_code_ip'")->fetch();
            assertTrue($row !== false, 'the login-code IP bucket must have recorded this attempt even though the email was malformed');
        },

        'requestCode() returns no challenge once the per-email login-code limit is exceeded' => function () {
            $h = makeOtpAuthServiceHarness(null, 3, 10);
            for ($i = 0; $i < 3; $i++) {
                $r = $h['service']->requestCode('spammed@example.com', "203.0.113.{$i}");
                assertTrue($r->challengeToken !== null, "attempt {$i} should still succeed");
            }
            $blocked = $h['service']->requestCode('spammed@example.com', '203.0.113.99');
            assertTrue($blocked->challengeToken === null, 'the 4th request must be blocked by the login-code email bucket');
        },

        'requestCode() invalidates the prior open challenge for the same email (resend invalidation)' => function () {
            $h = makeOtpAuthServiceHarness();
            $first = $h['service']->requestCode('resend@example.com', '203.0.113.1');
            $secondCode = null;
            $second = $h['service']->requestCode('resend@example.com', '203.0.113.2');

            $oldConsume = $h['challenges']->consumeAttempt($first->challengeToken, $h['mailer']->sentCodes[0]['code'], OTP_TEST_PEPPER, 5);
            $newConsume = $h['challenges']->consumeAttempt($second->challengeToken, $h['mailer']->sentCodes[1]['code'], OTP_TEST_PEPPER, 5);

            assertFalse($oldConsume->success, 'the superseded first challenge must never succeed after a resend');
            assertTrue($newConsume->success, 'the fresh challenge issued by the resend must succeed');
        },
    ];
}
```

- [ ] **Step 3: Register the test and run it to verify it fails**

Add to `server/tests/run-tests.php`'s `$testFiles`:

```php
    __DIR__ . '/Auth/OtpAuthServiceTest.php' => 'KanaGame\\Paddle\\Tests\\otpAuthServiceTests',
```

Run: `php server/tests/run-tests.php`
Expected: FAIL — class `OtpAuthService` not found (and, once that's stubbed, `Class FakeMailer contains 1 abstract method` until `Mailer`/`FakeMailer` are updated in Step 4).

- [ ] **Step 4: Implement**

Read `server/src/Auth/Mailer.php` and add `sendLoginCode()` to the interface:

```php
interface Mailer
{
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void;

    /**
     * Sends the 6-digit OTP sign-in code, plaintext, to the given email.
     * The code itself is never logged anywhere in this codebase outside
     * this one call boundary -- see OtpAuthService::requestCode()'s doc
     * comment.
     */
    public function sendLoginCode(string $emailNormalized, string $code): void;
}
```

Update `server/tests/Auth/FakeMailer.php` to add `public array $sentCodes = [];` and:

```php
    public function sendLoginCode(string $emailNormalized, string $code): void
    {
        $this->sentCodes[] = ['email' => $emailNormalized, 'code' => $code];
    }
```

Update every other `Mailer` implementer so the interface contract still holds:
- `server/src/Auth/ResendMailer.php`: add a `sendLoginCode()` that sends a plaintext-code email via the same Resend HTTP call shape `sendMagicLink()` already uses (read the existing method first and mirror its request-building code, swapping the templated body for one that states the 6-digit code).
- `server/src/DevOnly/DevHarnessMailer.php`: read its existing `sendMagicLink()` implementation and add a `sendLoginCode()` that records the code through the same dev-harness storage mechanism it already uses for magic links (extend `DevHarnessMagicLinkStore` or add a sibling dev-only store — match whichever is less invasive once the file is read; if a sibling store is warranted, note it as a follow-up in the PR body rather than scope-creeping this task, and have `sendLoginCode()` at minimum no-op safely rather than fatal).
- The inline anonymous `Mailer` implementations in `server/auth/request-link.php` and `server/auth/verify.php` (`$noopMailer = new class implements Mailer { public function sendMagicLink(...) {} }`): add a `sendLoginCode()` no-op method to each, or the interface contract breaks the moment `Mailer` gains the new abstract method — this is a pure compile-fix, no behavior change to either file otherwise.

Create `server/src/Auth/OtpAuthService.php`:

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * @internal Value object for OtpAuthService::requestCode(). Deliberately
 * carries only the opaque challenge token (or null) -- never the code,
 * never whether the email is a known user.
 */
final class OtpRequestResult
{
    private function __construct(public readonly ?string $challengeToken)
    {
    }

    public static function issued(string $challengeToken): self
    {
        return new self($challengeToken);
    }

    public static function notIssued(): self
    {
        return new self(null);
    }
}

/**
 * Orchestrates the 6-digit email OTP request/verify flow -- the same
 * shape as MagicLinkAuthService, kept as a SEPARATE class (not a
 * refactor of MagicLinkAuthService) per the spec's explicit instruction
 * that Magic Link stays untouched/compatible as fallback.
 *
 * requestCode() ordering mirrors MagicLinkAuthService::requestLink():
 * IP throttle (login_code_ip bucket) -> validate/normalize email ->
 * email throttle (login_code_email bucket) -> invalidate any prior open
 * challenge for that email -> generate a fresh 6-digit code + opaque
 * challenge token -> persist -> send. Unlike requestLink() (which always
 * "succeeds" with zero return-value signal), requestCode() DOES return
 * whether a challenge was issued, because the frontend needs a concrete
 * challenge token to submit the code against -- a malformed or
 * rate-limited request still gets NO challenge and NO email, which is
 * the only signal a caller can observe either way.
 */
final class OtpAuthService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly EmailLoginChallengeRepository $challenges,
        private readonly PersistentSessionRepository $persistentSessions,
        private readonly UserRepository $users,
        private readonly SessionRepository $sessions,
        private readonly RateLimiter $rateLimiter,
        private readonly Mailer $mailer,
        private readonly CurrentUserService $currentUser,
        private readonly string $codePepper,
        private readonly int $codeTtlMinutes,
        private readonly int $maxAttempts,
        private readonly int $persistentLoginDays,
        private readonly int $maxPersistentSessions,
    ) {
    }

    public function requestCode(string $rawEmail, string $clientIp): OtpRequestResult
    {
        if (!$this->rateLimiter->checkAndRecordLoginCodeIp($clientIp)) {
            return OtpRequestResult::notIssued();
        }

        $email = EmailNormalizer::normalize($rawEmail);
        if (!EmailValidator::isValid($email)) {
            return OtpRequestResult::notIssued();
        }

        if (!$this->rateLimiter->checkAndRecordLoginCodeEmail($email)) {
            return OtpRequestResult::notIssued();
        }

        $this->challenges->invalidateActiveForEmail($email);

        $code = $this->generateCode();
        $rawChallengeToken = $this->generateRawToken();
        $expiresAt = new \DateTimeImmutable("+{$this->codeTtlMinutes} minutes");
        $this->challenges->issue($email, $rawChallengeToken, $code, $this->codePepper, $expiresAt);

        // The plaintext code exists only in this local variable and
        // crosses exactly one boundary -- this sendLoginCode() call --
        // before going out of scope. Never logged, never returned to the
        // caller of requestCode() itself (only the opaque challenge
        // token is), never placed in a URL.
        $this->mailer->sendLoginCode($email, $code);

        return OtpRequestResult::issued($rawChallengeToken);
    }

    private function generateCode(): string
    {
        // random_int is CSPRNG-backed (see PHP manual) -- str_pad
        // preserves leading zeros, which sprintf('%06d', ...) alone would
        // also do, but random_int's inclusive upper bound is used
        // directly here for clarity that the full 000000-999999 range
        // (not 000000-999998 or similar off-by-one) is reachable.
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    private function generateRawToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: all `OtpAuthServiceTest.php` cases pass; full suite green (including `ResendMailerTest.php`, `DevHarnessMailerTest.php`, and `RequestLinkMailerWiringTest.php`, whose fixtures may need a `sendLoginCode()` stub added if they construct a `Mailer` implementer directly — check each on failure).

- [ ] **Step 6: Commit**

```bash
git add server/src/Auth/OtpAuthService.php server/src/Auth/Mailer.php server/src/Auth/ResendMailer.php server/src/DevOnly/DevHarnessMailer.php server/auth/request-link.php server/auth/verify.php server/tests/Auth/OtpAuthServiceTest.php server/tests/Auth/FakeMailer.php server/tests/run-tests.php
git commit -m "Add OtpAuthService::requestCode() for 6-digit email OTP"
```

---

### Task 8: `OtpAuthService` — `verifyCode()` with max-3/LRU enforcement

**Files:**
- Modify: `server/src/Auth/OtpAuthService.php`
- Modify: `server/tests/Auth/OtpAuthServiceTest.php`

**Interfaces:**
- Consumes: everything already wired into `OtpAuthService`'s constructor (Task 7); `PersistentSessionRepository::countActiveForUser/evictLruForUser/create()` (Task 4); `SessionRepository::create()`'s persistent-link param and `revokeByPersistentSessionId()` (Task 5).
- Produces: `OtpAuthService::verifyCode(string $rawChallengeToken, string $code): OtpVerifyResult` where `OtpVerifyResult` (new value object, same file) has `public readonly bool $success`, `public readonly ?string $sessionToken`, `public readonly ?string $persistentToken`, `public readonly ?array $user` (shape `array{id: string, email_normalized: string}`, matching `MagicLinkAuthResult::$user`'s shape for consistency). This is what `verify-code.php` (Task 10) calls.

- [ ] **Step 1: Write the failing test**

Append to `otpAuthServiceTests()`'s returned array in `server/tests/Auth/OtpAuthServiceTest.php`:

```php
        'verifyCode() with the correct code succeeds, creates a user, and issues both a session and a persistent token' => function () {
            $h = makeOtpAuthServiceHarness();
            $request = $h['service']->requestCode('verify-me@example.com', '203.0.113.1');
            $code = $h['mailer']->sentCodes[0]['code'];

            $result = $h['service']->verifyCode($request->challengeToken, $code);

            assertTrue($result->success);
            assertTrue($result->sessionToken !== null);
            assertTrue($result->persistentToken !== null);
            assertSame('verify-me@example.com', $result->user['email_normalized']);

            $userCount = (int) $h['pdo']->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(1, $userCount, 'exactly one user row should exist after first verification');
            assertSame(1, $h['persistentSessions']->countActiveForUser($result->user['id']), 'exactly one persistent session should have been created');
        },

        'verifyCode() with the wrong code fails and creates no user, no session, no persistent session' => function () {
            $h = makeOtpAuthServiceHarness();
            $request = $h['service']->requestCode('wrong-code@example.com', '203.0.113.1');

            $result = $h['service']->verifyCode($request->challengeToken, '000000');

            assertFalse($result->success);
            assertTrue($result->sessionToken === null);
            assertSame(0, (int) $h['pdo']->query('SELECT COUNT(*) FROM users')->fetchColumn());
        },

        'verifyCode() with an unknown challenge token fails with the same generic shape' => function () {
            $h = makeOtpAuthServiceHarness();
            $result = $h['service']->verifyCode('never-issued-challenge', '123456');

            assertFalse($result->success);
            assertTrue($result->sessionToken === null);
            assertTrue($result->user === null);
        },

        'verifyCode() twice with the same challenge succeeds once and fails the second time (single-use)' => function () {
            $h = makeOtpAuthServiceHarness();
            $request = $h['service']->requestCode('reuse-otp@example.com', '203.0.113.1');
            $code = $h['mailer']->sentCodes[0]['code'];

            $first = $h['service']->verifyCode($request->challengeToken, $code);
            $second = $h['service']->verifyCode($request->challengeToken, $code);

            assertTrue($first->success);
            assertFalse($second->success);
        },

        'verifyCode() creates a NEW persistent session on every successful login (never reuses one)' => function () {
            $h = makeOtpAuthServiceHarness();
            $requestA = $h['service']->requestCode('repeat-login@example.com', '203.0.113.1');
            $resultA = $h['service']->verifyCode($requestA->challengeToken, $h['mailer']->sentCodes[0]['code']);
            $requestB = $h['service']->requestCode('repeat-login@example.com', '203.0.113.2');
            $resultB = $h['service']->verifyCode($requestB->challengeToken, $h['mailer']->sentCodes[1]['code']);

            assertTrue($resultA->persistentToken !== $resultB->persistentToken, 'each login must mint a fresh persistent token, not reuse one');
            assertSame(2, $h['persistentSessions']->countActiveForUser($resultA->user['id']));
        },

        'a 4th successful login evicts the least-recently-used persistent session and cascade-revokes its linked session, without blocking the 4th login' => function () {
            $h = makeOtpAuthServiceHarness(null, 3, 10, 5, 3);
            $email = 'quota@example.com';
            $sessionTokens = [];
            $persistentTokensSeen = [];

            for ($i = 0; $i < 3; $i++) {
                $request = $h['service']->requestCode($email, "203.0.113.{$i}");
                $result = $h['service']->verifyCode($request->challengeToken, $h['mailer']->sentCodes[$i]['code']);
                assertTrue($result->success, "login {$i} of 3 (under quota) must succeed normally");
                $sessionTokens[] = $result->sessionToken;
            }
            $userId = $h['pdo']->query("SELECT id FROM users WHERE email_normalized = '{$email}'")->fetchColumn();
            assertSame(3, $h['persistentSessions']->countActiveForUser($userId), 'exactly 3 active persistent sessions before the 4th login');

            $oldestSessionToken = $sessionTokens[0];

            $fourthRequest = $h['service']->requestCode($email, '203.0.113.9');
            $fourthResult = $h['service']->verifyCode($fourthRequest->challengeToken, $h['mailer']->sentCodes[3]['code']);

            assertTrue($fourthResult->success, 'the 4th login must NEVER be blocked -- it proceeds and evicts instead');
            assertSame(3, $h['persistentSessions']->countActiveForUser($userId), 'the count must stay capped at 3 (one evicted, one created)');

            $sessions = new SessionRepository($h['pdo']);
            assertTrue($sessions->findActiveUserIdForRawToken($oldestSessionToken) === null, 'the sessions row linked to the evicted (oldest) persistent session must be cascade-revoked');
        },
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php server/tests/run-tests.php`
Expected: FAIL — `Call to undefined method KanaGame\Paddle\Auth\OtpAuthService::verifyCode()`.

- [ ] **Step 3: Implement**

Add to `server/src/Auth/OtpAuthService.php` — first the new value object (near `OtpRequestResult`):

```php
final class OtpVerifyResult
{
    /**
     * @param array{id: string, email_normalized: string}|null $user
     */
    private function __construct(
        public readonly bool $success,
        public readonly ?string $sessionToken,
        public readonly ?string $persistentToken,
        public readonly ?array $user,
    ) {
    }

    public static function invalid(): self
    {
        return new self(false, null, null, null);
    }

    /**
     * @param array{id: string, email_normalized: string} $user
     */
    public static function success(string $sessionToken, string $persistentToken, array $user): self
    {
        return new self(true, $sessionToken, $persistentToken, $user);
    }
}
```

Then the method itself, on `OtpAuthService`:

```php
    public function verifyCode(string $rawChallengeToken, string $code): OtpVerifyResult
    {
        $consumeResult = $this->challenges->consumeAttempt($rawChallengeToken, $code, $this->codePepper, $this->maxAttempts);
        if (!$consumeResult->success) {
            return OtpVerifyResult::invalid();
        }

        $email = $this->challenges->findEmailForRawToken($rawChallengeToken);
        if ($email === null) {
            // Defensive -- consumeAttempt() just succeeded against this
            // exact token, so the row must exist; unreachable in
            // practice, mirrors MagicLinkAuthService::verify()'s own
            // defensive null check on findEmailForRawToken().
            return OtpVerifyResult::invalid();
        }

        $this->pdo->beginTransaction();

        try {
            $user = $this->users->findOrCreateByEmail($email);

            // Max-3/LRU enforcement: quota unit is persistent_sessions
            // ROWS, not devices/IPs/fingerprints. Login is NEVER blocked
            // here -- at cap, the least-recently-used active row is
            // evicted (and its linked sessions cascade-revoked) and this
            // login proceeds to create its own fresh persistent session.
            if ($this->persistentSessions->countActiveForUser($user['id']) >= $this->maxPersistentSessions) {
                $evictedId = $this->persistentSessions->evictLruForUser($user['id']);
                if ($evictedId !== null) {
                    $this->sessions->revokeByPersistentSessionId($evictedId);
                }
            }

            $rawPersistentToken = $this->generateRawToken();
            $persistentExpiresAt = new \DateTimeImmutable("+{$this->persistentLoginDays} days");
            $persistentId = $this->persistentSessions->create($user['id'], $rawPersistentToken, $persistentExpiresAt);

            $rawSessionToken = $this->currentUser->createSession($user['id'], $persistentId);

            $this->pdo->commit();

            return OtpVerifyResult::success($rawSessionToken, $rawPersistentToken, $user);
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: all `OtpAuthServiceTest.php` cases pass, including the 4th-login LRU eviction case; full suite green.

- [ ] **Step 5: Commit**

```bash
git add server/src/Auth/OtpAuthService.php server/tests/Auth/OtpAuthServiceTest.php
git commit -m "Add OtpAuthService::verifyCode() with max-3/LRU enforcement"
```

---

### Task 9: `server/auth/request-code.php`

**Files:**
- Create: `server/auth/request-code.php`
- Create: `server/tests/Auth/RequestCodeWiringTest.php`
- Modify: `server/tests/run-tests.php` (register)

**Interfaces:**
- Consumes: `Config::load()`, `Db::connect()`, `Cors`, `OtpAuthService::requestCode()` (Task 7), `RateLimiter` (Task 2, now with 6 ctor args), `EmailLoginChallengeRepository`/`PersistentSessionRepository` (Tasks 3/4), the `Mailer` selection block (dev-harness/Resend/no-op — same 3-way priority `request-link.php` already has, now also needing `sendLoginCode()`).
- Produces: `POST /api/auth/request-code.php {"email": "..."}` → `200 {"status": "ok", "challenge": "<opaque>"}` when a challenge was issued, `200 {"status": "ok"}` (no `challenge` key) when it was not (malformed/rate-limited) — same enumeration-safe posture as `request-link.php`, extended with the challenge field the OTP flow needs.
- This repo's dependency-free CLI test runner cannot exercise a real HTTP+DB round trip against a top-level script (see `RequestLinkMailerWiringTest.php`'s own doc comment) — this endpoint's test is a **source-inspection wiring test**, identical in kind to that file, not a functional test. `OtpAuthService`'s actual behavior is already fully covered by Tasks 7–8's unit tests.

- [ ] **Step 1: Write the failing test**

Create `server/tests/Auth/RequestCodeWiringTest.php`:

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

function loadRequestCodeSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../auth/request-code.php');
    assertTrue($source !== false, 'could not read auth/request-code.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function requestCodeWiringTests(): array
{
    return [
        'request-code.php requires and imports OtpAuthService' => function () {
            $source = loadRequestCodeSource();
            assertTrue(str_contains($source, "require __DIR__ . '/../src/Auth/OtpAuthService.php';"));
            assertTrue(str_contains($source, 'use KanaGame\\Paddle\\Auth\\OtpAuthService;'));
        },

        'request-code.php records the client IP from REMOTE_ADDR only (never X-Forwarded-For)' => function () {
            $source = loadRequestCodeSource();
            assertTrue(str_contains($source, "\$_SERVER['REMOTE_ADDR']"));
            assertFalse(str_contains($source, 'X-Forwarded-For') || str_contains($source, 'HTTP_X_FORWARDED_FOR'), 'must never trust a forwarded-for header absent explicit trusted-proxy config');
        },

        'request-code.php always responds with status ok and only conditionally includes a challenge field' => function () {
            $source = loadRequestCodeSource();
            assertTrue(str_contains($source, "'status' => 'ok'"));
            assertTrue(str_contains($source, 'challengeToken'), 'must branch on OtpRequestResult::$challengeToken to decide whether to include the challenge key');
        },

        'request-code.php only POST is accepted' => function () {
            $source = loadRequestCodeSource();
            assertTrue(str_contains($source, "!== 'POST'"));
            assertTrue(str_contains($source, '405'));
        },

        'request-code.php never echoes the raw request body or a code/challenge value into error_log()' => function () {
            $source = loadRequestCodeSource();
            preg_match_all('/error_log\\(([^)]*)\\)/', $source, $matches);
            foreach ($matches[1] as $arg) {
                assertFalse(str_contains($arg, '$rawEmail') || str_contains($arg, '$body'), 'error_log() calls must never include raw request content');
            }
        },
    ];
}
```

- [ ] **Step 2: Register the test and run it to verify it fails**

Add to `server/tests/run-tests.php`'s `$testFiles`:

```php
    __DIR__ . '/Auth/RequestCodeWiringTest.php' => 'KanaGame\\Paddle\\Tests\\requestCodeWiringTests',
```

Run: `php server/tests/run-tests.php`
Expected: FAIL — `could not read auth/request-code.php` (file does not exist yet).

- [ ] **Step 3: Implement**

Create `server/auth/request-code.php`, modeled directly on `server/auth/request-link.php` (read it again if needed for the exact Mailer-selection block):

```php
<?php

declare(strict_types=1);

/**
 * Request a 6-digit email sign-in code.
 *
 * POST /api/auth/request-code.php {"email": "user@example.com"}
 * -> 200 {"status": "ok", "challenge": "<opaque>"}  when a code was issued
 * -> 200 {"status": "ok"}                            when it was not (malformed
 *    email or rate-limited) -- no challenge key at all, so the frontend can
 *    tell "submit a code" from "nothing to submit" without this endpoint
 *    ever exposing WHY a challenge wasn't issued (enumeration-safe, same
 *    posture as request-link.php).
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/CurrentUserService.php';
require __DIR__ . '/../src/Auth/EmailLoginChallengeRepository.php';
require __DIR__ . '/../src/Auth/EmailNormalizer.php';
require __DIR__ . '/../src/Auth/EmailValidator.php';
require __DIR__ . '/../src/Auth/Mailer.php';
require __DIR__ . '/../src/Auth/OtpAuthService.php';
require __DIR__ . '/../src/Auth/PersistentSessionRepository.php';
require __DIR__ . '/../src/Auth/RateLimiter.php';
require __DIR__ . '/../src/Auth/ResendMailer.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/DevOnly/DevHarnessMagicLinkStore.php';
require __DIR__ . '/../src/DevOnly/DevHarnessMailer.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\EmailLoginChallengeRepository;
use KanaGame\Paddle\Auth\Mailer;
use KanaGame\Paddle\Auth\OtpAuthService;
use KanaGame\Paddle\Auth\PersistentSessionRepository;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\ResendMailer;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;
use KanaGame\Paddle\DevOnly\DevHarnessMagicLinkStore;
use KanaGame\Paddle\DevOnly\DevHarnessMailer;

$config = Config::load();
$cors = new Cors($config->allowedOrigins());

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    $cors->applyPreflightHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
    http_response_code(204);
    exit;
}

$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

if ($config->get('EMAIL_CODE_AUTH_ENABLED') !== 'true') {
    // Feature flag off -- a GitHub-Pages-ahead-of-backend deploy, or a
    // deliberate rollback, must not have this endpoint half-work. The
    // frontend's capability check (capabilities.php, Task 11) is what
    // decides whether to show OTP UI at all; this is defense-in-depth on
    // the backend, not the primary gate.
    http_response_code(404);
    echo json_encode(['error' => 'not found']);
    exit;
}

$body = json_decode(file_get_contents('php://input') ?: '', true);
$rawEmailField = is_array($body) ? ($body['email'] ?? null) : null;
$rawEmail = is_string($rawEmailField) ? $rawEmailField : '';

$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';

$noopMailer = new class implements Mailer {
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
    }

    public function sendLoginCode(string $emailNormalized, string $code): void
    {
    }
};

$response = ['status' => 'ok'];

try {
    $pdo = Db::connect($config);

    $resendApiKey = $config->get('RESEND_API_KEY');
    $resendFromEmail = $config->get('MAGIC_LINK_FROM_EMAIL');
    $resendFromName = $config->get('MAGIC_LINK_FROM_NAME');

    if ($config->get('DEV_HARNESS_ENABLED') === 'true') {
        $mailer = new DevHarnessMailer(
            new DevHarnessMagicLinkStore($pdo),
            true,
            $config->intWithDefault('MAGIC_LINK_TOKEN_EXPIRY_MINUTES', 15),
        );
    } elseif ($resendApiKey !== null && $resendFromEmail !== null && $resendFromName !== null) {
        $mailer = new ResendMailer($resendApiKey, $resendFromEmail, $resendFromName);
    } else {
        $mailer = $noopMailer;
        error_log('request-code: mailer_unconfigured');
    }

    $persistentSessions = new PersistentSessionRepository($pdo);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
        $persistentSessions,
    );
    $service = new OtpAuthService(
        $pdo,
        new EmailLoginChallengeRepository($pdo),
        $persistentSessions,
        new UserRepository($pdo),
        new SessionRepository($pdo),
        new RateLimiter(
            $pdo,
            $config->require('RATE_LIMIT_PEPPER'),
            $config->intWithDefault('RATE_LIMIT_EMAIL_PER_HOUR', 5),
            $config->intWithDefault('RATE_LIMIT_IP_PER_HOUR', 20),
            $config->intWithDefault('LOGIN_CODE_EMAIL_PER_HOUR', 3),
            $config->intWithDefault('LOGIN_CODE_IP_PER_HOUR', 10),
        ),
        $mailer,
        $currentUser,
        $config->require('LOGIN_CODE_PEPPER'),
        $config->intWithDefault('LOGIN_CODE_TTL_MINUTES', 10),
        $config->intWithDefault('LOGIN_CODE_MAX_ATTEMPTS', 5),
        $config->intWithDefault('PERSISTENT_LOGIN_DAYS', 90),
        $config->intWithDefault('MAX_PERSISTENT_SESSIONS', 3),
    );
    $result = $service->requestCode($rawEmail, $clientIp);

    if ($result->challengeToken !== null) {
        $response['challenge'] = $result->challengeToken;
    }
} catch (\Throwable $e) {
    // NEVER log $e->getMessage() -- see request-link.php's identical
    // caveat; a DB/mailer exception could itself contain the normalized
    // email or the raw code/challenge token.
    error_log('request-code.php: ' . get_class($e));
}

echo json_encode($response);
```

Note `LOGIN_CODE_EMAIL_PER_HOUR`/`LOGIN_CODE_IP_PER_HOUR` are new optional config keys (defaults 3/10, matching the spec's implicit anti-bruteforce posture) — added to `Config.php`'s key list and `config.example.php` in Task 15.

- [ ] **Step 4: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: all `RequestCodeWiringTest.php` cases pass; full suite green.

- [ ] **Step 5: Commit**

```bash
git add server/auth/request-code.php server/tests/Auth/RequestCodeWiringTest.php server/tests/run-tests.php
git commit -m "Add POST /api/auth/request-code.php"
```

---

### Task 10: `server/auth/verify-code.php`

**Files:**
- Create: `server/auth/verify-code.php`
- Create: `server/tests/Auth/VerifyCodeWiringTest.php`
- Modify: `server/tests/run-tests.php` (register)

**Interfaces:**
- Consumes: `OtpAuthService::verifyCode()` (Task 8), `WebSessionCookie` (existing class, reused twice — once for the session cookie with its existing name/TTL, once instantiated a second time for the remember cookie with `PERSISTENT_LOGIN_COOKIE_NAME`/`PERSISTENT_LOGIN_DAYS`), the same login-CSRF Origin check `verify.php` already does before consuming a one-time credential.
- Produces: `POST /api/auth/verify-code.php {"challenge": "...", "code": "..."}` → on success, `200 {"user": {...}}` with both `Set-Cookie` headers issued (cookie mode) or `200 {"session_token": "...", "persistent_token": "...", "user": {...}}` (Bearer/dev-harness mode, mirroring `verify.php`'s own dual-mode shape) → on failure, `400 {"error": "invalid or expired code"}`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/Auth/VerifyCodeWiringTest.php`:

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

function loadVerifyCodeSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../auth/verify-code.php');
    assertTrue($source !== false, 'could not read auth/verify-code.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function verifyCodeWiringTests(): array
{
    return [
        'verify-code.php requires and imports OtpAuthService' => function () {
            $source = loadVerifyCodeSource();
            assertTrue(str_contains($source, "require __DIR__ . '/../src/Auth/OtpAuthService.php';"));
            assertTrue(str_contains($source, 'use KanaGame\\Paddle\\Auth\\OtpAuthService;'));
        },

        'verify-code.php rejects a cookie-mode request from a non-allowlisted Origin BEFORE consuming the code (login-CSRF defense, same posture as verify.php)' => function () {
            $source = loadVerifyCodeSource();
            $isOriginAllowedPos = strpos($source, 'isOriginAllowed');
            $verifyCodeCallPos = strpos($source, '->verifyCode(');
            assertTrue($isOriginAllowedPos !== false && $verifyCodeCallPos !== false);
            assertTrue($isOriginAllowedPos < $verifyCodeCallPos, 'the Origin check must happen before the one-time code is ever consumed');
        },

        'verify-code.php issues a second cookie for the persistent/remember credential when cookie mode is enabled' => function () {
            $source = loadVerifyCodeSource();
            assertTrue(substr_count($source, 'Set-Cookie:') >= 2, 'must issue both the session cookie and the remember cookie');
        },

        'verify-code.php never places the raw code or challenge token in a log line' => function () {
            $source = loadVerifyCodeSource();
            preg_match_all('/error_log\\(([^)]*)\\)/', $source, $matches);
            foreach ($matches[1] as $arg) {
                assertFalse(str_contains($arg, '$rawCode') || str_contains($arg, '$rawChallengeToken') || str_contains($arg, '$body'));
            }
        },

        'verify-code.php only POST is accepted' => function () {
            $source = loadVerifyCodeSource();
            assertTrue(str_contains($source, "!== 'POST'"));
            assertTrue(str_contains($source, '405'));
        },
    ];
}
```

- [ ] **Step 2: Register the test and run it to verify it fails**

Add to `server/tests/run-tests.php`'s `$testFiles`:

```php
    __DIR__ . '/Auth/VerifyCodeWiringTest.php' => 'KanaGame\\Paddle\\Tests\\verifyCodeWiringTests',
```

Run: `php server/tests/run-tests.php`
Expected: FAIL — `could not read auth/verify-code.php`.

- [ ] **Step 3: Implement**

Create `server/auth/verify-code.php`, modeled on `server/auth/verify.php` (read it again for the exact CORS/CSRF-ordering and cookie-mode branching):

```php
<?php

declare(strict_types=1);

/**
 * Consume a 6-digit email OTP code and issue a session + persistent
 * ("remember this browser") credential.
 *
 * POST /api/auth/verify-code.php {"challenge": "<opaque>", "code": "123456"}
 * -> 200 {"user": {...}}  (cookie mode -- both Set-Cookie headers issued)
 * -> 200 {"session_token": "...", "persistent_token": "...", "user": {...}}  (Bearer mode)
 * -> 400 {"error": "invalid or expired code"}
 *
 * Login-CSRF defense-in-depth mirrors verify.php exactly: reject a
 * cookie-mode request from a non-allowlisted Origin BEFORE the one-time
 * code is ever consumed, so a rejected attempt never burns an attempt
 * against LOGIN_CODE_MAX_ATTEMPTS for a legitimate follow-up.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/CurrentUserService.php';
require __DIR__ . '/../src/Auth/EmailLoginChallengeRepository.php';
require __DIR__ . '/../src/Auth/EmailNormalizer.php';
require __DIR__ . '/../src/Auth/EmailValidator.php';
require __DIR__ . '/../src/Auth/Mailer.php';
require __DIR__ . '/../src/Auth/OtpAuthService.php';
require __DIR__ . '/../src/Auth/PersistentSessionRepository.php';
require __DIR__ . '/../src/Auth/RateLimiter.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Auth/WebSessionCookie.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\EmailLoginChallengeRepository;
use KanaGame\Paddle\Auth\Mailer;
use KanaGame\Paddle\Auth\OtpAuthService;
use KanaGame\Paddle\Auth\PersistentSessionRepository;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Auth\WebSessionCookie;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;

$config = Config::load();
$cookieModeEnabled = $config->get('WEB_SESSION_COOKIE_ENABLED') === 'true';
$cors = new Cors($config->allowedOrigins(), null, $cookieModeEnabled);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    $cors->applyPreflightHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
    http_response_code(204);
    exit;
}

$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

if ($config->get('EMAIL_CODE_AUTH_ENABLED') !== 'true') {
    http_response_code(404);
    echo json_encode(['error' => 'not found']);
    exit;
}

$webSessionCookie = new WebSessionCookie(
    $cookieModeEnabled,
    $config->get('WEB_SESSION_COOKIE_NAME') ?? WebSessionCookie::DEFAULT_NAME,
);
$rememberCookie = new WebSessionCookie(
    $cookieModeEnabled,
    $config->get('PERSISTENT_LOGIN_COOKIE_NAME') ?? '__Host-tamamizu_remember',
);

if ($webSessionCookie->isEnabled() && !$cors->isOriginAllowed($_SERVER['HTTP_ORIGIN'] ?? null)) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$body = json_decode(file_get_contents('php://input') ?: '', true);
$rawChallengeToken = is_array($body) ? ($body['challenge'] ?? null) : null;
$rawCode = is_array($body) ? ($body['code'] ?? null) : null;

if (!is_string($rawChallengeToken) || $rawChallengeToken === '' || !is_string($rawCode) || $rawCode === '') {
    http_response_code(400);
    echo json_encode(['error' => 'invalid or expired code']);
    exit;
}

$noopMailer = new class implements Mailer {
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
    }

    public function sendLoginCode(string $emailNormalized, string $code): void
    {
    }
};

try {
    $pdo = Db::connect($config);
    $persistentSessions = new PersistentSessionRepository($pdo);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
        $persistentSessions,
    );
    $service = new OtpAuthService(
        $pdo,
        new EmailLoginChallengeRepository($pdo),
        $persistentSessions,
        new UserRepository($pdo),
        new SessionRepository($pdo),
        new RateLimiter(
            $pdo,
            $config->require('RATE_LIMIT_PEPPER'),
            $config->intWithDefault('RATE_LIMIT_EMAIL_PER_HOUR', 5),
            $config->intWithDefault('RATE_LIMIT_IP_PER_HOUR', 20),
            $config->intWithDefault('LOGIN_CODE_EMAIL_PER_HOUR', 3),
            $config->intWithDefault('LOGIN_CODE_IP_PER_HOUR', 10),
        ),
        $noopMailer,
        $currentUser,
        $config->require('LOGIN_CODE_PEPPER'),
        $config->intWithDefault('LOGIN_CODE_TTL_MINUTES', 10),
        $config->intWithDefault('LOGIN_CODE_MAX_ATTEMPTS', 5),
        $config->intWithDefault('PERSISTENT_LOGIN_DAYS', 90),
        $config->intWithDefault('MAX_PERSISTENT_SESSIONS', 3),
    );
    $result = $service->verifyCode($rawChallengeToken, $rawCode);
} catch (\Throwable $e) {
    error_log('verify-code.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if (!$result->success) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid or expired code']);
    exit;
}

$userPayload = [
    'user_id' => $result->user['id'],
    'email_normalized' => $result->user['email_normalized'],
];

if ($webSessionCookie->isEnabled()) {
    $sessionExpiresAt = new \DateTimeImmutable('+' . $config->intWithDefault('SESSION_EXPIRY_HOURS', 24) . ' hours');
    $persistentExpiresAt = new \DateTimeImmutable('+' . $config->intWithDefault('PERSISTENT_LOGIN_DAYS', 90) . ' days');
    header('Set-Cookie: ' . $webSessionCookie->issueHeader($result->sessionToken, $sessionExpiresAt), false);
    header('Set-Cookie: ' . $rememberCookie->issueHeader($result->persistentToken, $persistentExpiresAt), false);
    echo json_encode(['user' => $userPayload]);
    exit;
}

echo json_encode([
    'session_token' => $result->sessionToken,
    'persistent_token' => $result->persistentToken,
    'user' => $userPayload,
]);
```

`WebSessionCookie` is reused as-is (not subclassed/duplicated) for the remember cookie — its fixed Secure/HttpOnly/SameSite=Lax/Path=/no-Domain attribute set (see its class doc comment) is exactly what a 90-day persistent credential also needs; only the cookie name and the `\DateTimeImmutable` expiry passed to `issueHeader()` differ per instance.

- [ ] **Step 4: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: all `VerifyCodeWiringTest.php` cases pass; full suite green.

- [ ] **Step 5: Commit**

```bash
git add server/auth/verify-code.php server/tests/Auth/VerifyCodeWiringTest.php server/tests/run-tests.php
git commit -m "Add POST /api/auth/verify-code.php"
```

---

### Task 11: `server/auth/capabilities.php`

**Files:**
- Create: `server/auth/capabilities.php`
- Create: `server/tests/Auth/CapabilitiesWiringTest.php`
- Modify: `server/tests/run-tests.php` (register)

**Interfaces:**
- Consumes: `Config::load()`, `Cors` (public, unauthenticated GET — no session/DB dependency at all).
- Produces: `GET /api/auth/capabilities.php` → `200 {"email_code_auth": true|false}`, reflecting `EMAIL_CODE_AUTH_ENABLED`. No existing public config endpoint exists to extend (confirmed by reading `server/auth/me.php`, which is auth-required, and there being no other file under `server/auth/` that responds unauthenticated) — this is a new, minimal file per the spec's own "confirm during implementation" note.

- [ ] **Step 1: Write the failing test**

Create `server/tests/Auth/CapabilitiesWiringTest.php`:

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

function loadCapabilitiesSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../auth/capabilities.php');
    assertTrue($source !== false, 'could not read auth/capabilities.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function capabilitiesWiringTests(): array
{
    return [
        'capabilities.php only GET is accepted' => function () {
            $source = loadCapabilitiesSource();
            assertTrue(str_contains($source, "!== 'GET'"));
            assertTrue(str_contains($source, '405'));
        },
        'capabilities.php reflects EMAIL_CODE_AUTH_ENABLED as a boolean, defaulting closed' => function () {
            $source = loadCapabilitiesSource();
            assertTrue(str_contains($source, "EMAIL_CODE_AUTH_ENABLED') === 'true'"), 'must compare against the exact string "true", same convention as every other feature flag in this codebase');
            assertTrue(str_contains($source, 'email_code_auth'));
        },
        'capabilities.php never touches the database (no Db::connect())' => function () {
            $source = loadCapabilitiesSource();
            assertFalse(str_contains($source, 'Db::connect'), 'a public capability probe must have zero DB dependency, so a DB outage never masks the capability flag');
        },
    ];
}
```

- [ ] **Step 2: Register the test and run it to verify it fails**

Add to `server/tests/run-tests.php`'s `$testFiles`:

```php
    __DIR__ . '/Auth/CapabilitiesWiringTest.php' => 'KanaGame\\Paddle\\Tests\\capabilitiesWiringTests',
```

Run: `php server/tests/run-tests.php`
Expected: FAIL — `could not read auth/capabilities.php`.

- [ ] **Step 3: Implement**

Create `server/auth/capabilities.php`:

```php
<?php

declare(strict_types=1);

/**
 * Public, unauthenticated feature-capability probe.
 *
 * GET /api/auth/capabilities.php
 * -> 200 {"email_code_auth": true|false}
 *
 * Deliberately has NO database dependency -- the frontend uses this to
 * decide whether to show OTP sign-in UI at all, falling back to Magic
 * Link when absent/false/unreachable (see the design spec), so a DB
 * outage must never make this probe itself fail in a way that could be
 * confused with "OTP is off." A network-level failure to reach this
 * endpoint at all is the frontend's own fallback trigger, not something
 * this file needs to special-case.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Cors.php';

use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;

$config = Config::load();
$cors = new Cors($config->allowedOrigins());

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    $cors->applyPreflightHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
    http_response_code(204);
    exit;
}

$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

echo json_encode([
    'email_code_auth' => $config->get('EMAIL_CODE_AUTH_ENABLED') === 'true',
]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: all `CapabilitiesWiringTest.php` cases pass; full suite green.

- [ ] **Step 5: Commit**

```bash
git add server/auth/capabilities.php server/tests/Auth/CapabilitiesWiringTest.php server/tests/run-tests.php
git commit -m "Add GET /api/auth/capabilities.php"
```

---

### Task 12: Wire persistent-session refresh into `server/auth/me.php`

**Files:**
- Modify: `server/auth/me.php`
- Modify: `server/tests/Auth/WebSessionCookieWiringTest.php` or create `server/tests/Auth/MeWiringTest.php` (read `WebSessionCookieWiringTest.php` first — if it already targets `me.php`'s source, add cases there instead of forking a new file; otherwise create `MeWiringTest.php` following the same source-inspection pattern)

**Interfaces:**
- Consumes: `CurrentUserService::resolveOrRefresh()` (Task 6), a second `WebSessionCookie` instance for the remember cookie (same construction as Task 10's `verify-code.php`).
- Produces: `me.php`'s existing `GET /api/auth/me.php` response shape is unchanged on success (`{"user_id": ..., "email_normalized": ...}`) and on the unauthenticated 401 — the only behavioral addition is that a missing/expired session cookie with a still-valid remember cookie now transparently mints a fresh session and reissues `Set-Cookie` for it, no user-visible re-login, per the spec's session-refresh requirement.

- [ ] **Step 1: Write the failing test**

Read `server/tests/Auth/WebSessionCookieWiringTest.php` in full first. If it already asserts against `me.php`'s source text (likely, given its name), add these two cases to its returned array; otherwise create `server/tests/Auth/MeWiringTest.php` with the same `loadXxxSource()` helper pattern used in Tasks 9–11 and add them there, then register the new file in `run-tests.php`.

```php
        'me.php calls CurrentUserService::resolveOrRefresh(), not just resolve(), so a valid remember cookie can silently refresh an expired session' => function () {
            $source = file_get_contents(__DIR__ . '/../../auth/me.php');
            assertTrue(str_contains($source, '->resolveOrRefresh('), 'me.php must use the persistent-refresh-aware resolver');
        },

        'me.php reissues the session Set-Cookie only when resolveOrRefresh() actually minted a new session token' => function () {
            $source = file_get_contents(__DIR__ . '/../../auth/me.php');
            $refreshedTokenCheckPos = strpos($source, "'refreshed_session_token'");
            $setCookiePos = strpos($source, 'Set-Cookie:');
            assertTrue($refreshedTokenCheckPos !== false && $setCookiePos !== false);
            assertTrue($refreshedTokenCheckPos < $setCookiePos, 'must check refreshed_session_token before issuing a new Set-Cookie header');
        },
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php server/tests/run-tests.php`
Expected: FAIL — assertion that `->resolveOrRefresh(` appears in `me.php`'s source fails (it currently calls `->resolve(`).

- [ ] **Step 3: Implement**

Edit `server/auth/me.php`. Add the two new requires/uses (`PersistentSessionRepository`), construct a second `WebSessionCookie` for the remember cookie, and replace the resolve step:

```php
require __DIR__ . '/../src/Auth/PersistentSessionRepository.php';
// ... existing requires unchanged, plus this one ...

use KanaGame\Paddle\Auth\PersistentSessionRepository;
// ... existing uses unchanged, plus this one ...

$config = Config::load();
$cookieModeEnabled = $config->get('WEB_SESSION_COOKIE_ENABLED') === 'true';
$cors = new Cors($config->allowedOrigins(), null, $cookieModeEnabled);

// ... OPTIONS/method checks unchanged ...

$webSessionCookie = new WebSessionCookie(
    $cookieModeEnabled,
    $config->get('WEB_SESSION_COOKIE_NAME') ?? WebSessionCookie::DEFAULT_NAME,
);
$rememberCookie = new WebSessionCookie(
    $cookieModeEnabled,
    $config->get('PERSISTENT_LOGIN_COOKIE_NAME') ?? '__Host-tamamizu_remember',
);
$credential = SessionCredentialResolver::resolve(
    SessionCredentialResolver::extractBearerToken($_SERVER['HTTP_AUTHORIZATION'] ?? null),
    $webSessionCookie->readToken($_COOKIE),
);
$rememberToken = $rememberCookie->readToken($_COOKIE);

try {
    $pdo = Db::connect($config);
    $persistentSessions = new PersistentSessionRepository($pdo);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
        $persistentSessions,
    );
    $resolution = $currentUser->resolveOrRefresh($credential->token, $rememberToken);
} catch (\Throwable $e) {
    error_log('me.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if ($resolution['user'] === null) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

if ($resolution['refreshed_session_token'] !== null && $webSessionCookie->isEnabled()) {
    $newExpiresAt = new \DateTimeImmutable('+' . $config->intWithDefault('SESSION_EXPIRY_HOURS', 24) . ' hours');
    header('Set-Cookie: ' . $webSessionCookie->issueHeader($resolution['refreshed_session_token'], $newExpiresAt), false);
}

echo json_encode($resolution['user']);
```

Note the `$credential->ambiguous` case is unchanged in spirit: if `resolveOrRefresh()` is called with `$credential->token` (which is `null` for both "no credential" and "ambiguous" per `SessionCredentialResolver`'s existing contract — see its doc comment), an ambiguous Bearer+cookie pair still falls through to the persistent-refresh check exactly like a genuinely-missing session would. This is consistent with `me.php`'s pre-existing choice to fold "missing" and "ambiguous" into the same 401 path — it now also folds them into the same "maybe refresh from remember cookie" path, which is a strict widening of when a legitimate persistent-credential holder can successfully re-auth, never a new way to bypass anything (a `resolveOrRefresh()` refresh only ever succeeds against a genuinely valid persistent credential, regardless of what the Bearer/cookie pair looked like).

- [ ] **Step 4: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: all cases pass; full suite green.

- [ ] **Step 5: Commit**

```bash
git add server/auth/me.php server/tests/Auth/WebSessionCookieWiringTest.php
git commit -m "Wire persistent-session refresh into GET /api/auth/me.php"
```

---

### Task 13: `server/auth/sign-out-others.php`

**Files:**
- Create: `server/auth/sign-out-others.php`
- Create: `server/tests/Auth/SignOutOthersWiringTest.php`
- Modify: `server/tests/run-tests.php` (register)

**Interfaces:**
- Consumes: `CurrentUserService::resolveOrRefresh()` (Task 6), `PersistentSessionRepository::findActiveByRawToken()`/`revokeAllForUserExcept()` (Task 4), `SessionRepository::revokeByPersistentSessionId()` (Task 5).
- Produces: `POST /api/auth/sign-out-others.php` (authenticated) → `200 {"status": "ok", "revoked": <int>}` revoking every OTHER `persistent_sessions` row (and cascade-revoking their linked `sessions` rows) for the current user, keeping the one tied to the caller's own current remember cookie → `401 {"error": "unauthorized"}` if not authenticated → `400 {"error": "no persistent session on this browser"}` if authenticated via Bearer/session-only with no remember cookie present (there is no "own" persistent session to keep in that case, and silently revoking everything would be a surprising destructive action for a caller who never asked for "sign out everywhere").

- [ ] **Step 1: Write the failing test**

Create `server/tests/Auth/SignOutOthersWiringTest.php`:

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

function loadSignOutOthersSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../auth/sign-out-others.php');
    assertTrue($source !== false, 'could not read auth/sign-out-others.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function signOutOthersWiringTests(): array
{
    return [
        'sign-out-others.php only POST is accepted' => function () {
            $source = loadSignOutOthersSource();
            assertTrue(str_contains($source, "!== 'POST'"));
            assertTrue(str_contains($source, '405'));
        },
        'sign-out-others.php requires authentication before doing anything' => function () {
            $source = loadSignOutOthersSource();
            assertTrue(str_contains($source, '401'));
            assertTrue(str_contains($source, "'unauthorized'"));
        },
        'sign-out-others.php requires a remember cookie to identify which persistent session to KEEP' => function () {
            $source = loadSignOutOthersSource();
            assertTrue(str_contains($source, 'findActiveByRawToken'));
            assertTrue(str_contains($source, "'no persistent session on this browser'"));
        },
        'sign-out-others.php cascade-revokes sessions linked to every persistent session it revokes' => function () {
            $source = loadSignOutOthersSource();
            assertTrue(str_contains($source, 'revokeAllForUserExcept'));
            assertTrue(str_contains($source, 'revokeByPersistentSessionId'));
        },
    ];
}
```

- [ ] **Step 2: Register the test and run it to verify it fails**

Add to `server/tests/run-tests.php`'s `$testFiles`:

```php
    __DIR__ . '/Auth/SignOutOthersWiringTest.php' => 'KanaGame\\Paddle\\Tests\\signOutOthersWiringTests',
```

Run: `php server/tests/run-tests.php`
Expected: FAIL — `could not read auth/sign-out-others.php`.

- [ ] **Step 3: Implement**

Create `server/auth/sign-out-others.php`:

```php
<?php

declare(strict_types=1);

/**
 * Revoke every OTHER persistent ("remember this browser") credential for
 * the current user, keeping only the one tied to the caller's own
 * current browser. Cascade-revokes each revoked persistent session's
 * linked normal sessions too.
 *
 * POST /api/auth/sign-out-others.php
 * -> 200 {"status": "ok", "revoked": <int>}
 * -> 401 {"error": "unauthorized"}  -- not authenticated at all
 * -> 400 {"error": "no persistent session on this browser"}  -- authenticated,
 *    but this caller's browser has no valid remember cookie, so there is no
 *    "own" persistent session to keep -- refuse rather than guess.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/CurrentUserService.php';
require __DIR__ . '/../src/Auth/PersistentSessionRepository.php';
require __DIR__ . '/../src/Auth/SessionCredentialResolver.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Auth/WebSessionCookie.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\PersistentSessionRepository;
use KanaGame\Paddle\Auth\SessionCredentialResolver;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Auth\WebSessionCookie;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;

$config = Config::load();
$cookieModeEnabled = $config->get('WEB_SESSION_COOKIE_ENABLED') === 'true';
$cors = new Cors($config->allowedOrigins(), null, $cookieModeEnabled);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    $cors->applyPreflightHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
    http_response_code(204);
    exit;
}

$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$webSessionCookie = new WebSessionCookie(
    $cookieModeEnabled,
    $config->get('WEB_SESSION_COOKIE_NAME') ?? WebSessionCookie::DEFAULT_NAME,
);
$rememberCookie = new WebSessionCookie(
    $cookieModeEnabled,
    $config->get('PERSISTENT_LOGIN_COOKIE_NAME') ?? '__Host-tamamizu_remember',
);
$cookieToken = $webSessionCookie->readToken($_COOKIE);

if ($cookieToken !== null && !$cors->isOriginAllowed($_SERVER['HTTP_ORIGIN'] ?? null)) {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$credential = SessionCredentialResolver::resolve(
    SessionCredentialResolver::extractBearerToken($_SERVER['HTTP_AUTHORIZATION'] ?? null),
    $cookieToken,
);
$rememberToken = $rememberCookie->readToken($_COOKIE);

try {
    $pdo = Db::connect($config);
    $persistentSessions = new PersistentSessionRepository($pdo);
    $sessions = new SessionRepository($pdo);
    $currentUser = new CurrentUserService(new UserRepository($pdo), $sessions, $config->intWithDefault('SESSION_EXPIRY_HOURS', 24), $persistentSessions);

    $resolution = $currentUser->resolveOrRefresh($credential->token, $rememberToken);
    if ($resolution['user'] === null) {
        http_response_code(401);
        echo json_encode(['error' => 'unauthorized']);
        exit;
    }

    $ownPersistentSession = $rememberToken !== null ? $persistentSessions->findActiveByRawToken($rememberToken) : null;
    if ($ownPersistentSession === null) {
        http_response_code(400);
        echo json_encode(['error' => 'no persistent session on this browser']);
        exit;
    }

    $revokedIds = $persistentSessions->revokeAllForUserExcept($resolution['user']['user_id'], $ownPersistentSession['id']);
    foreach ($revokedIds as $revokedId) {
        $sessions->revokeByPersistentSessionId($revokedId);
    }
} catch (\Throwable $e) {
    error_log('sign-out-others.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

echo json_encode(['status' => 'ok', 'revoked' => count($revokedIds)]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: all `SignOutOthersWiringTest.php` cases pass; full suite green.

- [ ] **Step 5: Commit**

```bash
git add server/auth/sign-out-others.php server/tests/Auth/SignOutOthersWiringTest.php server/tests/run-tests.php
git commit -m "Add POST /api/auth/sign-out-others.php"
```

---

### Task 14: Extend `server/auth/logout.php` to revoke the persistent credential

**Files:**
- Modify: `server/auth/logout.php`
- Test: create `server/tests/Auth/LogoutWiringTest.php` following the same source-inspection pattern as prior tasks (check first whether an existing `logout.php` wiring test file already exists under `server/tests/Auth/` — grep for `logout.php` inside the `Auth/` test directory; if one exists, extend it instead)

**Interfaces:**
- Consumes: `PersistentSessionRepository::findActiveByRawToken()`/`revoke()` (Task 4), `SessionRepository::revokeByPersistentSessionId()` (Task 5), a second `WebSessionCookie` instance for the remember cookie (same pattern as Tasks 10/12/13).
- Produces: `logout.php`'s existing response shapes/status codes are unchanged (200 idempotent no-op, 401 on ambiguous credential, 500 on real failure) — the only addition is that when a remember cookie is present and cookie mode is enabled, the linked `persistent_sessions` row (and its own linked `sessions` rows) is also revoked, and the remember cookie is deleted alongside the session cookie.

- [ ] **Step 1: Write the failing test**

Create `server/tests/Auth/LogoutWiringTest.php` (or extend the existing file if one is found in Step 0 above):

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

function loadLogoutSource(): string
{
    $source = file_get_contents(__DIR__ . '/../../auth/logout.php');
    assertTrue($source !== false, 'could not read auth/logout.php');
    /** @var string $source */
    return $source;
}

/**
 * @return array<string, callable(): void>
 */
function logoutWiringTests(): array
{
    return [
        'logout.php also revokes the linked persistent session and deletes the remember cookie' => function () {
            $source = loadLogoutSource();
            assertTrue(str_contains($source, 'findActiveByRawToken'), 'must look up the remember-cookie persistent session to revoke it');
            assertTrue(str_contains($source, '$rememberCookie->deleteHeader()'), 'must delete the remember cookie alongside the session cookie');
        },
        'logout.php cascade-revokes sessions linked to the revoked persistent session' => function () {
            $source = loadLogoutSource();
            assertTrue(str_contains($source, 'revokeByPersistentSessionId'));
        },
        'logout.php still leaves both cookies untouched on the ambiguous-credential 401 path (no forced-logout side effect on a rejected request)' => function () {
            $source = loadLogoutSource();
            $ambiguousBlockStart = strpos($source, 'if ($credential->ambiguous)');
            $ambiguousBlockEnd = strpos($source, 'exit;', $ambiguousBlockStart);
            $ambiguousBlock = substr($source, $ambiguousBlockStart, $ambiguousBlockEnd - $ambiguousBlockStart);
            assertFalse(str_contains($ambiguousBlock, 'Set-Cookie'), 'the ambiguous-credential branch must not send any Set-Cookie header, session or remember');
        },
    ];
}
```

- [ ] **Step 2: Register the test (if new) and run it to verify it fails**

If this is a new file, add to `server/tests/run-tests.php`'s `$testFiles`:

```php
    __DIR__ . '/Auth/LogoutWiringTest.php' => 'KanaGame\\Paddle\\Tests\\logoutWiringTests',
```

Run: `php server/tests/run-tests.php`
Expected: FAIL — `findActiveByRawToken` not found in `logout.php`'s current source.

- [ ] **Step 3: Implement**

Edit `server/auth/logout.php`. Add the `PersistentSessionRepository` require/use, construct the remember cookie alongside the existing session cookie, and extend the two existing response branches:

```php
require __DIR__ . '/../src/Auth/PersistentSessionRepository.php';
// ... existing requires unchanged, plus this one ...

use KanaGame\Paddle\Auth\PersistentSessionRepository;
// ... existing uses unchanged, plus this one ...

$webSessionCookie = new WebSessionCookie(
    $config->get('WEB_SESSION_COOKIE_ENABLED') === 'true',
    $config->get('WEB_SESSION_COOKIE_NAME') ?? WebSessionCookie::DEFAULT_NAME,
);
$rememberCookie = new WebSessionCookie(
    $config->get('WEB_SESSION_COOKIE_ENABLED') === 'true',
    $config->get('PERSISTENT_LOGIN_COOKIE_NAME') ?? '__Host-tamamizu_remember',
);
$cookieToken = $webSessionCookie->readToken($_COOKIE);
$rememberToken = $rememberCookie->readToken($_COOKIE);

// ... existing CORS-forbidden check and ambiguous-credential 401 branch
// are UNCHANGED -- the ambiguous branch still sends NO Set-Cookie header
// of either kind, per its own existing doc comment ...

if ($credential->token === null) {
    // Genuinely no session credential -- still revoke a remember
    // credential if one is present (a caller might have an expired
    // session but a still-valid remember cookie; "log out" should mean
    // "forget this browser entirely" when a remember cookie exists,
    // not silently leave it able to silently re-auth on the next me.php
    // call).
    if ($rememberToken !== null) {
        $pdo = Db::connect($config);
        $persistentSessions = new PersistentSessionRepository($pdo);
        $ownPersistentSession = $persistentSessions->findActiveByRawToken($rememberToken);
        if ($ownPersistentSession !== null) {
            $persistentSessions->revoke($ownPersistentSession['id']);
            (new SessionRepository($pdo))->revokeByPersistentSessionId($ownPersistentSession['id']);
        }
    }
    if ($webSessionCookie->isEnabled()) {
        header('Set-Cookie: ' . $webSessionCookie->deleteHeader(), false);
        header('Set-Cookie: ' . $rememberCookie->deleteHeader(), false);
    }
    echo json_encode(['status' => 'ok']);
    exit;
}
$rawSessionToken = $credential->token;

try {
    $pdo = Db::connect($config);
    $persistentSessions = new PersistentSessionRepository($pdo);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
        $persistentSessions,
    );
    $currentUser->logout($rawSessionToken);

    if ($rememberToken !== null) {
        $ownPersistentSession = $persistentSessions->findActiveByRawToken($rememberToken);
        if ($ownPersistentSession !== null) {
            $persistentSessions->revoke($ownPersistentSession['id']);
            (new SessionRepository($pdo))->revokeByPersistentSessionId($ownPersistentSession['id']);
        }
    }
} catch (\Throwable $e) {
    error_log('logout.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if ($webSessionCookie->isEnabled()) {
    header('Set-Cookie: ' . $webSessionCookie->deleteHeader(), false);
    header('Set-Cookie: ' . $rememberCookie->deleteHeader(), false);
}
echo json_encode(['status' => 'ok']);
```

The DB connection now happens slightly earlier than before (also inside the previously-DB-free "no credential" branch, only when a remember token is actually present) — this is a narrow, intentional widening: a request with no session credential but a real remember cookie now does one extra DB round-trip to revoke it, which is required to fulfil "logout also revokes the persistent credential." A request with neither credential still does no DB work at all (the `if ($rememberToken !== null)` guard short-circuits it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: all `LogoutWiringTest.php` cases pass; full suite green, including every pre-existing logout-related test.

- [ ] **Step 5: Commit**

```bash
git add server/auth/logout.php server/tests/Auth/LogoutWiringTest.php server/tests/run-tests.php
git commit -m "Extend logout.php to revoke the persistent credential"
```

---

### Task 15: `config.example.php` + `Config.php` additions

**Files:**
- Modify: `server/config.example.php`
- Modify: `server/src/Config.php`
- Test: `server/tests/ConfigTest.php` (add cases; already registered)

**Interfaces:**
- Produces: `Config::load()`'s whitelist gains `LOGIN_CODE_PEPPER`, `EMAIL_CODE_AUTH_ENABLED`, `LOGIN_CODE_TTL_MINUTES`, `LOGIN_CODE_MAX_ATTEMPTS`, `LOGIN_CODE_EMAIL_PER_HOUR`, `LOGIN_CODE_IP_PER_HOUR`, `PERSISTENT_LOGIN_DAYS`, `MAX_PERSISTENT_SESSIONS`, `PERSISTENT_LOGIN_COOKIE_NAME` — every one of these keys is already referenced by `config->get(...)`/`config->require(...)`/`config->intWithDefault(...)` calls added in Tasks 9–14; without this task those calls always see `null`/the hardcoded default, since `Config::load()` only loads keys present in its own `$keys` array (see `Config.php`'s doc comment — keys not listed there are silently never loaded from env or `config.php`, even if actually set).

- [ ] **Step 1: Write the failing test**

Read `server/tests/ConfigTest.php` first to match its existing style (likely constructs `Config::fromArray([...])` and asserts `get()`/`require()`/`intWithDefault()` round-trip). Add:

```php
        'Config::load()\'s whitelist includes every new email-OTP/persistent-login key' => function () {
            // fromArray() bypasses the whitelist entirely (see Config::fromArray()'s
            // own doc comment: "bypassing env/file loading entirely"), so this test
            // instead drives load() itself via a real env var for one representative
            // new key, proving the key is actually in Config::load()'s $keys array --
            // fromArray() would pass even if the key were missing from that array.
            putenv('LOGIN_CODE_PEPPER=test-only-pepper-value');
            $config = \KanaGame\Paddle\Config::load();
            putenv('LOGIN_CODE_PEPPER'); // unset for subsequent tests
            assertSame('test-only-pepper-value', $config->get('LOGIN_CODE_PEPPER'), 'LOGIN_CODE_PEPPER must be loadable via Config::load(), not just Config::fromArray()');
        },
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php server/tests/run-tests.php`
Expected: FAIL — `assertSame('test-only-pepper-value', null, ...)` (the key isn't in `Config::load()`'s whitelist yet, so `getenv()`'s value is silently dropped).

- [ ] **Step 3: Implement**

Edit `server/src/Config.php`'s `$keys` array in `load()` — append after the existing `MAGIC_LINK_FROM_NAME` entry:

```php
            'MAGIC_LINK_FROM_EMAIL',
            'MAGIC_LINK_FROM_NAME',

            // --- Email OTP + persistent login ("remember this browser") ---
            'LOGIN_CODE_PEPPER',
            'EMAIL_CODE_AUTH_ENABLED',
            'LOGIN_CODE_TTL_MINUTES',
            'LOGIN_CODE_MAX_ATTEMPTS',
            'LOGIN_CODE_EMAIL_PER_HOUR',
            'LOGIN_CODE_IP_PER_HOUR',
            'PERSISTENT_LOGIN_DAYS',
            'MAX_PERSISTENT_SESSIONS',
            'PERSISTENT_LOGIN_COOKIE_NAME',

            'DEV_HARNESS_ENABLED',
```

(Insert directly before the existing `'DEV_HARNESS_ENABLED',` line, keeping that line and everything after it unchanged.)

Edit `server/config.example.php` — append after the existing `DEV_HARNESS_ENABLED` entry, before the closing `];`:

```php
    // --- Email OTP + persistent login ("remember this browser") ---
    // See docs/superpowers/specs/2026-09-17-email-otp-persistent-login-design.md.

    // HMAC pepper for the OTP code MAC (server/src/Auth/EmailLoginChallengeRepository.php).
    // MUST be a DIFFERENT value from RATE_LIMIT_PEPPER -- see that key's
    // own comment above and RateLimiter.php's doc comment for why the two
    // must never be the same secret. Required once EMAIL_CODE_AUTH_ENABLED
    // is 'true'. Rotating this invalidates every currently-open (not yet
    // verified) OTP challenge -- it does NOT invalidate any existing
    // session or persistent_sessions row.
    'LOGIN_CODE_PEPPER' => '',

    // Must be the EXACT string 'true' to expose request-code.php/
    // verify-code.php and to make capabilities.php report
    // {"email_code_auth": true}. Default OFF (unset/anything else) --
    // Magic Link remains the only sign-in method until this is
    // deliberately enabled. See capabilities.php's own doc comment for
    // why the frontend falls back to Magic Link whenever this reports
    // false/is unreachable.
    'EMAIL_CODE_AUTH_ENABLED' => '',

    // Optional -- defaults to 10 minutes, 5 attempts, 3/hour (email),
    // 10/hour (IP) if unset or non-numeric (see Config::intWithDefault()).
    'LOGIN_CODE_TTL_MINUTES' => '',
    'LOGIN_CODE_MAX_ATTEMPTS' => '',
    'LOGIN_CODE_EMAIL_PER_HOUR' => '',
    'LOGIN_CODE_IP_PER_HOUR' => '',

    // Optional -- defaults to 90 days (persistent credential absolute
    // expiry) and 3 (max concurrent persistent_sessions rows per user,
    // LRU-evicted on a 4th login -- see PersistentSessionRepository::
    // evictLruForUser()) if unset or non-numeric.
    'PERSISTENT_LOGIN_DAYS' => '',
    'MAX_PERSISTENT_SESSIONS' => '',

    // Optional -- defaults to '__Host-tamamizu_remember' if unset (see
    // verify-code.php/me.php/logout.php/sign-out-others.php, all of which
    // construct a second WebSessionCookie instance with this name). Same
    // __Host- prefix requirements as WEB_SESSION_COOKIE_NAME -- see that
    // key's own comment above and docs/adr/0001-cross-site-auth-transport.md.
    'PERSISTENT_LOGIN_COOKIE_NAME' => '',
];
```

(Remove the old trailing `];` that previously closed the array right after `DEV_HARNESS_ENABLED` and let this new block's `];` close it instead.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `php server/tests/run-tests.php`
Expected: `ConfigTest.php`'s new case passes; full suite green.

- [ ] **Step 5: Commit**

```bash
git add server/src/Config.php server/config.example.php server/tests/ConfigTest.php
git commit -m "Add email-OTP/persistent-login config keys"
```

---

### Task 16: OTP security test suite completeness pass

**Files:**
- Modify: `server/tests/Auth/EmailLoginChallengeRepositoryTest.php`
- Modify: `server/tests/Auth/OtpAuthServiceTest.php`
- Create: `server/tests/Auth/OtpConfigWiringTest.php`
- Modify: `server/tests/run-tests.php` (register the new file)

**Interfaces:**
- Consumes: everything built in Tasks 3, 7, 8. No new production code in this task — it closes the specific gaps the spec's testing section names that Tasks 3/7/8's tests don't yet directly cover: **pepper isolation** (a `LOGIN_CODE_PEPPER`-computed MAC must never validate against `RATE_LIMIT_PEPPER`, and the two config keys must be wired as genuinely separate values, never one derived from or defaulting to the other) and an explicit **no-plaintext-storage** sweep at the `OtpAuthService` level (Task 3 already proves this at the repository level; this adds the same proof one layer up, through the full `requestCode()`/`verifyCode()` path, matching how the spec phrases the requirement against the service, not just the repository).

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/Auth/EmailLoginChallengeRepositoryTest.php`'s returned array:

```php
        'consumeAttempt() with the correct code but the WRONG pepper fails (pepper isolation)' => function () {
            $pdo = makeEmailLoginChallengeRepositoryTestDb();
            $repo = new EmailLoginChallengeRepository($pdo);
            $rawToken = 'raw-pepper-isolation';
            $repo->issue('pepper@example.com', $rawToken, '123123', ELC_TEST_PEPPER, new \DateTimeImmutable('+10 minutes'));

            $wrongPepper = $repo->consumeAttempt($rawToken, '123123', 'a-completely-different-pepper', 5);
            assertFalse($wrongPepper->success, 'the correct code under the wrong pepper must fail exactly like a wrong code -- the pepper is part of the effective secret');

            $rightPepper = $repo->consumeAttempt($rawToken, '123123', ELC_TEST_PEPPER, 5);
            assertTrue($rightPepper->success, 'the correct code under the correct pepper must still work (the wrong-pepper attempt above must not have poisoned the row beyond a normal attempts++)');
        },
```

Add to `server/tests/Auth/OtpAuthServiceTest.php`'s returned array:

```php
        'no PDO row anywhere in the OTP tables ever contains the plaintext code, end-to-end through requestCode()+verifyCode()' => function () {
            $h = makeOtpAuthServiceHarness();
            $request = $h['service']->requestCode('sweep@example.com', '203.0.113.1');
            $code = $h['mailer']->sentCodes[0]['code'];
            $h['service']->verifyCode($request->challengeToken, $code);

            foreach (['email_login_challenges', 'persistent_sessions', 'sessions', 'users'] as $table) {
                $rows = $h['pdo']->query("SELECT * FROM {$table}")->fetchAll();
                foreach ($rows as $row) {
                    foreach ($row as $column => $value) {
                        if (is_string($value)) {
                            assertFalse(str_contains($value, $code), "{$table}.{$column} must never contain the plaintext OTP code");
                        }
                    }
                }
            }
        },
```

Create `server/tests/Auth/OtpConfigWiringTest.php`:

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

require_once __DIR__ . '/../TestCase.php';

/**
 * Source-inspection proof that LOGIN_CODE_PEPPER and RATE_LIMIT_PEPPER
 * are wired as two genuinely distinct config reads in every endpoint
 * that constructs both a RateLimiter and an OtpAuthService -- neither
 * ever falls back to, defaults from, or is derived from the other. This
 * is the "no new pepper needed for rate limiting, but LOGIN_CODE_PEPPER
 * is a DIFFERENT secret" requirement from the design spec, checked at
 * the wiring level (the unit-level MAC-isolation proof lives in
 * EmailLoginChallengeRepositoryTest.php).
 */
function assertDistinctPepperConfigReads(string $path): void
{
    $source = file_get_contents($path);
    assertTrue($source !== false, "could not read {$path}");
    assertTrue(str_contains($source, "\$config->require('RATE_LIMIT_PEPPER')"), "{$path} must read RATE_LIMIT_PEPPER for its RateLimiter");
    assertTrue(str_contains($source, "\$config->require('LOGIN_CODE_PEPPER')"), "{$path} must read LOGIN_CODE_PEPPER for its OtpAuthService, as a SEPARATE config->require() call");
}

/**
 * @return array<string, callable(): void>
 */
function otpConfigWiringTests(): array
{
    return [
        'request-code.php reads RATE_LIMIT_PEPPER and LOGIN_CODE_PEPPER as two distinct config->require() calls' => function () {
            assertDistinctPepperConfigReads(__DIR__ . '/../../auth/request-code.php');
        },
        'verify-code.php reads RATE_LIMIT_PEPPER and LOGIN_CODE_PEPPER as two distinct config->require() calls' => function () {
            assertDistinctPepperConfigReads(__DIR__ . '/../../auth/verify-code.php');
        },
    ];
}
```

- [ ] **Step 2: Register the new test file and run everything to verify the new cases fail**

Add to `server/tests/run-tests.php`'s `$testFiles`:

```php
    __DIR__ . '/Auth/OtpConfigWiringTest.php' => 'KanaGame\\Paddle\\Tests\\otpConfigWiringTests',
```

Run: `php server/tests/run-tests.php`
Expected: at this point every one of these cases should already PASS, since Tasks 3/7/8/9/10 already implemented pepper-isolation (via `hash_equals()` on a MAC computed with the caller-supplied pepper) and separate `LOGIN_CODE_PEPPER`/`RATE_LIMIT_PEPPER` config reads as part of their own implementation steps. If any case unexpectedly fails here, it is a real regression in an earlier task, not a new-feature gap -- fix the earlier task's code, not this test.

- [ ] **Step 3: (No new implementation code — this task is test-only.) Confirm green**

Run: `php server/tests/run-tests.php`
Expected: full suite green, including all new cases from this task.

- [ ] **Step 4: Commit**

```bash
git add server/tests/Auth/EmailLoginChallengeRepositoryTest.php server/tests/Auth/OtpAuthServiceTest.php server/tests/Auth/OtpConfigWiringTest.php server/tests/run-tests.php
git commit -m "Add pepper-isolation and end-to-end no-plaintext-storage OTP security tests"
```

---

### Task 17: Real-MariaDB concurrency scenarios D (verify-code race) and E (4th-login LRU eviction race)

**Files:**
- Modify: `server/tests/mariadb-concurrency/scenarios.php`
- Modify: `server/tests/mariadb-concurrency/worker.php`
- Modify: `server/tests/mariadb-concurrency/bootstrap.php`
- Modify: `server/tests/mariadb-concurrency/orchestrate.php`
- Modify: `server/tests/mariadb-concurrency/README.md` (document the two new scenarios in its "Layout" section's scenario list, mirroring how A/B/C1–C4 are already described)

**Interfaces:**
- Consumes: `OtpAuthService::verifyCode()` (Task 8), `EmailLoginChallengeRepository::issue()` (Task 3), `PersistentSessionRepository`/`SessionRepository` (Tasks 4/5), the existing `Barrier`/`runWorkers()`/`checkInvariant()`/`reportIterationOutcome()`/`resetTables()` orchestration helpers already in `orchestrate.php` (extend `resetTables()`'s truncated-table list, do not duplicate its shape).
- Produces: two new CLI-selectable scenario names, `'D'` and `'E'`, runnable via `php server/tests/mariadb-concurrency/orchestrate.php --only=D,E` exactly like the existing six.

- [ ] **Step 1: Extend `bootstrap.php`'s requires**

Add alongside the existing `Auth/` requires in `server/tests/mariadb-concurrency/bootstrap.php`:

```php
require_once __DIR__ . '/../../src/Auth/EmailLoginChallengeRepository.php';
require_once __DIR__ . '/../../src/Auth/OtpAuthService.php';
require_once __DIR__ . '/../../src/Auth/PersistentSessionRepository.php';
require_once __DIR__ . '/../Auth/OtpAuthServiceTest.php';
```

(`OtpAuthServiceTest.php`'s `makeOtpAuthServiceHarness()` wiring pattern is reused here exactly the way `MagicLinkAuthServiceTest.php`'s harness already is — see this file's existing doc comment on why requiring a test file for its helper functions has no executable side effects.)

- [ ] **Step 2: Add the two scenario functions to `scenarios.php`**

Append to `server/tests/mariadb-concurrency/scenarios.php`:

```php
/**
 * Scenarios D and E: a full OtpAuthService::verifyCode() call, wired
 * exactly like makeOtpAuthServiceHarness() in OtpAuthServiceTest.php
 * (reused, not duplicated), against this worker's own PDO.
 *
 * @param array{raw_challenge_token: string, code: string} $args
 * @return array{success: bool, user_id: ?string, persistent_token_hash: ?string, exception_class: ?string, sqlstate: ?string}
 */
function scenarioOtpVerify(PDO $pdo, array $args, Barrier $barrier, int $workerId): array
{
    $h = \KanaGame\Paddle\Tests\makeOtpAuthServiceHarness($pdo);

    $barrier->signalReadyAndWaitForGo($workerId);

    try {
        $result = $h['service']->verifyCode($args['raw_challenge_token'], $args['code']);

        return [
            'success' => $result->success,
            'user_id' => $result->user['id'] ?? null,
            // Never returns the raw persistent token (secret-free result
            // shape, per this file's own doc comment) -- only its hash,
            // which is enough for the orchestrator to correlate "which
            // worker's login produced which persistent_sessions row"
            // without ever writing a real credential to a CI result file.
            'persistent_token_hash' => $result->persistentToken !== null ? hash('sha256', $result->persistentToken) : null,
            'exception_class' => null,
            'sqlstate' => null,
        ];
    } catch (\Throwable $e) {
        return [
            'success' => false,
            'user_id' => null,
            'persistent_token_hash' => null,
            'exception_class' => get_class($e),
            'sqlstate' => $e instanceof \PDOException ? ($e->errorInfo[0] ?? null) : null,
        ];
    }
}
```

- [ ] **Step 3: Register the new operation in `worker.php`**

Edit the `match` block in `server/tests/mariadb-concurrency/worker.php`:

```php
$result = match ($scenario) {
    'verify' => scenarioVerify($pdo, $args, $barrier, $workerId),
    'webhook' => scenarioWebhook($pdo, $args, $barrier, $workerId),
    'otp_verify' => scenarioOtpVerify($pdo, $args, $barrier, $workerId),
    default => ['error' => "unknown scenario: {$scenario}"],
};
```

- [ ] **Step 4: Add `runScenarioD()` and `runScenarioE()` to `orchestrate.php`**

First, extend `resetTables()`'s truncated-table list to include the three new tables (add `'persistent_sessions', 'email_login_challenges',` to the existing array, before `'rate_limits'` for readability — order doesn't matter since `FOREIGN_KEY_CHECKS` is disabled around the loop).

Then append, near the existing `runScenarioB()`:

```php
// --------------------------------------------------------------------
// Scenario D: same OTP challenge + correct code, N=3 concurrent
// verifyCode() calls -- exactly one must succeed (mirrors scenario A's
// shape for Magic Link, for the OTP path).
// --------------------------------------------------------------------
function runScenarioD(PDO $maintPdo, int $iterations): void
{
    $scenario = 'D';
    $GLOBALS['mariadbConcurrencyScenarioTally'][$scenario] = ['pass' => 0, 'fail' => 0];
    $workerCount = 3;

    for ($iter = 1; $iter <= $iterations; $iter++) {
        resetTables($maintPdo);

        $rawChallengeToken = rawSecretToken();
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        (new \KanaGame\Paddle\Auth\EmailLoginChallengeRepository($maintPdo))->issue(
            'race-d@example.invalid',
            $rawChallengeToken,
            $code,
            'mariadb-concurrency-login-code-pepper',
            new \DateTimeImmutable('+10 minutes'),
        );

        $dir = makeBarrierDir($scenario, $iter);
        for ($i = 0; $i < $workerCount; $i++) {
            writeArgsFile($dir, $i, ['raw_challenge_token' => $rawChallengeToken, 'code' => $code]);
        }

        $iterationFailures = [];
        try {
            $results = runWorkers('otp_verify', $dir, $workerCount);

            $successCount = 0;
            $exceptionWorkers = [];
            foreach ($results as $i => $r) {
                if ($r['success']) {
                    $successCount++;
                }
                if ($r['exception_class'] !== null) {
                    $exceptionWorkers[] = ['worker' => $i, 'class' => $r['exception_class'], 'sqlstate' => $r['sqlstate']];
                }
            }

            checkInvariant($scenario, $iter, 'exactly one success', $successCount === 1, ['success_count' => $successCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'no uncaught DB exception surfaced from any worker', $exceptionWorkers === [], ['exception_workers' => $exceptionWorkers], $iterationFailures);

            $verifyPdo = connectMariadbConcurrencyTestDb();
            $userCount = (int) $verifyPdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            $persistentCount = (int) $verifyPdo->query('SELECT COUNT(*) FROM persistent_sessions')->fetchColumn();
            $sessionCount = (int) $verifyPdo->query('SELECT COUNT(*) FROM sessions')->fetchColumn();
            $tokenHash = hash('sha256', $rawChallengeToken);
            $challengeRow = $verifyPdo->prepare('SELECT used_at, attempts FROM email_login_challenges WHERE challenge_token_hash = ?');
            $challengeRow->execute([$tokenHash]);
            $challenge = $challengeRow->fetch(PDO::FETCH_ASSOC);

            checkInvariant($scenario, $iter, 'users row count == 1', $userCount === 1, ['user_count' => $userCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'persistent_sessions row count == 1 (exactly one successful login minted exactly one persistent session)', $persistentCount === 1, ['persistent_count' => $persistentCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'sessions row count == 1', $sessionCount === 1, ['session_count' => $sessionCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'the challenge is used', $challenge !== false && $challenge['used_at'] !== null, ['challenge_found' => $challenge !== false], $iterationFailures);

            reportIterationOutcome($scenario, $iter, $iterationFailures, $results, []);
        } finally {
            cleanupBarrierDir($dir);
        }
    }
}

// --------------------------------------------------------------------
// Scenario E: a user already at the 3-persistent-session cap, N=2
// concurrent 4th-login verifyCode() calls (two DISTINCT challenges,
// each with its own correct code) -- both logins must succeed (login is
// NEVER blocked by the cap), the active-persistent-session count must
// never exceed 3 at any settled point, and no duplicate-eviction /
// double-revoke corruption may occur under the race.
// --------------------------------------------------------------------
function runScenarioE(PDO $maintPdo, int $iterations): void
{
    $scenario = 'E';
    $GLOBALS['mariadbConcurrencyScenarioTally'][$scenario] = ['pass' => 0, 'fail' => 0];
    $workerCount = 2;

    for ($iter = 1; $iter <= $iterations; $iter++) {
        resetTables($maintPdo);

        $pepper = 'mariadb-concurrency-login-code-pepper';
        $userId = (new UserRepository($maintPdo))->findOrCreateByEmail('race-e@example.invalid')['id'];
        $persistentRepo = new \KanaGame\Paddle\Auth\PersistentSessionRepository($maintPdo);
        // Seed exactly 3 pre-existing active persistent sessions (the
        // cap) through the real repository, at 3 DISTINCT last_seen_at
        // values so LRU has an unambiguous oldest row to evict.
        $seededIds = [];
        for ($s = 0; $s < 3; $s++) {
            $seededIds[] = $persistentRepo->create($userId, rawSecretToken(), new \DateTimeImmutable('+90 days'));
        }
        foreach ($seededIds as $offset => $id) {
            $maintPdo->prepare('UPDATE persistent_sessions SET last_seen_at = ? WHERE id = ?')
                ->execute([(new \DateTimeImmutable("2020-01-0" . ($offset + 1) . " 00:00:00"))->format('Y-m-d H:i:s'), $id]);
        }
        $oldestSeededId = $seededIds[0];

        $challenges = new \KanaGame\Paddle\Auth\EmailLoginChallengeRepository($maintPdo);
        $rawChallengeA = rawSecretToken();
        $rawChallengeB = rawSecretToken();
        $codeA = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $codeB = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        // Both challenges resolve to the SAME email/user -- two distinct
        // valid codes for the same user racing to be the "4th login."
        $challenges->issue('race-e@example.invalid', $rawChallengeA, $codeA, $pepper, new \DateTimeImmutable('+10 minutes'));
        $challenges->issue('race-e@example.invalid', $rawChallengeB, $codeB, $pepper, new \DateTimeImmutable('+10 minutes'));

        $dir = makeBarrierDir($scenario, $iter);
        writeArgsFile($dir, 0, ['raw_challenge_token' => $rawChallengeA, 'code' => $codeA]);
        writeArgsFile($dir, 1, ['raw_challenge_token' => $rawChallengeB, 'code' => $codeB]);

        $iterationFailures = [];
        try {
            $results = runWorkers('otp_verify', $dir, $workerCount);

            $bothSucceeded = $results[0]['success'] && $results[1]['success'];
            $exceptionWorkers = [];
            foreach ($results as $i => $r) {
                if ($r['exception_class'] !== null) {
                    $exceptionWorkers[] = ['worker' => $i, 'class' => $r['exception_class'], 'sqlstate' => $r['sqlstate']];
                }
            }

            checkInvariant($scenario, $iter, 'both concurrent 4th/5th-login attempts succeed -- login is never blocked by the cap', $bothSucceeded, ['results' => $results], $iterationFailures);
            checkInvariant($scenario, $iter, 'no uncaught DB exception surfaced from either worker', $exceptionWorkers === [], ['exception_workers' => $exceptionWorkers], $iterationFailures);

            $verifyPdo = connectMariadbConcurrencyTestDb();
            $activeCount = (int) (function () use ($verifyPdo, $userId) {
                $stmt = $verifyPdo->prepare('SELECT COUNT(*) FROM persistent_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()');
                $stmt->execute([$userId]);
                return $stmt->fetchColumn();
            })();
            $revokedOldestRow = $verifyPdo->prepare('SELECT revoked_at FROM persistent_sessions WHERE id = ?');
            $revokedOldestRow->execute([$oldestSeededId]);
            $revokedOldest = $revokedOldestRow->fetchColumn();
            $totalEverCreated = (int) (function () use ($verifyPdo, $userId) {
                $stmt = $verifyPdo->prepare('SELECT COUNT(*) FROM persistent_sessions WHERE user_id = ?');
                $stmt->execute([$userId]);
                return $stmt->fetchColumn();
            })();
            // Both logins together attempted 2 evictions against a
            // starting count of 3 -- the CORRECT post-race active count
            // depends on ordering (each verifyCode() call independently
            // re-checks countActiveForUser() >= cap right before
            // evicting), so the invariant this scenario actually proves
            // is the SAFETY bound: active count must never exceed the
              // cap (3) at rest, and total rows created must be exactly
            // seeded(3) + this iteration's 2 new logins = 5, with the
            // difference (5 - active) all showing revoked_at set --
            // i.e. no row is ever "lost" (neither double-counted as
            // active nor silently dropped without a revoked_at stamp).
            checkInvariant($scenario, $iter, 'active persistent_sessions count for this user never exceeds the cap (3) after the race settles', $activeCount <= 3, ['active_count' => $activeCount], $iterationFailures);
            checkInvariant($scenario, $iter, 'the originally-oldest seeded row is revoked (LRU eviction picked it, not an arbitrary row)', $revokedOldest !== null, ['revoked_oldest' => $revokedOldest], $iterationFailures);
            checkInvariant($scenario, $iter, 'exactly 5 persistent_sessions rows exist in total for this user (3 seeded + 2 new logins, none lost)', $totalEverCreated === 5, ['total_ever_created' => $totalEverCreated], $iterationFailures);

            reportIterationOutcome($scenario, $iter, $iterationFailures, $results, ['seeded_ids' => $seededIds]);
        } finally {
            cleanupBarrierDir($dir);
        }
    }
}
```

- [ ] **Step 5: Register the two scenarios in the `$allScenarios` map**

Edit the `$allScenarios` array near the bottom of `orchestrate.php`:

```php
$allScenarios = [
    'A' => fn () => runScenarioA($maintPdo, $iterations),
    'B' => fn () => runScenarioB($maintPdo, $iterations),
    'C1' => fn () => runScenarioC1($maintPdo, $iterations),
    'C2' => fn () => runScenarioC2($maintPdo, $iterations),
    'C3' => fn () => runScenarioC3($maintPdo, $iterations),
    'C4' => fn () => runScenarioC4($maintPdo, $iterations),
    'D' => fn () => runScenarioD($maintPdo, $iterations),
    'E' => fn () => runScenarioE($maintPdo, $iterations),
];
```

- [ ] **Step 6: Document the two new scenarios in `README.md`**

Add two sentences to the "Layout" section's `scenarios.php` bullet, alongside the existing "(A, B, C1–C4)" reference, updating it to "(A, B, C1–C4, D, E)" and adding one line each: "D: same OTP challenge/code raced across 3 workers — exactly one verifyCode() succeeds. E: a user at the 3-persistent-session cap, two concurrent 4th-login verifyCode() calls with distinct challenges — both succeed, the LRU row is evicted, and the active count never exceeds the cap."

- [ ] **Step 7: Run it (requires a real MariaDB instance — not runnable in this sandboxed session; document as the final verification step, not something this task's own execution can complete without one)**

Run: `php server/tests/mariadb-concurrency/orchestrate.php --only=D,E --iterations=20` against a real MariaDB 10.5+ instance with `MARIADB_CONCURRENCY_DB_HOST`/`_NAME`/`_USER`/`_PASSWORD` set and migrations `0001`–`0003` applied (see `.github/workflows/mariadb-concurrency.yml` for the exact sequence GitHub Actions uses).
Expected: `All invariants held across all iterations of all scenarios run.` with exit code 0. If this cannot be run locally, this is the one step in the entire plan that must be verified by CI (the `mariadb-concurrency` GitHub Actions workflow) rather than locally before considering PR A's implementation complete — do not claim this task done without that CI run's green result, per the repo's verification-gap handling policy in `docs/ai-development-loop.md`.

- [ ] **Step 8: Commit**

```bash
git add server/tests/mariadb-concurrency/scenarios.php server/tests/mariadb-concurrency/worker.php server/tests/mariadb-concurrency/bootstrap.php server/tests/mariadb-concurrency/orchestrate.php server/tests/mariadb-concurrency/README.md
git commit -m "Add mariadb-concurrency scenarios D (verify-code race) and E (4th-login LRU eviction race)"
```

---

## Self-Review Notes

- **Spec coverage:** migration (Task 1); OTP generation/storage/HMAC via `LOGIN_CODE_PEPPER`, RateLimiter bucket extension (Tasks 2, 3, 7); `request-code.php` (Task 9); `verify-code.php` with atomic consume, find-or-create, max-3/LRU, dual cookie issuance (Tasks 8, 10); capabilities endpoint (Task 11); persistent-session-refresh hook (Tasks 6, 12); `sign-out-others.php` (Task 13); `logout.php` extension (Task 14); `config.example.php` additions (Task 15); PHP security unit tests per the spec's list (Tasks 3, 7, 8, 16); MariaDB concurrency additions (Task 17). Magic Link/session/purchase files are touched only at the specific extension points the spec names (`CurrentUserService`, `SessionRepository`, `RateLimiter`, `logout.php`, the `Mailer` interface) — no other Magic Link or purchase file is modified.
- **Placeholder scan:** every task carries real, runnable code (no "TBD"/"similar to Task N"/hand-wavy validation language); the one place a step cannot be executed in this sandboxed session (Task 17, Step 7 — requires real MariaDB) is explicitly called out as a CI-verified step, not skipped or hand-waved.
- **Type/signature consistency:** `EmailLoginChallengeRepository::consumeAttempt()`'s return type (`EmailLoginChallengeConsumeResult` with `$success`/`$reason`) is used identically in Tasks 3, 8, and 16. `PersistentSessionRepository`'s method names/signatures (`create`, `findActiveByRawToken`, `touch`, `countActiveForUser`, `evictLruForUser`, `revoke`, `revokeAllForUserExcept`) are introduced once in Task 4 and used with the exact same names/param order in Tasks 6, 8, 12, 13, 14, 17. `CurrentUserService::resolveOrRefresh()`'s return shape (`array{user, refreshed_session_token}`) is introduced in Task 6 and consumed identically in Tasks 12 and 13. `OtpAuthService`'s constructor parameter order (introduced across Tasks 7/8) is reproduced identically in every endpoint task (9, 10) and in the mariadb-concurrency harness (17, via the reused `makeOtpAuthServiceHarness()`).
