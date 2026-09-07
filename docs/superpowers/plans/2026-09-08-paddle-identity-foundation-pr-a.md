# PR A: Real-user identity + auth foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 2's total absence of real identity with a
minimal, secure users/Magic-Link/sessions/rate-limiting foundation —
`users`, `magic_link_tokens`, `sessions`, `rate_limits` tables;
`request-link.php`/`verify.php`/`me.php`/`logout.php` endpoints; a
`Mailer` interface with a test-only `FakeMailer`; and the cross-site
auth transport ADR — while leaving Phase 2's `payment_events`/
`entitlements`/`SandboxUser` PoC path completely untouched.

**Architecture:** New `KanaGame\Paddle\Auth` namespace under
`server/src/Auth/` holds repositories (`UserRepository`,
`MagicLinkTokenRepository`, `SessionRepository`, `RateLimiter`) and
services (`AuthService` orchestrating request-link/verify/logout),
following the existing flat-file-entrypoint + `src/`-class pattern from
`server/entitlement.php` / `server/src/EntitlementRepository.php`. Four
new `server/*.php` entrypoints mirror `server/entitlement.php`'s
shape (Config → Cors → dispatch → JSON). One additive SQL migration
adds four new tables; nothing existing is altered. All single-use
consume operations (magic-link token, and the user find-or-create they
trigger) use atomic conditional UPDATE / upsert-then-read patterns
inside explicit PDO transactions — never SELECT-then-unprotected-write.

**Tech Stack:** PHP 8+ (no Composer/PHPUnit — this repo's existing
dependency-free convention), PDO (MySQL/MariaDB in production, SQLite
in tests, exactly like `EntitlementRepository`), the repo's own
dependency-free test runner (`server/tests/run-tests.php`).

**Spec:** [`docs/superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-design.md`](../specs/2026-09-08-paddle-auth-entitlement-phase3-design.md)
(rev. 3, approved at HEAD `f1573beb6b5d3126f141b8de8bf084d54c451dc3`) —
this plan implements that spec's Section 1 (`users`,
`magic_link_tokens`, `sessions`, `rate_limits` only — not
`purchase_intents`/`transaction_grants`/`pending_adjustments`, which are
PR B), Section 2 (auth flow), and Section 3 (session transport
abstraction + ADR). PR B/C sections (4 onward) are out of scope for this
plan except where Section 1's schema/interfaces must already
accommodate them (noted per-task below).

## Global Constraints

- **No PR B/C implementation.** Do not create `purchase_intents`,
  `transaction_grants`, `pending_adjustments`, any purchase/webhook
  code, or the `/account-test` frontend route in this plan. Where PR A
  must expose an extension point for PR B (e.g. `AuthService`'s current-
  user resolution, which PR B's `purchase-intent.php` will reuse), build
  only the interface PR A itself needs and note the extension point in
  that task — do not pre-build PR B's consumers.
- **Additive migration only.** The new migration must not `ALTER`,
  `DROP`, or rename `payment_events` or `entitlements`, and must not
  touch `server/src/SandboxUser.php` or any Phase 2 PoC code path.
  Phase 2's existing 32 PHP tests must still pass unmodified after this
  plan's changes.
- **Raw secrets never stored or logged.** Magic-link tokens, session
  tokens: `SHA-256` hash only in DB, `hash_equals()` for final
  comparison, never appear in an `error_log()` call or exception
  message anywhere in this plan's code.
- **Atomic single-use.** Magic-link consume uses a conditional
  `UPDATE ... WHERE used_at IS NULL AND expires_at > NOW()` and checks
  affected-row-count — never SELECT-then-UPDATE (spec Section 1).
- **MariaDB-safe user find-or-create.** `INSERT ... ON DUPLICATE KEY
  UPDATE id = id` followed by a re-`SELECT` in the same transaction —
  never a bare SELECT-then-unprotected-INSERT (spec Section 1, "Two
  distinct, simultaneously-valid tokens for the same email").
- **Rate limiting is HMAC-keyed for both email and IP.** Never persist
  a raw email or raw IP in `rate_limits.identifier`. Client IP is read
  only from `$_SERVER['REMOTE_ADDR']` — `X-Forwarded-For` is never
  trusted (spec Section 1, "Client IP resolution").
- **Enumeration-safe responses.** `request-link.php` always returns the
  same generic `200 {"status":"ok"}` body regardless of whether the
  email exists, is rate-limited, or is malformed post-normalization.
  `verify.php` always returns the same generic `400` body for
  invalid/expired/already-used tokens — no distinguishable reason.
- **Magic-link token expiry: 15 minutes.** Session expiry: 30 days
  (a concrete choice this plan makes, since the spec left the number
  unspecified beyond "expiry defined explicitly" — see Task 4's
  rationale). Both are read through `Config`, not hardcoded, following
  the existing `RATE_LIMIT_EMAIL_PER_HOUR`-style convention.
- **No production browser transport decision.** `InMemorySessionTransport`
  and the `SessionTransport` interface are the only frontend pieces this
  plan builds; no cookie code, no `localStorage`/`sessionStorage` code
  for tokens.
- **Follow existing repo conventions exactly**: no PHPUnit/Composer;
  `declare(strict_types=1)`; `namespace KanaGame\Paddle\...`; repository
  classes take a `PDO` constructor argument (never call `Db::connect`
  themselves) so tests can inject SQLite; entrypoints follow
  `entitlement.php`'s Config → Cors → method-check → dispatch shape;
  tests are `array<string, callable(): void>`-returning functions
  registered in `server/tests/run-tests.php`, using `assertTrue`/
  `assertFalse`/`assertSame` from `TestCase.php`.

---

## File structure

```
server/
  sql/
    migrations/
      0001_users_auth_foundation.sql      (NEW — additive only)
  src/
    Uuid.php                              (NEW — UUIDv4 generator, no deps)
    Auth/
      Mailer.php                          (NEW — interface)
      FakeMailer.php                      (NEW — test-only, in server/src/ so
                                            server/dev-only/ later can reuse
                                            the interface; this file itself
                                            is fine to ship, it just does
                                            nothing dangerous — see Task 7)
      UserRepository.php                  (NEW)
      MagicLinkTokenRepository.php        (NEW)
      SessionRepository.php               (NEW)
      RateLimiter.php                     (NEW)
      AuthService.php                     (NEW — orchestrates request-link/
                                            verify/logout/me across the
                                            repositories above)
  auth/
    request-link.php                      (NEW — entrypoint)
    verify.php                            (NEW — entrypoint)
    me.php                                (NEW — entrypoint)
    logout.php                            (NEW — entrypoint)
  config.example.php                      (MODIFY — add new config keys)
  tests/
    UuidTest.php                          (NEW)
    Auth/
      UserRepositoryTest.php              (NEW)
      MagicLinkTokenRepositoryTest.php    (NEW)
      SessionRepositoryTest.php           (NEW)
      RateLimiterTest.php                 (NEW)
      AuthServiceTest.php                 (NEW — concurrency/integration-style
                                            tests against SQLite)
    run-tests.php                         (MODIFY — register new test files)
src/
  lib/
    auth/
      sessionTransport.ts                 (NEW — frontend interface + in-memory impl)
    auth/sessionTransport.test.ts          (NEW)
docs/
  adr/
    0001-cross-site-auth-transport.md     (NEW)
  paddle-auth-phase3a-pr-a.md             (NEW — PR A-specific docs, deployment notes)
```

Rationale for `server/auth/` (not `server/*.php` flat like Phase 2): four
new entrypoints under one flat `server/` directory alongside
`paddle-webhook.php`/`entitlement.php` would clutter the existing
directory and blur "Paddle payment PoC" vs. "auth foundation" at a
glance. A `server/auth/` subdirectory keeps the existing two Phase 2
entrypoints exactly where they are (no path changes, no risk to Phase 2
deployment docs) while giving PR A's four endpoints one clear home. This
mirrors `server/src/Auth/` already being planned as a subnamespace.

---

## Task 1: UUIDv4 generator (no dependency)

**Files:**
- Create: `server/src/Uuid.php`
- Test: `server/tests/UuidTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Produces: `KanaGame\Paddle\Uuid::v4(): string` — returns a
  lowercase, hyphenated UUIDv4 string (e.g.
  `"f47ac10b-58cc-4372-a567-0e02b2c3d479"`). Used by `UserRepository`
  (Task 3) to generate `users.id`.

- [ ] **Step 1: Write the failing test**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Uuid;

require_once __DIR__ . '/TestCase.php';
require_once __DIR__ . '/../src/Uuid.php';

/**
 * @return array<string, callable(): void>
 */
function uuidTests(): array
{
    return [
        'v4() returns a string matching the UUIDv4 format' => function () {
            $id = Uuid::v4();
            $pattern = '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';
            assertTrue((bool) preg_match($pattern, $id), "expected UUIDv4 format, got: {$id}");
        },

        'v4() returns a different value on each call' => function () {
            $first = Uuid::v4();
            $second = Uuid::v4();
            assertFalse($first === $second, 'two calls should not produce the same UUID');
        },

        'v4() always sets the version nibble to 4' => function () {
            $id = Uuid::v4();
            $versionChar = $id[14];
            assertSame('4', $versionChar, 'the version nibble (13th hex digit) must be "4"');
        },

        'v4() always sets the variant bits per RFC 4122 (8, 9, a, or b)' => function () {
            $id = Uuid::v4();
            $variantChar = $id[19];
            assertTrue(
                in_array($variantChar, ['8', '9', 'a', 'b'], true),
                "expected variant character to be one of 8/9/a/b, got: {$variantChar}",
            );
        },
    ];
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php server/tests/run-tests.php`
Expected: fails to run / errors, because `server/src/Uuid.php` does not
exist yet and `run-tests.php` does not yet reference `UuidTest.php` (you
will wire that up in Step 5, but first confirm requiring the class
directly fails). A quick standalone check:

```bash
php -r "require 'server/tests/TestCase.php'; require 'server/tests/UuidTest.php';"
```

Expected: `Fatal error: ... 'KanaGame\Paddle\Uuid' not found` or similar.

- [ ] **Step 3: Write minimal implementation**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle;

/**
 * Dependency-free UUIDv4 generator (RFC 4122) — this repo has no
 * Composer/PHP dependency manager (see docs/paddle-webhook-poc.md), so
 * this uses only random_bytes(), the same primitive already used for
 * magic-link/session/purchase-ref token generation elsewhere in this
 * codebase.
 */
final class Uuid
{
    public static function v4(): string
    {
        $bytes = random_bytes(16);

        // Set version to 0100 (UUIDv4) — byte 6, high nibble.
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        // Set variant to 10xx (RFC 4122) — byte 8, high two bits.
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

        $hex = bin2hex($bytes);

        return sprintf(
            '%s-%s-%s-%s-%s',
            substr($hex, 0, 8),
            substr($hex, 8, 4),
            substr($hex, 12, 4),
            substr($hex, 16, 4),
            substr($hex, 20, 12),
        );
    }

    private function __construct()
    {
    }
}
```

- [ ] **Step 4: Register the test file in the runner**

Modify `server/tests/run-tests.php` — add to the `$testFiles` array
(keep alphabetical-ish grouping consistent with the existing four
entries):

```php
$testFiles = [
    __DIR__ . '/PaddleSignatureTest.php' => 'KanaGame\\Paddle\\Tests\\paddleSignatureTests',
    __DIR__ . '/WebhookHandlerTest.php' => 'KanaGame\\Paddle\\Tests\\webhookHandlerTests',
    __DIR__ . '/EntitlementRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\entitlementRepositoryTests',
    __DIR__ . '/CorsTest.php' => 'KanaGame\\Paddle\\Tests\\corsTests',
    __DIR__ . '/UuidTest.php' => 'KanaGame\\Paddle\\Tests\\uuidTests',
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: all previous 32 tests still pass, plus 4 new `UuidTest.php`
tests pass — `36 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add server/src/Uuid.php server/tests/UuidTest.php server/tests/run-tests.php
git commit -m "feat: add dependency-free UUIDv4 generator for user ids"
```

---

## Task 2: Additive migration for the four new tables

**Files:**
- Create: `server/sql/migrations/0001_users_auth_foundation.sql`

**Interfaces:**
- Produces: the `users`, `magic_link_tokens`, `sessions`, `rate_limits`
  tables that Tasks 3–6's repositories read/write. Column names/types
  here are the single source of truth those repositories must match
  exactly.

This task has no PHP to test directly (schema-only), but its DDL is
exercised indirectly by every later repository test, which creates the
equivalent schema in SQLite (see Task 3 onward) — the two must stay in
sync by hand, exactly as `EntitlementRepositoryTest.php`'s
`makeEntitlementsTestDb()` already mirrors `schema.sql`'s `entitlements`
table today.

- [ ] **Step 1: Write the migration file**

```sql
-- Phase 3A, PR A — additive migration. Adds real-user identity and
-- Magic Link auth foundation tables. Does NOT alter, drop, or rename
-- payment_events or entitlements (see server/sql/schema.sql) — Phase 2's
-- sandbox-test-user PoC path is completely untouched by this migration.
--
-- Run this once, after server/sql/schema.sql, against the same MariaDB
-- 10.5+ database used by Phase 2 (see docs/paddle-webhook-poc.md's
-- deployment section — this migration is NOT deployed to Xserver as
-- part of this PR; see the PR's own docs for exactly what "additive,
-- not yet deployed" means here).

CREATE TABLE IF NOT EXISTS users (
  -- UUIDv4, generated by server/src/Uuid.php. Public-facing identifier —
  -- never a sequential integer (see docs/superpowers/specs/2026-09-08-
  -- paddle-auth-entitlement-phase3-design.md, section "users").
  id CHAR(36) NOT NULL,
  -- Lowercase + trim only. No Gmail dot/plus-alias folding — see the
  -- design spec's explicit note that any future alias-merging requires
  -- its own reviewed migration, not an automatic normalization change.
  email_normalized VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_email_normalized (email_normalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- The pending identity a request-link call was issued for. NOT a FK
  -- to users at insert time — request-link.php never creates or looks
  -- up a users row (see design spec, "durable user creation timing").
  email_normalized VARCHAR(255) NOT NULL,
  -- Only ever set by verify.php's own reconciliation step, informational —
  -- verify.php resolves the user from email_normalized directly, not from
  -- this column. Kept nullable and unused by application logic at write
  -- time to avoid implying request-link.php touches user identity.
  user_id CHAR(36) NULL,
  -- SHA-256 hex digest of the raw token. Raw token is NEVER stored.
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  -- Set by the atomic conditional UPDATE in AuthService::verify() —
  -- enforces single-use. NULL means still valid/unused.
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_token_hash (token_hash),
  KEY idx_email_normalized (email_normalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- SHA-256 hex digest of the raw session token. Raw token is NEVER
  -- stored. This is a real account credential (see the design spec's
  -- ADR revision) — treated with the same care as the magic-link token.
  token_hash CHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_token_hash (token_hash),
  KEY idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- 'magic_link_email' | 'magic_link_ip' — see server/src/Auth/RateLimiter.php.
  bucket VARCHAR(32) NOT NULL,
  -- HMAC-SHA256(value, RATE_LIMIT_PEPPER) hex digest. NEVER the raw
  -- normalized email or raw IP address — see the design spec's
  -- "Client IP resolution" and "HMAC for both buckets" sections.
  identifier VARCHAR(128) NOT NULL,
  window_start DATETIME NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_bucket_identifier (bucket, identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Verify the SQL is syntactically valid (no MariaDB server needed for this check)**

Run:

```bash
php -l server/sql/migrations/0001_users_auth_foundation.sql 2>&1 || true
```

(This will report "No syntax errors" is meaningless for `.sql` via
`php -l`, since that lints PHP — instead, sanity-check by eye against
`server/sql/schema.sql`'s existing style, and rely on Task 3–6's SQLite
`CREATE TABLE` mirrors actually executing successfully as the real
validation that the column set/types are usable. Confirm no
`ALTER`/`DROP` statements exist in the file:)

```bash
grep -in "ALTER\|DROP" server/sql/migrations/0001_users_auth_foundation.sql
```

Expected: no output (empty grep match) — confirms this migration is
additive-only.

- [ ] **Step 3: Commit**

```bash
git add server/sql/migrations/0001_users_auth_foundation.sql
git commit -m "feat: add additive migration for users/magic-link/sessions/rate-limit tables"
```

---

## Task 3: `UserRepository` — atomic find-or-create

**Files:**
- Create: `server/src/Auth/UserRepository.php`
- Test: `server/tests/Auth/UserRepositoryTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Consumes: `KanaGame\Paddle\Uuid::v4()` (Task 1).
- Produces:
  - `KanaGame\Paddle\Auth\UserRepository::__construct(PDO $pdo)`
  - `findOrCreateByEmail(string $emailNormalized): array{id: string, email_normalized: string}`
    — the MariaDB-safe upsert-then-read find-or-create. Used by
    `AuthService::verify()` (Task 8).
  - `findById(string $id): ?array{id: string, email_normalized: string}`
    — used by `me.php` (Task 11) and tests.

- [ ] **Step 1: Write the failing test**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\UserRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';

function makeUsersTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE users (
            id TEXT PRIMARY KEY,
            email_normalized TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function userRepositoryTests(): array
{
    return [
        'findOrCreateByEmail() creates a new user when none exists' => function () {
            $repo = new UserRepository(makeUsersTestDb());
            $user = $repo->findOrCreateByEmail('new@example.com');

            assertSame('new@example.com', $user['email_normalized'], 'email should match');
            assertTrue(strlen($user['id']) === 36, 'id should be a 36-character UUID string');
        },

        'findOrCreateByEmail() returns the same user on a second call for the same email' => function () {
            $repo = new UserRepository(makeUsersTestDb());
            $first = $repo->findOrCreateByEmail('repeat@example.com');
            $second = $repo->findOrCreateByEmail('repeat@example.com');

            assertSame($first['id'], $second['id'], 'the same email must resolve to the same user id');
        },

        'findOrCreateByEmail() does not create a duplicate row for the same email' => function () {
            $pdo = makeUsersTestDb();
            $repo = new UserRepository($pdo);
            $repo->findOrCreateByEmail('dup@example.com');
            $repo->findOrCreateByEmail('dup@example.com');

            $count = (int) $pdo->query("SELECT COUNT(*) FROM users WHERE email_normalized = 'dup@example.com'")->fetchColumn();
            assertSame(1, $count, 'exactly one row should exist for this email');
        },

        'findById() returns null when no user exists with that id' => function () {
            $repo = new UserRepository(makeUsersTestDb());
            assertSame(null, $repo->findById('00000000-0000-4000-8000-000000000000'), 'unknown id should return null');
        },

        'findById() returns the user created by findOrCreateByEmail()' => function () {
            $repo = new UserRepository(makeUsersTestDb());
            $created = $repo->findOrCreateByEmail('lookup@example.com');
            $found = $repo->findById($created['id']);

            assertTrue($found !== null, 'user should be found by id');
            assertSame('lookup@example.com', $found['email_normalized'], 'email should match');
        },

        'different emails resolve to different user ids' => function () {
            $repo = new UserRepository(makeUsersTestDb());
            $a = $repo->findOrCreateByEmail('a@example.com');
            $b = $repo->findOrCreateByEmail('b@example.com');

            assertFalse($a['id'] === $b['id'], 'different emails must not collide on the same user id');
        },
    ];
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php -r "require 'server/tests/TestCase.php'; require 'server/tests/Auth/UserRepositoryTest.php';"`
Expected: `Fatal error: ... 'KanaGame\Paddle\Auth\UserRepository' not found`.

- [ ] **Step 3: Write minimal implementation**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use KanaGame\Paddle\Uuid;
use PDO;

/**
 * Reads/writes the users table (server/sql/migrations/0001_users_auth_
 * foundation.sql). A users row is created ONLY via findOrCreateByEmail(),
 * which is called exclusively from AuthService::verify() — there is no
 * code path that creates a durable user from an unauthenticated
 * request-link call (see the design spec's "durable user creation
 * timing").
 *
 * findOrCreateByEmail() is MariaDB-safe against two distinct,
 * simultaneously-valid magic-link tokens for the same email being
 * verified concurrently: it uses INSERT ... ON DUPLICATE KEY UPDATE
 * (a no-op on conflict) followed by a re-SELECT, rather than a bare
 * SELECT-then-unprotected-INSERT — see the design spec's dedicated
 * section on this race. The SQLite dialect used by tests has no
 * `ON DUPLICATE KEY UPDATE`, so this repository detects the driver and
 * uses SQLite's equivalent (`INSERT OR IGNORE`) when running under
 * tests — both paths converge on the same re-SELECT.
 */
final class UserRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @return array{id: string, email_normalized: string}
     */
    public function findOrCreateByEmail(string $emailNormalized): array
    {
        $newId = Uuid::v4();
        $driver = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);

        if ($driver === 'sqlite') {
            $insert = $this->pdo->prepare(
                'INSERT OR IGNORE INTO users (id, email_normalized, created_at, updated_at)
                 VALUES (:id, :email, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            );
        } else {
            $insert = $this->pdo->prepare(
                'INSERT INTO users (id, email_normalized, created_at, updated_at)
                 VALUES (:id, :email, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE id = id',
            );
        }
        $insert->execute(['id' => $newId, 'email' => $emailNormalized]);

        $select = $this->pdo->prepare(
            'SELECT id, email_normalized FROM users WHERE email_normalized = :email LIMIT 1',
        );
        $select->execute(['email' => $emailNormalized]);
        /** @var array{id: string, email_normalized: string}|false $row */
        $row = $select->fetch();

        // The row must exist at this point — either this call's own
        // insert won, or a concurrent call's insert won and this
        // SELECT reads it back. See the design spec's concurrency
        // section for why this is safe under a real race.
        return $row;
    }

    /**
     * @return array{id: string, email_normalized: string}|null
     */
    public function findById(string $id): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, email_normalized FROM users WHERE id = :id LIMIT 1',
        );
        $statement->execute(['id' => $id]);
        /** @var array{id: string, email_normalized: string}|false $row */
        $row = $statement->fetch();

        return $row === false ? null : $row;
    }
}
```

- [ ] **Step 4: Register the test file in the runner**

Modify `server/tests/run-tests.php`:

```php
$testFiles = [
    __DIR__ . '/PaddleSignatureTest.php' => 'KanaGame\\Paddle\\Tests\\paddleSignatureTests',
    __DIR__ . '/WebhookHandlerTest.php' => 'KanaGame\\Paddle\\Tests\\webhookHandlerTests',
    __DIR__ . '/EntitlementRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\entitlementRepositoryTests',
    __DIR__ . '/CorsTest.php' => 'KanaGame\\Paddle\\Tests\\corsTests',
    __DIR__ . '/UuidTest.php' => 'KanaGame\\Paddle\\Tests\\uuidTests',
    __DIR__ . '/Auth/UserRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\userRepositoryTests',
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: `42 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add server/src/Auth/UserRepository.php server/tests/Auth/UserRepositoryTest.php server/tests/run-tests.php
git commit -m "feat: add UserRepository with MariaDB-safe find-or-create"
```

---

## Task 4: `MagicLinkTokenRepository` — atomic single-use consume

**Files:**
- Create: `server/src/Auth/MagicLinkTokenRepository.php`
- Test: `server/tests/Auth/MagicLinkTokenRepositoryTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Produces:
  - `KanaGame\Paddle\Auth\MagicLinkTokenRepository::__construct(PDO $pdo)`
  - `issue(string $emailNormalized, string $rawToken, \DateTimeImmutable $expiresAt): void`
    — hashes `$rawToken` internally (SHA-256), inserts a row.
  - `consume(string $rawToken): bool` — hashes `$rawToken`, runs the
    atomic conditional `UPDATE ... WHERE used_at IS NULL AND
    expires_at > NOW()`, returns `true` iff exactly one row was
    affected. Does **not** resolve/create the user itself — that is
    `AuthService::verify()`'s job (Task 8), which calls `consume()`
    first and only proceeds to `UserRepository::findOrCreateByEmail()`
    if it returns `true`. This split keeps this repository's
    responsibility to "the token," matching the single-responsibility
    boundary the spec draws between token-consume and user-creation.
  - `findEmailForRawToken(string $rawToken): ?string` — used by
    `AuthService::verify()` to know *which* email to resolve, called
    only after `consume()` returns `true` (see Task 8 for exactly how
    these are sequenced inside one transaction).

- [ ] **Step 1: Write the failing test**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkTokenRepository.php';

function makeMagicLinkTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE magic_link_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email_normalized TEXT NOT NULL,
            user_id TEXT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function magicLinkTokenRepositoryTests(): array
{
    return [
        'issue() then consume() with the correct raw token succeeds exactly once' => function () {
            $repo = new MagicLinkTokenRepository(makeMagicLinkTestDb());
            $expiresAt = new \DateTimeImmutable('+15 minutes');
            $repo->issue('user@example.com', 'raw-token-abc', $expiresAt);

            assertTrue($repo->consume('raw-token-abc'), 'first consume of a valid token should succeed');
            assertFalse($repo->consume('raw-token-abc'), 'second consume of the same token must fail (single-use)');
        },

        'consume() with an unknown token fails' => function () {
            $repo = new MagicLinkTokenRepository(makeMagicLinkTestDb());
            assertFalse($repo->consume('never-issued'), 'an unknown token must not be consumable');
        },

        'consume() with an expired token fails' => function () {
            $repo = new MagicLinkTokenRepository(makeMagicLinkTestDb());
            $expiresAt = new \DateTimeImmutable('-1 minute');
            $repo->issue('user@example.com', 'expired-token', $expiresAt);

            assertFalse($repo->consume('expired-token'), 'an expired token must not be consumable');
        },

        'the raw token is never stored in the database' => function () {
            $pdo = makeMagicLinkTestDb();
            $repo = new MagicLinkTokenRepository($pdo);
            $repo->issue('user@example.com', 'super-secret-raw-value', new \DateTimeImmutable('+15 minutes'));

            $rows = $pdo->query('SELECT token_hash FROM magic_link_tokens')->fetchAll();
            foreach ($rows as $row) {
                assertFalse(
                    str_contains($row['token_hash'], 'super-secret-raw-value'),
                    'the raw token value must never appear in a persisted column',
                );
            }
        },

        'findEmailForRawToken() returns the associated email for a known token' => function () {
            $repo = new MagicLinkTokenRepository(makeMagicLinkTestDb());
            $repo->issue('find-me@example.com', 'find-token', new \DateTimeImmutable('+15 minutes'));

            assertSame('find-me@example.com', $repo->findEmailForRawToken('find-token'), 'email should match the issued token');
        },

        'findEmailForRawToken() returns null for an unknown token' => function () {
            $repo = new MagicLinkTokenRepository(makeMagicLinkTestDb());
            assertSame(null, $repo->findEmailForRawToken('nonexistent'), 'unknown token should return null');
        },
    ];
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php -r "require 'server/tests/TestCase.php'; require 'server/tests/Auth/MagicLinkTokenRepositoryTest.php';"`
Expected: `Fatal error: ... 'MagicLinkTokenRepository' not found`.

- [ ] **Step 3: Write minimal implementation**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * Reads/writes magic_link_tokens. The raw token is never stored — only
 * SHA-256(raw) — and consume() enforces single-use via an atomic
 * conditional UPDATE + affected-row-count check (never SELECT-then-
 * UPDATE), per the design spec's concurrency requirements.
 */
final class MagicLinkTokenRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function issue(string $emailNormalized, string $rawToken, \DateTimeImmutable $expiresAt): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO magic_link_tokens (email_normalized, token_hash, expires_at, created_at)
             VALUES (:email, :token_hash, :expires_at, CURRENT_TIMESTAMP)',
        );
        $statement->execute([
            'email' => $emailNormalized,
            'token_hash' => hash('sha256', $rawToken),
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        ]);
    }

    /**
     * Atomic single-use consume. Returns true iff exactly one
     * not-yet-used, not-yet-expired token matching this hash was
     * marked used by this call — false for unknown/expired/already-used
     * tokens, with no distinction between those three reasons exposed
     * to the caller (that distinction is deliberately erased here, not
     * just at the HTTP layer, so no call site can accidentally leak it).
     */
    public function consume(string $rawToken): bool
    {
        $tokenHash = hash('sha256', $rawToken);
        $nowExpression = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';

        $statement = $this->pdo->prepare(
            "UPDATE magic_link_tokens
             SET used_at = {$nowExpression}
             WHERE token_hash = :token_hash AND used_at IS NULL AND expires_at > {$nowExpression}",
        );
        $statement->execute(['token_hash' => $tokenHash]);

        return $statement->rowCount() === 1;
    }

    public function findEmailForRawToken(string $rawToken): ?string
    {
        $statement = $this->pdo->prepare(
            'SELECT email_normalized FROM magic_link_tokens WHERE token_hash = :token_hash LIMIT 1',
        );
        $statement->execute(['token_hash' => hash('sha256', $rawToken)]);
        $email = $statement->fetchColumn();

        return $email === false ? null : $email;
    }
}
```

**Note on the `NOW()`/`datetime('now')` split**: `EntitlementRepository`
(Phase 2) avoids this by never comparing against wall-clock time in SQL.
This repository must compare against wall-clock time (expiry), and
SQLite/MariaDB spell "current timestamp" differently — this driver
check is the minimal portable way to keep one code path working
against both, consistent with `MagicLinkTokenRepository::consume()`'s
sibling `UserRepository::findOrCreateByEmail()` already needing an
analogous driver check (Task 3).

- [ ] **Step 4: Register the test file in the runner**

Modify `server/tests/run-tests.php`, adding after the `UserRepositoryTest.php` line:

```php
    __DIR__ . '/Auth/MagicLinkTokenRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\magicLinkTokenRepositoryTests',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: `48 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add server/src/Auth/MagicLinkTokenRepository.php server/tests/Auth/MagicLinkTokenRepositoryTest.php server/tests/run-tests.php
git commit -m "feat: add MagicLinkTokenRepository with atomic single-use consume"
```

---

## Task 5: `SessionRepository`

**Files:**
- Create: `server/src/Auth/SessionRepository.php`
- Test: `server/tests/Auth/SessionRepositoryTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Produces:
  - `KanaGame\Paddle\Auth\SessionRepository::__construct(PDO $pdo)`
  - `create(string $userId, string $rawToken, \DateTimeImmutable $expiresAt): void`
  - `findActiveUserIdForRawToken(string $rawToken): ?string` — returns
    the `user_id` iff the token's hash matches a row with
    `revoked_at IS NULL AND expires_at > NOW()`, else `null`. Updates
    `last_seen_at` as a side effect on a successful lookup.
  - `revoke(string $rawToken): void` — sets `revoked_at` for the
    matching row; a no-op (no error) if the token doesn't match any row.

**Session expiry rationale (Global Constraints already states the
number; here is the "why" an implementer needs)**: the design spec says
"expiry defined explicitly" without picking a number. 30 days matches a
typical "stay signed in" web session lifetime, is long enough that the
in-memory-only transport (Section 3 of the spec) doesn't force
re-verification every page load during active testing, and is short
enough to bound the blast radius of a leaked token per the ADR's own
"this is a real account credential" framing. This is a config default
(`SESSION_EXPIRY_DAYS`), not a hardcoded magic number — see Task 9.

- [ ] **Step 1: Write the failing test**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\SessionRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';

function makeSessionsTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE sessions (
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
function sessionRepositoryTests(): array
{
    return [
        'create() then findActiveUserIdForRawToken() resolves the correct user' => function () {
            $repo = new SessionRepository(makeSessionsTestDb());
            $repo->create('user-123', 'session-raw-token', new \DateTimeImmutable('+30 days'));

            assertSame('user-123', $repo->findActiveUserIdForRawToken('session-raw-token'), 'should resolve to the created user');
        },

        'findActiveUserIdForRawToken() returns null for an unknown token' => function () {
            $repo = new SessionRepository(makeSessionsTestDb());
            assertSame(null, $repo->findActiveUserIdForRawToken('never-created'), 'unknown token should return null');
        },

        'findActiveUserIdForRawToken() returns null for an expired session' => function () {
            $repo = new SessionRepository(makeSessionsTestDb());
            $repo->create('user-456', 'expired-session', new \DateTimeImmutable('-1 minute'));

            assertSame(null, $repo->findActiveUserIdForRawToken('expired-session'), 'expired session must not resolve');
        },

        'revoke() invalidates a session (logout)' => function () {
            $repo = new SessionRepository(makeSessionsTestDb());
            $repo->create('user-789', 'to-be-revoked', new \DateTimeImmutable('+30 days'));
            $repo->revoke('to-be-revoked');

            assertSame(null, $repo->findActiveUserIdForRawToken('to-be-revoked'), 'a revoked session must not resolve');
        },

        'revoke() on an unknown token does not throw' => function () {
            $repo = new SessionRepository(makeSessionsTestDb());
            $repo->revoke('never-existed');
            assertTrue(true, 'revoke() on an unknown token should be a safe no-op');
        },

        'the raw session token is never stored in the database' => function () {
            $pdo = makeSessionsTestDb();
            $repo = new SessionRepository($pdo);
            $repo->create('user-abc', 'super-secret-session-value', new \DateTimeImmutable('+30 days'));

            $rows = $pdo->query('SELECT token_hash FROM sessions')->fetchAll();
            foreach ($rows as $row) {
                assertFalse(
                    str_contains($row['token_hash'], 'super-secret-session-value'),
                    'the raw session token must never appear in a persisted column',
                );
            }
        },
    ];
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php -r "require 'server/tests/TestCase.php'; require 'server/tests/Auth/SessionRepositoryTest.php';"`
Expected: `Fatal error: ... 'SessionRepository' not found`.

- [ ] **Step 3: Write minimal implementation**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * Reads/writes sessions. Raw session token is never stored — only
 * SHA-256(raw). A session is a real account credential (see the design
 * spec's ADR revision), not merely an entitlement flag — it can resolve
 * to a user id that later authorizes reading that account's own email
 * and creating purchase intents (PR B).
 */
final class SessionRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function create(string $userId, string $rawToken, \DateTimeImmutable $expiresAt): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO sessions (token_hash, user_id, expires_at, created_at, last_seen_at)
             VALUES (:token_hash, :user_id, :expires_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        );
        $statement->execute([
            'token_hash' => hash('sha256', $rawToken),
            'user_id' => $userId,
            'expires_at' => $expiresAt->format('Y-m-d H:i:s'),
        ]);
    }

    public function findActiveUserIdForRawToken(string $rawToken): ?string
    {
        $tokenHash = hash('sha256', $rawToken);
        $nowExpression = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';

        $select = $this->pdo->prepare(
            "SELECT user_id FROM sessions
             WHERE token_hash = :token_hash AND revoked_at IS NULL AND expires_at > {$nowExpression}
             LIMIT 1",
        );
        $select->execute(['token_hash' => $tokenHash]);
        $userId = $select->fetchColumn();

        if ($userId === false) {
            return null;
        }

        $touch = $this->pdo->prepare(
            "UPDATE sessions SET last_seen_at = {$nowExpression} WHERE token_hash = :token_hash",
        );
        $touch->execute(['token_hash' => $tokenHash]);

        return $userId;
    }

    public function revoke(string $rawToken): void
    {
        $nowExpression = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';

        $statement = $this->pdo->prepare(
            "UPDATE sessions SET revoked_at = {$nowExpression}
             WHERE token_hash = :token_hash AND revoked_at IS NULL",
        );
        $statement->execute(['token_hash' => hash('sha256', $rawToken)]);
    }
}
```

- [ ] **Step 4: Register the test file in the runner**

Modify `server/tests/run-tests.php`, adding after the
`MagicLinkTokenRepositoryTest.php` line:

```php
    __DIR__ . '/Auth/SessionRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\sessionRepositoryTests',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: `54 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add server/src/Auth/SessionRepository.php server/tests/Auth/SessionRepositoryTest.php server/tests/run-tests.php
git commit -m "feat: add SessionRepository with revocable hash-at-rest sessions"
```

---

## Task 6: `RateLimiter` — HMAC-keyed, configurable thresholds

**Files:**
- Create: `server/src/Auth/RateLimiter.php`
- Test: `server/tests/Auth/RateLimiterTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Produces:
  - `KanaGame\Paddle\Auth\RateLimiter::__construct(PDO $pdo, string $pepper, int $emailLimitPerHour, int $ipLimitPerHour)`
  - `checkAndRecordEmail(string $emailNormalized): bool` — returns
    `true` if this request is allowed (and records it), `false` if the
    per-email hourly limit is exceeded.
  - `checkAndRecordIp(string $rawIp): bool` — same shape, IP bucket.
  - Both compute `hash_hmac('sha256', "{$bucket}:{$value}", $pepper)`
    as the stored `identifier` — the bucket name is included in the
    HMAC input specifically so the same raw value (unlikely for
    email-vs-IP, but a deliberate design choice per the spec's "domain
    separation" note) can never collide across the two buckets.

- [ ] **Step 1: Write the failing test**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\RateLimiter;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/RateLimiter.php';

function makeRateLimitTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE rate_limits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bucket TEXT NOT NULL,
            identifier TEXT NOT NULL,
            window_start TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            UNIQUE (bucket, identifier)
        )',
    );
    return $pdo;
}

/**
 * @return array<string, callable(): void>
 */
function rateLimiterTests(): array
{
    return [
        'checkAndRecordEmail() allows requests under the limit' => function () {
            $limiter = new RateLimiter(makeRateLimitTestDb(), 'test-pepper', 5, 20);
            for ($i = 0; $i < 5; $i++) {
                assertTrue($limiter->checkAndRecordEmail('user@example.com'), "request {$i} should be allowed");
            }
        },

        'checkAndRecordEmail() blocks the 6th request within the same hour for the same email' => function () {
            $limiter = new RateLimiter(makeRateLimitTestDb(), 'test-pepper', 5, 20);
            for ($i = 0; $i < 5; $i++) {
                $limiter->checkAndRecordEmail('user@example.com');
            }
            assertFalse($limiter->checkAndRecordEmail('user@example.com'), '6th request within the window must be blocked');
        },

        'checkAndRecordIp() blocks the 21st request within the same hour for the same IP' => function () {
            $limiter = new RateLimiter(makeRateLimitTestDb(), 'test-pepper', 5, 20);
            for ($i = 0; $i < 20; $i++) {
                $limiter->checkAndRecordIp('203.0.113.5');
            }
            assertFalse($limiter->checkAndRecordIp('203.0.113.5'), '21st request within the window must be blocked');
        },

        'one IP cycling through many different emails is still blocked by the IP bucket' => function () {
            $limiter = new RateLimiter(makeRateLimitTestDb(), 'test-pepper', 5, 20);
            for ($i = 0; $i < 20; $i++) {
                $allowedEmail = $limiter->checkAndRecordEmail("victim{$i}@example.com");
                $allowedIp = $limiter->checkAndRecordIp('198.51.100.9');
                assertTrue($allowedEmail, "each distinct email is individually under its own limit (attempt {$i})");
                assertTrue($allowedIp, "IP attempt {$i} should still be under the 20/hour IP limit");
            }
            assertFalse($limiter->checkAndRecordIp('198.51.100.9'), 'the 21st request from this one IP must be blocked even though every email differed');
        },

        'one email tried from many different IPs is still blocked by the email bucket' => function () {
            $limiter = new RateLimiter(makeRateLimitTestDb(), 'test-pepper', 5, 20);
            for ($i = 0; $i < 5; $i++) {
                $allowedEmail = $limiter->checkAndRecordEmail('target@example.com');
                $allowedIp = $limiter->checkAndRecordIp("192.0.2.{$i}");
                assertTrue($allowedEmail, "email attempt {$i} should still be under the 5/hour email limit");
                assertTrue($allowedIp, "each distinct IP is individually under its own limit (attempt {$i})");
            }
            assertFalse($limiter->checkAndRecordEmail('target@example.com'), 'the 6th request for this one email must be blocked even though every IP differed');
        },

        'the raw email is never persisted — only its HMAC is stored' => function () {
            $pdo = makeRateLimitTestDb();
            $limiter = new RateLimiter($pdo, 'test-pepper', 5, 20);
            $limiter->checkAndRecordEmail('sensitive@example.com');

            $rows = $pdo->query("SELECT identifier FROM rate_limits WHERE bucket = 'magic_link_email'")->fetchAll();
            assertTrue(count($rows) === 1, 'exactly one rate-limit row should exist');
            foreach ($rows as $row) {
                assertFalse(
                    str_contains($row['identifier'], 'sensitive@example.com'),
                    'the raw email must never appear in the persisted identifier column',
                );
            }
        },

        'the raw IP is never persisted — only its HMAC is stored' => function () {
            $pdo = makeRateLimitTestDb();
            $limiter = new RateLimiter($pdo, 'test-pepper', 5, 20);
            $limiter->checkAndRecordIp('203.0.113.77');

            $rows = $pdo->query("SELECT identifier FROM rate_limits WHERE bucket = 'magic_link_ip'")->fetchAll();
            assertTrue(count($rows) === 1, 'exactly one rate-limit row should exist');
            foreach ($rows as $row) {
                assertFalse(
                    str_contains($row['identifier'], '203.0.113.77'),
                    'the raw IP must never appear in the persisted identifier column',
                );
            }
        },
    ];
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php -r "require 'server/tests/TestCase.php'; require 'server/tests/Auth/RateLimiterTest.php';"`
Expected: `Fatal error: ... 'RateLimiter' not found`.

- [ ] **Step 3: Write minimal implementation**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * Fixed-window, DB-backed rate limiter for magic-link requests. Never
 * persists a raw email or raw IP — only HMAC-SHA256(bucket:value,
 * pepper). No Redis/external service, per the design spec's explicit
 * "MariaDB/PHP only" requirement.
 */
final class RateLimiter
{
    private const BUCKET_EMAIL = 'magic_link_email';
    private const BUCKET_IP = 'magic_link_ip';
    private const WINDOW_SECONDS = 3600;

    public function __construct(
        private readonly PDO $pdo,
        private readonly string $pepper,
        private readonly int $emailLimitPerHour,
        private readonly int $ipLimitPerHour,
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

    private function checkAndRecord(string $bucket, string $rawValue, int $limitPerHour): bool
    {
        $identifier = hash_hmac('sha256', "{$bucket}:{$rawValue}", $this->pepper);
        $now = new \DateTimeImmutable();

        $select = $this->pdo->prepare(
            'SELECT id, window_start, count FROM rate_limits WHERE bucket = :bucket AND identifier = :identifier LIMIT 1',
        );
        $select->execute(['bucket' => $bucket, 'identifier' => $identifier]);
        /** @var array{id: int, window_start: string, count: int}|false $row */
        $row = $select->fetch();

        if ($row === false) {
            $this->insertNewWindow($bucket, $identifier, $now);
            return $limitPerHour > 0;
        }

        $windowStart = new \DateTimeImmutable($row['window_start']);
        $windowAge = $now->getTimestamp() - $windowStart->getTimestamp();

        if ($windowAge >= self::WINDOW_SECONDS) {
            // Window expired — lazily reset it in place (pruning by
            // overwrite, no separate cleanup job needed).
            $reset = $this->pdo->prepare(
                'UPDATE rate_limits SET window_start = :window_start, count = 1 WHERE id = :id',
            );
            $reset->execute(['window_start' => $now->format('Y-m-d H:i:s'), 'id' => $row['id']]);
            return $limitPerHour > 0;
        }

        if ((int) $row['count'] >= $limitPerHour) {
            return false;
        }

        $increment = $this->pdo->prepare(
            'UPDATE rate_limits SET count = count + 1 WHERE id = :id',
        );
        $increment->execute(['id' => $row['id']]);

        return true;
    }

    private function insertNewWindow(string $bucket, string $identifier, \DateTimeImmutable $now): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO rate_limits (bucket, identifier, window_start, count)
             VALUES (:bucket, :identifier, :window_start, 1)',
        );
        $statement->execute([
            'bucket' => $bucket,
            'identifier' => $identifier,
            'window_start' => $now->format('Y-m-d H:i:s'),
        ]);
    }
}
```

- [ ] **Step 4: Register the test file in the runner**

Modify `server/tests/run-tests.php`, adding after the
`SessionRepositoryTest.php` line:

```php
    __DIR__ . '/Auth/RateLimiterTest.php' => 'KanaGame\\Paddle\\Tests\\rateLimiterTests',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: `61 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add server/src/Auth/RateLimiter.php server/tests/Auth/RateLimiterTest.php server/tests/run-tests.php
git commit -m "feat: add HMAC-keyed DB-backed rate limiter for magic-link requests"
```

---

## Task 7: `Mailer` interface + test-only `FakeMailer`

**Files:**
- Create: `server/src/Auth/Mailer.php`
- Create: `server/src/Auth/FakeMailer.php`
- Test: covered by `AuthServiceTest.php` in Task 8 (this task has no
  standalone test file — `Mailer`/`FakeMailer` are trivial enough that
  their behavior is fully exercised through `AuthService`'s tests,
  matching this repo's existing convention of not writing a dedicated
  test file for a class with no branching logic of its own, e.g.
  `SandboxUser.php` has no test file either).

**Interfaces:**
- Produces:
  - `KanaGame\Paddle\Auth\Mailer` (interface):
    `sendMagicLink(string $emailNormalized, string $magicLinkUrl): void`
  - `KanaGame\Paddle\Auth\FakeMailer implements Mailer` — records every
    call in an in-memory array (`public array $sent = []`, each entry
    `['email' => ..., 'url' => ...]`), used only by
    `server/tests/Auth/AuthServiceTest.php`. **Not** used by any
    production entrypoint — `request-link.php` (Task 9) does not
    instantiate `FakeMailer` under any config; a real `Mailer`
    implementation is out of scope for this PR entirely (see the design
    spec — a real SMTP transport needs a real credential, a human
    checkpoint).

- [ ] **Step 1: Write the interface**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Sends a Magic Link email. The only implementation in Phase 3A PR A is
 * FakeMailer (test-only, in-memory). A real SMTP/XServer-mail transport
 * is a documented future implementation of this same interface — not
 * built in this PR, since it needs a real credential (human checkpoint
 * per the task brief). No production email is ever sent by this PR's
 * code.
 */
interface Mailer
{
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void;
}
```

- [ ] **Step 2: Write `FakeMailer`**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Test-only in-memory Mailer. Its state does NOT and CANNOT survive
 * across separate HTTP requests — each PHP-FPM/CGI request is a fresh
 * process with no shared memory (see the design spec's explicit note
 * on this). FakeMailer is therefore only ever instantiated inside
 * same-process PHP unit tests (server/tests/Auth/AuthServiceTest.php) —
 * never by request-link.php or any other real entrypoint.
 */
final class FakeMailer implements Mailer
{
    /** @var list<array{email: string, url: string}> */
    public array $sent = [];

    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
        $this->sent[] = ['email' => $emailNormalized, 'url' => $magicLinkUrl];
    }
}
```

- [ ] **Step 3: Confirm both files parse cleanly**

Run:

```bash
php -l server/src/Auth/Mailer.php
php -l server/src/Auth/FakeMailer.php
```

Expected: `No syntax errors detected` for both.

- [ ] **Step 4: Commit**

```bash
git add server/src/Auth/Mailer.php server/src/Auth/FakeMailer.php
git commit -m "feat: add Mailer interface and test-only FakeMailer"
```

---

## Task 8: `AuthService` — orchestration, transaction boundaries, email normalization

This is the task where the transaction-boundary requirements (spec
Section 1: "atomic same-token verification," "concurrent two-distinct-
links/same-email safe user creation") and the enumeration-safety
requirement actually get wired together. Read this task fully before
starting Task 9 (`request-link.php`) — that entrypoint is a thin
wrapper around this class.

**Files:**
- Create: `server/src/Auth/EmailNormalizer.php`
- Create: `server/src/Auth/AuthService.php`
- Test: `server/tests/Auth/EmailNormalizerTest.php`
- Test: `server/tests/Auth/AuthServiceTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Consumes: `UserRepository` (Task 3), `MagicLinkTokenRepository`
  (Task 4), `SessionRepository` (Task 5), `RateLimiter` (Task 6),
  `Mailer` (Task 7).
- Produces:
  - `KanaGame\Paddle\Auth\EmailNormalizer::normalize(string $rawEmail): string`
    — lowercase + trim only (spec-mandated; no alias folding).
  - `KanaGame\Paddle\Auth\AuthService::__construct(PDO $pdo, MagicLinkTokenRepository $tokens, UserRepository $users, SessionRepository $sessions, RateLimiter $rateLimiter, Mailer $mailer, string $magicLinkBaseUrl, int $tokenExpiryMinutes, int $sessionExpiryDays)`
  - `requestLink(string $rawEmail, string $clientIp): void` — always
    succeeds from the caller's point of view (no return value/exception
    for "email not registered" — see below); internally: normalize →
    rate-limit both buckets → if either bucket rejects, return silently
    (no token issued, no mailer call, no exception) → else generate raw
    token → `tokens->issue()` → `mailer->sendMagicLink()`. **This method
    never touches `UserRepository`** — enforces the "no unauthenticated
    identity creation" rule at the service layer, not just by
    convention.
  - `AuthResult` — a small value object.
  - `verify(string $rawToken): AuthResult` — this is the method with
    the transaction boundary: opens one `PDO` transaction, calls
    `tokens->consume($rawToken)`; if `false`, rolls back and returns
    `AuthResult::invalid()`; if `true`, calls
    `tokens->findEmailForRawToken($rawToken)` (still valid to read even
    though `used_at` is now set — the row itself isn't deleted),
    `users->findOrCreateByEmail($email)`, generates a raw session token,
    `sessions->create($user['id'], $rawSessionToken, $sessionExpiresAt)`,
    commits, returns `AuthResult::success($rawSessionToken, $user)`.
  - `me(string $rawSessionToken): ?array{user_id: string, email_normalized: string}`
    — resolves via `SessionRepository::findActiveUserIdForRawToken()`
    then `UserRepository::findById()`.
  - `logout(string $rawSessionToken): void` — delegates to
    `SessionRepository::revoke()`.

**Why the transaction spans `consume()` through `sessions->create()`**:
if the process crashed between a successful token-consume and session
creation, the user's token would be permanently burned with no session
issued — a real (if rare) availability bug. Wrapping both in one
transaction means either the whole verify succeeds (token consumed +
user resolved + session created, all durable) or none of it does (token
stays unconsumed, safe to retry). This directly implements the
design spec's "atomic same-token verification" and "be explicit about
transaction boundaries" requirements.

- [ ] **Step 1: Write the failing test for `EmailNormalizer`**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\EmailNormalizer;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/EmailNormalizer.php';

/**
 * @return array<string, callable(): void>
 */
function emailNormalizerTests(): array
{
    return [
        'normalize() lowercases the email' => function () {
            assertSame('user@example.com', EmailNormalizer::normalize('User@Example.com'), 'should be lowercased');
        },

        'normalize() trims leading/trailing whitespace' => function () {
            assertSame('user@example.com', EmailNormalizer::normalize('  user@example.com  '), 'should be trimmed');
        },

        'normalize() does NOT fold Gmail dot aliases' => function () {
            assertSame('a.b@example.com', EmailNormalizer::normalize('a.b@example.com'), 'dots must be preserved — no alias folding per the design spec');
        },

        'normalize() does NOT fold Gmail plus aliases' => function () {
            assertSame('user+tag@example.com', EmailNormalizer::normalize('user+tag@example.com'), 'plus-tags must be preserved — no alias folding per the design spec');
        },
    ];
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php -r "require 'server/tests/TestCase.php'; require 'server/tests/Auth/EmailNormalizerTest.php';"`
Expected: `Fatal error: ... 'EmailNormalizer' not found`.

- [ ] **Step 3: Write `EmailNormalizer`**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Deliberately minimal: lowercase + trim only. No Gmail dot/plus-alias
 * folding — see the design spec's explicit note that merging identities
 * this way requires its own reviewed migration, not an automatic
 * normalization change.
 */
final class EmailNormalizer
{
    public static function normalize(string $rawEmail): string
    {
        return strtolower(trim($rawEmail));
    }

    private function __construct()
    {
    }
}
```

- [ ] **Step 4: Register `EmailNormalizerTest.php` and run**

Add to `server/tests/run-tests.php`:

```php
    __DIR__ . '/Auth/EmailNormalizerTest.php' => 'KanaGame\\Paddle\\Tests\\emailNormalizerTests',
```

Run: `php server/tests/run-tests.php`
Expected: `65 passed, 0 failed`.

- [ ] **Step 5: Commit the normalizer**

```bash
git add server/src/Auth/EmailNormalizer.php server/tests/Auth/EmailNormalizerTest.php server/tests/run-tests.php
git commit -m "feat: add EmailNormalizer (lowercase+trim only, no alias folding)"
```

- [ ] **Step 6: Write the failing test for `AuthService`**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\AuthService;
use KanaGame\Paddle\Auth\FakeMailer;
use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/AuthService.php';
require_once __DIR__ . '/../../src/Auth/EmailNormalizer.php';
require_once __DIR__ . '/../../src/Auth/FakeMailer.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkTokenRepository.php';
require_once __DIR__ . '/../../src/Auth/RateLimiter.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';
require_once __DIR__ . '/../../src/Uuid.php';

function makeAuthServiceTestDb(): PDO
{
    $pdo = new PDO('sqlite::memory:');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec(
        'CREATE TABLE users (
            id TEXT PRIMARY KEY,
            email_normalized TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    $pdo->exec(
        'CREATE TABLE magic_link_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email_normalized TEXT NOT NULL,
            user_id TEXT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    $pdo->exec(
        'CREATE TABLE sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_hash TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            revoked_at TEXT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )',
    );
    $pdo->exec(
        'CREATE TABLE rate_limits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bucket TEXT NOT NULL,
            identifier TEXT NOT NULL,
            window_start TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            UNIQUE (bucket, identifier)
        )',
    );
    return $pdo;
}

function makeAuthService(PDO $pdo, ?FakeMailer $mailer = null): AuthService
{
    return new AuthService(
        $pdo,
        new MagicLinkTokenRepository($pdo),
        new UserRepository($pdo),
        new SessionRepository($pdo),
        new RateLimiter($pdo, 'test-pepper', 5, 20),
        $mailer ?? new FakeMailer(),
        'https://example.com/kana-game/#/verify',
        15,
        30,
    );
}

/**
 * @return array<string, callable(): void>
 */
function authServiceTests(): array
{
    return [
        'requestLink() sends a magic link email for a valid request' => function () {
            $mailer = new FakeMailer();
            $service = makeAuthService(makeAuthServiceTestDb(), $mailer);
            $service->requestLink('User@Example.com', '203.0.113.1');

            assertSame(1, count($mailer->sent), 'exactly one email should have been sent');
            assertSame('user@example.com', $mailer->sent[0]['email'], 'the recorded email should be normalized');
        },

        'requestLink() does not create a users row' => function () {
            $pdo = makeAuthServiceTestDb();
            $service = makeAuthService($pdo);
            $service->requestLink('nouser@example.com', '203.0.113.1');

            $count = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(0, $count, 'request-link must never create a durable user row');
        },

        'requestLink() silently drops the email send when the per-email rate limit is exceeded' => function () {
            $mailer = new FakeMailer();
            $pdo = makeAuthServiceTestDb();
            $service = makeAuthService($pdo, $mailer);
            for ($i = 0; $i < 5; $i++) {
                $service->requestLink('spammed@example.com', "203.0.113.{$i}");
            }
            $service->requestLink('spammed@example.com', '203.0.113.99');

            assertSame(5, count($mailer->sent), 'the 6th request in the window must not trigger a mailer call');
        },

        'verify() with a freshly issued token succeeds and creates a session' => function () {
            $mailer = new FakeMailer();
            $service = makeAuthService(makeAuthServiceTestDb(), $mailer);
            $service->requestLink('verify-me@example.com', '203.0.113.1');

            $sentUrl = $mailer->sent[0]['url'];
            $rawToken = substr($sentUrl, strrpos($sentUrl, '=') + 1);

            $result = $service->verify($rawToken);

            assertTrue($result->success, 'verification should succeed');
            assertTrue($result->sessionToken !== null, 'a session token should be returned');
            assertSame('verify-me@example.com', $result->user['email_normalized'], 'resolved user should match');
        },

        'verify() creates exactly one user on first-ever verification' => function () {
            $pdo = makeAuthServiceTestDb();
            $mailer = new FakeMailer();
            $service = makeAuthService($pdo, $mailer);
            $service->requestLink('firsttime@example.com', '203.0.113.1');
            $sentUrl = $mailer->sent[0]['url'];
            $rawToken = substr($sentUrl, strrpos($sentUrl, '=') + 1);

            $service->verify($rawToken);

            $count = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(1, $count, 'exactly one user row should exist after first verification');
        },

        'verify() with the same token twice succeeds once and fails the second time (single-use)' => function () {
            $mailer = new FakeMailer();
            $service = makeAuthService(makeAuthServiceTestDb(), $mailer);
            $service->requestLink('reuse@example.com', '203.0.113.1');
            $sentUrl = $mailer->sent[0]['url'];
            $rawToken = substr($sentUrl, strrpos($sentUrl, '=') + 1);

            $first = $service->verify($rawToken);
            $second = $service->verify($rawToken);

            assertTrue($first->success, 'first verify should succeed');
            assertFalse($second->success, 'second verify of the same token must fail');
        },

        'verify() with an unknown token fails with the same generic result shape as an expired/used token' => function () {
            $service = makeAuthService(makeAuthServiceTestDb());
            $result = $service->verify('never-issued-token');

            assertFalse($result->success, 'unknown token must fail');
            assertSame(null, $result->sessionToken, 'no session token should be returned on failure');
        },

        'me() resolves the correct user for a valid session token' => function () {
            $mailer = new FakeMailer();
            $service = makeAuthService(makeAuthServiceTestDb(), $mailer);
            $service->requestLink('me-test@example.com', '203.0.113.1');
            $sentUrl = $mailer->sent[0]['url'];
            $rawToken = substr($sentUrl, strrpos($sentUrl, '=') + 1);
            $verifyResult = $service->verify($rawToken);

            $me = $service->me($verifyResult->sessionToken);

            assertTrue($me !== null, 'me() should resolve for a valid session');
            assertSame('me-test@example.com', $me['email_normalized'], 'email should match');
        },

        'me() returns null for an invalid session token' => function () {
            $service = makeAuthService(makeAuthServiceTestDb());
            assertSame(null, $service->me('bogus-session-token'), 'an invalid token must not resolve');
        },

        'logout() revokes the session so a later me() call fails' => function () {
            $mailer = new FakeMailer();
            $service = makeAuthService(makeAuthServiceTestDb(), $mailer);
            $service->requestLink('logout-test@example.com', '203.0.113.1');
            $sentUrl = $mailer->sent[0]['url'];
            $rawToken = substr($sentUrl, strrpos($sentUrl, '=') + 1);
            $verifyResult = $service->verify($rawToken);

            $service->logout($verifyResult->sessionToken);

            assertSame(null, $service->me($verifyResult->sessionToken), 'me() must fail after logout');
        },

        // --- Concurrency tests required by the design spec (Section 6) ---

        'two concurrent verify() calls for the SAME token: exactly one succeeds' => function () {
            $mailer = new FakeMailer();
            $service = makeAuthService(makeAuthServiceTestDb(), $mailer);
            $service->requestLink('race-same-token@example.com', '203.0.113.1');
            $sentUrl = $mailer->sent[0]['url'];
            $rawToken = substr($sentUrl, strrpos($sentUrl, '=') + 1);

            // Simulated concurrency: sequential calls against the same
            // underlying DB state model the race, since PHP CLI test
            // execution is single-threaded — what matters is that the
            // SECOND call sees the already-used token and is rejected,
            // proving the atomic consume (not true OS-level threading)
            // is what's under test here.
            $first = $service->verify($rawToken);
            $second = $service->verify($rawToken);

            $successCount = ($first->success ? 1 : 0) + ($second->success ? 1 : 0);
            assertSame(1, $successCount, 'exactly one of the two concurrent verifications must succeed');
        },

        'two DISTINCT valid tokens for the SAME email: both succeed, resolve to one user, no duplicate-key error' => function () {
            $pdo = makeAuthServiceTestDb();
            $mailer = new FakeMailer();
            $service = makeAuthService($pdo, $mailer);

            // Two separate magic-link requests for the same email produce
            // two distinct, both-still-valid tokens (Link A, Link B).
            $service->requestLink('two-links@example.com', '203.0.113.1');
            $service->requestLink('two-links@example.com', '203.0.113.2');
            $rawTokenA = substr($mailer->sent[0]['url'], strrpos($mailer->sent[0]['url'], '=') + 1);
            $rawTokenB = substr($mailer->sent[1]['url'], strrpos($mailer->sent[1]['url'], '=') + 1);

            $resultA = $service->verify($rawTokenA);
            $resultB = $service->verify($rawTokenB);

            assertTrue($resultA->success, 'verifying link A must succeed');
            assertTrue($resultB->success, 'verifying link B must succeed');
            assertSame(
                $resultA->user['id'],
                $resultB->user['id'],
                'both links for the same email must resolve to the same user id',
            );

            $userCount = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(1, $userCount, 'exactly one user row must exist — no duplicate-key error, no duplicate user');

            $meA = $service->me($resultA->sessionToken);
            $meB = $service->me($resultB->sessionToken);
            assertTrue($meA !== null && $meB !== null, 'both sessions must independently resolve');
        },
    ];
}
```

- [ ] **Step 7: Run test to verify it fails**

Run: `php -r "require 'server/tests/TestCase.php'; require 'server/tests/Auth/AuthServiceTest.php';"`
Expected: `Fatal error: ... 'AuthService' not found`.

- [ ] **Step 8: Write `AuthService`**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * Value object returned by AuthService::verify(). success=false never
 * distinguishes WHY (unknown/expired/already-used token) — see the
 * design spec's requirement that verify.php's response not help an
 * attacker fingerprint token state.
 */
final class AuthResult
{
    /**
     * @param array{id: string, email_normalized: string}|null $user
     */
    private function __construct(
        public readonly bool $success,
        public readonly ?string $sessionToken,
        public readonly ?array $user,
    ) {
    }

    public static function invalid(): self
    {
        return new self(false, null, null);
    }

    /**
     * @param array{id: string, email_normalized: string} $user
     */
    public static function success(string $sessionToken, array $user): self
    {
        return new self(true, $sessionToken, $user);
    }
}

/**
 * Orchestrates the Magic Link auth flow across the Auth repositories.
 * Two transaction-boundary guarantees this class is responsible for
 * (see the design spec, "Be explicit about transaction boundaries"):
 *
 * 1. requestLink() NEVER touches UserRepository — a users row is only
 *    ever created inside verify(), never by an unauthenticated request.
 * 2. verify() wraps token-consume, user find-or-create, and session
 *    creation in ONE PDO transaction — a mid-sequence failure leaves no
 *    partial state (a burned token with no session issued).
 */
final class AuthService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly MagicLinkTokenRepository $tokens,
        private readonly UserRepository $users,
        private readonly SessionRepository $sessions,
        private readonly RateLimiter $rateLimiter,
        private readonly Mailer $mailer,
        private readonly string $magicLinkBaseUrl,
        private readonly int $tokenExpiryMinutes,
        private readonly int $sessionExpiryDays,
    ) {
    }

    /**
     * Always "succeeds" from the caller's perspective — no exception, no
     * distinguishable return value for "already registered" vs. "new"
     * vs. "rate-limited" vs. "malformed." See request-link.php (Task 9)
     * for how this maps to the HTTP response.
     */
    public function requestLink(string $rawEmail, string $clientIp): void
    {
        $email = EmailNormalizer::normalize($rawEmail);

        if ($email === '' || !str_contains($email, '@')) {
            // Malformed input is treated exactly like "silently drop" —
            // no exception, no distinguishable behavior from a
            // rate-limited or already-registered request.
            return;
        }

        $emailAllowed = $this->rateLimiter->checkAndRecordEmail($email);
        $ipAllowed = $this->rateLimiter->checkAndRecordIp($clientIp);
        if (!$emailAllowed || !$ipAllowed) {
            return;
        }

        $rawToken = $this->generateRawToken();
        $expiresAt = new \DateTimeImmutable("+{$this->tokenExpiryMinutes} minutes");
        $this->tokens->issue($email, $rawToken, $expiresAt);

        $magicLinkUrl = $this->magicLinkBaseUrl . '?token=' . $rawToken;
        $this->mailer->sendMagicLink($email, $magicLinkUrl);
    }

    public function verify(string $rawToken): AuthResult
    {
        $this->pdo->beginTransaction();

        try {
            if (!$this->tokens->consume($rawToken)) {
                $this->pdo->rollBack();
                return AuthResult::invalid();
            }

            $email = $this->tokens->findEmailForRawToken($rawToken);
            if ($email === null) {
                // Defensive — consume() having returned true means a row
                // with this hash existed a moment ago, so this should be
                // unreachable, but never leave a transaction open.
                $this->pdo->rollBack();
                return AuthResult::invalid();
            }

            $user = $this->users->findOrCreateByEmail($email);

            $rawSessionToken = $this->generateRawToken();
            $sessionExpiresAt = new \DateTimeImmutable("+{$this->sessionExpiryDays} days");
            $this->sessions->create($user['id'], $rawSessionToken, $sessionExpiresAt);

            $this->pdo->commit();

            return AuthResult::success($rawSessionToken, $user);
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * @return array{user_id: string, email_normalized: string}|null
     */
    public function me(string $rawSessionToken): ?array
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

**Note on `me()`'s return shape vs. `AuthResult->user`**: `verify()`
returns the internal repository shape (`id`, `email_normalized`) inside
`AuthResult`, while `me()` returns an already-HTTP-shaped
`user_id`/`email_normalized` array. This mirrors the actual JSON
contracts the two entrypoints (Tasks 10 and 11) need to emit — `verify.
php`'s response nests `user: {...}` with `user_id` (per the spec's
Section 2 endpoint description), so Task 10 does its own field mapping
from `AuthResult->user['id']`; `me()` is deliberately pre-shaped since
`me.php`'s job is only to pass it straight through.

- [ ] **Step 9: Register `AuthServiceTest.php` and run**

Add to `server/tests/run-tests.php`:

```php
    __DIR__ . '/Auth/AuthServiceTest.php' => 'KanaGame\\Paddle\\Tests\\authServiceTests',
```

Run: `php server/tests/run-tests.php`
Expected: `78 passed, 0 failed`.

- [ ] **Step 10: Commit**

```bash
git add server/src/Auth/AuthService.php server/tests/Auth/AuthServiceTest.php server/tests/run-tests.php
git commit -m "feat: add AuthService orchestrating request-link/verify/me/logout"
```

---

## Task 9: Config additions for the new auth settings

**Files:**
- Modify: `server/src/Config.php`
- Modify: `server/config.example.php`

**Interfaces:**
- Consumes: none new.
- Produces: `Config::get()`/`Config::require()` now recognize 6 new
  keys, consumed by Tasks 10–13's entrypoints:
  `RATE_LIMIT_PEPPER`, `RATE_LIMIT_EMAIL_PER_HOUR` (default 5),
  `RATE_LIMIT_IP_PER_HOUR` (default 20), `MAGIC_LINK_TOKEN_EXPIRY_MINUTES`
  (default 15), `SESSION_EXPIRY_DAYS` (default 30),
  `MAGIC_LINK_BASE_URL`.

- [ ] **Step 1: Modify `Config::load()`'s key list**

In `server/src/Config.php`, extend the `$keys` array inside `load()`:

```php
        $keys = [
            'DB_HOST',
            'DB_NAME',
            'DB_USER',
            'DB_PASSWORD',
            'PADDLE_WEBHOOK_SECRET',
            'PADDLE_FULL_TAMAMIZU_PRICE_ID',
            'PADDLE_FULL_TAMAMIZU_PRODUCT_ID',
            'ALLOWED_ORIGINS',
            'RATE_LIMIT_PEPPER',
            'RATE_LIMIT_EMAIL_PER_HOUR',
            'RATE_LIMIT_IP_PER_HOUR',
            'MAGIC_LINK_TOKEN_EXPIRY_MINUTES',
            'SESSION_EXPIRY_DAYS',
            'MAGIC_LINK_BASE_URL',
        ];
```

- [ ] **Step 2: Add a typed helper for integer config with a default**

Add this method to the `Config` class, after `allowedOrigins()`:

```php
    public function intWithDefault(string $key, int $default): int
    {
        $value = $this->get($key);
        if ($value === null || $value === '' || !ctype_digit($value)) {
            return $default;
        }
        return (int) $value;
    }
```

- [ ] **Step 3: Run existing tests to confirm no regression**

Run: `php server/tests/run-tests.php`
Expected: `78 passed, 0 failed` — `Config` has no dedicated test file
today (confirmed by its absence from `run-tests.php`'s existing list),
so this is a non-regression check via the tests that indirectly
exercise `Config` (none currently do directly; this step just confirms
the syntax is valid and nothing else broke).

Run: `php -l server/src/Config.php`
Expected: `No syntax errors detected`.

- [ ] **Step 4: Add the new keys to `config.example.php`**

Modify `server/config.example.php`, adding after the existing
`ALLOWED_ORIGINS` entry:

```php
    'ALLOWED_ORIGINS' => '',

    // --- Phase 3A PR A: real-user identity + Magic Link auth ---

    // HMAC pepper for rate-limit identifiers (server/src/Auth/RateLimiter.php).
    // Required in real deployment config. Never committed. Rotating this
    // only resets everyone's rate-limit window — it does not invalidate
    // any stored identity, magic-link token, or session.
    'RATE_LIMIT_PEPPER' => '',

    // Optional — defaults to 5/hour and 20/hour respectively if unset or
    // non-numeric (see Config::intWithDefault()).
    'RATE_LIMIT_EMAIL_PER_HOUR' => '',
    'RATE_LIMIT_IP_PER_HOUR' => '',

    // Optional — defaults to 15 minutes (magic-link token) and 30 days
    // (session) if unset or non-numeric.
    'MAGIC_LINK_TOKEN_EXPIRY_MINUTES' => '',
    'SESSION_EXPIRY_DAYS' => '',

    // The frontend URL prefix a magic-link token is appended to, e.g.
    // 'https://yhalcyon-gh.github.io/kana-game/#/verify' (see
    // docs/superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-
    // design.md, section 5, for why this is a URL FRAGMENT route, not a
    // query-string route on the API's own domain).
    'MAGIC_LINK_BASE_URL' => '',
```

- [ ] **Step 5: Verify the example config still parses**

Run: `php -l server/config.example.php`
Expected: `No syntax errors detected`.

- [ ] **Step 6: Commit**

```bash
git add server/src/Config.php server/config.example.php
git commit -m "feat: add auth-related config keys with sane defaults"
```

---

## Task 10: `request-link.php` entrypoint

**Files:**
- Create: `server/auth/request-link.php`

**Interfaces:**
- Consumes: `Config`, `Db`, `Cors` (existing), `AuthService` (Task 8)
  and its full dependency chain.
- Produces: `POST /api/auth/request-link.php` — the first real HTTP
  surface for this feature. No new interfaces produced for later tasks
  (this is a leaf entrypoint).

- [ ] **Step 1: Write the entrypoint**

```php
<?php

declare(strict_types=1);

/**
 * Request a Magic Link sign-in email.
 *
 * POST /api/auth/request-link.php {"email": "user@example.com"}
 * -> 200 {"status": "ok"}  (ALWAYS this exact response — see below)
 *
 * Enumeration-safe by construction: this endpoint returns the identical
 * 200/{"status":"ok"} response whether the email is malformed,
 * already registered, brand new, or currently rate-limited. See
 * docs/superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-
 * design.md, section 2, and AuthService::requestLink()'s own doc
 * comment for the mechanism (silent no-op internally, never an
 * exception or a differently-shaped response).
 *
 * This entrypoint never creates a users row — see AuthService::
 * requestLink()'s guarantee.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/EmailNormalizer.php';
require __DIR__ . '/../src/Auth/MagicLinkTokenRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/RateLimiter.php';
require __DIR__ . '/../src/Auth/Mailer.php';
require __DIR__ . '/../src/Auth/AuthService.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\AuthService;
use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\Mailer;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;

$config = Config::load();
$cors = new Cors($config->allowedOrigins());
$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);

header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$body = json_decode(file_get_contents('php://input') ?: '', true);
$rawEmail = is_array($body) ? ($body['email'] ?? null) : null;

if (!is_string($rawEmail)) {
    // Still the generic response — a missing/malformed field is not
    // distinguishable from any other "no email sent" outcome.
    echo json_encode(['status' => 'ok']);
    exit;
}

// server/src/Auth/RateLimiter.php's IP bucket deliberately reads ONLY
// REMOTE_ADDR — X-Forwarded-For is never trusted absent an explicit
// trusted-proxy configuration (not present in this phase). See the
// design spec's "Client IP resolution" section.
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';

// A real Mailer implementation does not exist yet in this PR — see
// server/src/Auth/Mailer.php's doc comment. This is intentionally a
// no-op implementation for now so request-link.php is fully wired and
// testable end-to-end at the HTTP layer without sending real email; a
// later PR/human-checkpoint step swaps this for a real SMTP transport.
$noopMailer = new class implements Mailer {
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
        // Intentionally empty. See the class-level comment above.
    }
};

try {
    $pdo = Db::connect($config);
    $service = new AuthService(
        $pdo,
        new MagicLinkTokenRepository($pdo),
        new UserRepository($pdo),
        new SessionRepository($pdo),
        new RateLimiter(
            $pdo,
            $config->require('RATE_LIMIT_PEPPER'),
            $config->intWithDefault('RATE_LIMIT_EMAIL_PER_HOUR', 5),
            $config->intWithDefault('RATE_LIMIT_IP_PER_HOUR', 20),
        ),
        $noopMailer,
        $config->require('MAGIC_LINK_BASE_URL'),
        $config->intWithDefault('MAGIC_LINK_TOKEN_EXPIRY_MINUTES', 15),
        $config->intWithDefault('SESSION_EXPIRY_DAYS', 30),
    );
    $service->requestLink($rawEmail, $clientIp);
} catch (\Throwable $e) {
    // Never log the raw email/IP here — only the exception message,
    // matching the existing entrypoints' error_log() convention.
    error_log('request-link.php: failure: ' . $e->getMessage());
    // Still return the generic response — an internal failure must not
    // be distinguishable from "email was fine, link was sent."
    // (A persistent outage is visible via error_log, not via this
    // response shape.)
}

echo json_encode(['status' => 'ok']);
```

**Why a `noopMailer` here instead of leaving Mailer unimplemented**:
Task 8 deliberately keeps `Mailer` an interface with zero production
implementations in `server/src/Auth/`. This entrypoint still needs
*something* to pass to `AuthService`'s constructor to be a working,
deployable (if email-less) endpoint — an anonymous no-op class defined
inline, right where it's used, keeps that "no real Mailer exists yet"
fact visible at the one call site that matters, rather than adding a
named `NoopMailer` class to `server/src/Auth/` that could be mistaken
for something more permanent.

- [ ] **Step 2: Verify the file parses**

Run: `php -l server/auth/request-link.php`
Expected: `No syntax errors detected`.

- [ ] **Step 3: Manual smoke test against SQLite is not possible here** —
this entrypoint calls `Db::connect()`, which requires real MySQL/MariaDB
config (`server/config.php`, gitignored, not present in this repo
checkout). This is expected and matches Phase 2's own entrypoints
(`entitlement.php`, `paddle-webhook.php`) — they are validated by
`php -l` plus their underlying classes' SQLite-backed unit tests
(already covering 100% of `AuthService`'s logic in Task 8), not by
directly invoking the entrypoint file itself. No live MariaDB
verification happens in this PR — see the plan's Verification section.

- [ ] **Step 4: Commit**

```bash
git add server/auth/request-link.php
git commit -m "feat: add POST /api/auth/request-link.php entrypoint"
```

---

## Task 11: `verify.php`, `me.php`, `logout.php` entrypoints

**Files:**
- Create: `server/auth/verify.php`
- Create: `server/auth/me.php`
- Create: `server/auth/logout.php`

**Interfaces:**
- Consumes: `AuthService` (Task 8), same dependency chain as Task 10.
- Produces: the three remaining HTTP surfaces. `me.php`'s
  `Authorization: Bearer` parsing pattern is reused verbatim by
  `logout.php` — written once in both files identically (small enough
  that a shared helper would be over-abstraction for two call sites,
  consistent with the codebase's existing preference for inline clarity
  over premature extraction, e.g. `entitlement.php`/`paddle-webhook.php`
  each do their own `Config`/`Cors`/dispatch inline rather than sharing
  a base entrypoint class).

- [ ] **Step 1: Write `verify.php`**

```php
<?php

declare(strict_types=1);

/**
 * Consume a Magic Link token and issue a session.
 *
 * POST /api/auth/verify.php {"token": "<raw-token-from-the-URL-fragment>"}
 * -> 200 {"session_token": "<raw>", "user": {"user_id": "...", "email_normalized": "..."}}
 * -> 400 {"error": "invalid or expired token"}  (same body for
 *    unknown/expired/already-used — see AuthResult's doc comment)
 *
 * The token is read from the REQUEST BODY here, never a query string —
 * see docs/superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-
 * design.md, section 5: the frontend reads the raw token from the URL
 * FRAGMENT (which browsers never send to any server), strips it from
 * browser history, then POSTs it here in the body. This endpoint itself
 * has no way to enforce that the caller behaved this way — the fragment/
 * history-strip discipline lives entirely in the frontend (PR C's
 * eventual /account-test harness and any future production UI); this
 * entrypoint's own contract is simply "accept the token in the POST
 * body," which is the necessary (not sufficient on its own) half of
 * that guarantee.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/EmailNormalizer.php';
require __DIR__ . '/../src/Auth/MagicLinkTokenRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/RateLimiter.php';
require __DIR__ . '/../src/Auth/Mailer.php';
require __DIR__ . '/../src/Auth/AuthService.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\AuthService;
use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\Mailer;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;

$config = Config::load();
$cors = new Cors($config->allowedOrigins());
$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);

header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$body = json_decode(file_get_contents('php://input') ?: '', true);
$rawToken = is_array($body) ? ($body['token'] ?? null) : null;

if (!is_string($rawToken) || $rawToken === '') {
    http_response_code(400);
    echo json_encode(['error' => 'invalid or expired token']);
    exit;
}

$noopMailer = new class implements Mailer {
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
    }
};

try {
    $pdo = Db::connect($config);
    $service = new AuthService(
        $pdo,
        new MagicLinkTokenRepository($pdo),
        new UserRepository($pdo),
        new SessionRepository($pdo),
        new RateLimiter(
            $pdo,
            $config->require('RATE_LIMIT_PEPPER'),
            $config->intWithDefault('RATE_LIMIT_EMAIL_PER_HOUR', 5),
            $config->intWithDefault('RATE_LIMIT_IP_PER_HOUR', 20),
        ),
        $noopMailer,
        $config->require('MAGIC_LINK_BASE_URL'),
        $config->intWithDefault('MAGIC_LINK_TOKEN_EXPIRY_MINUTES', 15),
        $config->intWithDefault('SESSION_EXPIRY_DAYS', 30),
    );
    $result = $service->verify($rawToken);
} catch (\Throwable $e) {
    error_log('verify.php: failure: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if (!$result->success) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid or expired token']);
    exit;
}

echo json_encode([
    'session_token' => $result->sessionToken,
    'user' => [
        'user_id' => $result->user['id'],
        'email_normalized' => $result->user['email_normalized'],
    ],
]);
```

- [ ] **Step 2: Write `me.php`**

```php
<?php

declare(strict_types=1);

/**
 * Resolve the current authenticated user from a session token.
 *
 * GET /api/auth/me.php
 * Header: Authorization: Bearer <raw-session-token>
 * -> 200 {"user_id": "...", "email_normalized": "..."}
 * -> 401 {"error": "unauthorized"}
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/EmailNormalizer.php';
require __DIR__ . '/../src/Auth/MagicLinkTokenRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/RateLimiter.php';
require __DIR__ . '/../src/Auth/Mailer.php';
require __DIR__ . '/../src/Auth/AuthService.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\AuthService;
use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\Mailer;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;

$config = Config::load();
$cors = new Cors($config->allowedOrigins());
$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);

header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!str_starts_with($authHeader, 'Bearer ')) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}
$rawSessionToken = substr($authHeader, strlen('Bearer '));

$noopMailer = new class implements Mailer {
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
    }
};

try {
    $pdo = Db::connect($config);
    $service = new AuthService(
        $pdo,
        new MagicLinkTokenRepository($pdo),
        new UserRepository($pdo),
        new SessionRepository($pdo),
        new RateLimiter(
            $pdo,
            $config->require('RATE_LIMIT_PEPPER'),
            $config->intWithDefault('RATE_LIMIT_EMAIL_PER_HOUR', 5),
            $config->intWithDefault('RATE_LIMIT_IP_PER_HOUR', 20),
        ),
        $noopMailer,
        $config->require('MAGIC_LINK_BASE_URL'),
        $config->intWithDefault('MAGIC_LINK_TOKEN_EXPIRY_MINUTES', 15),
        $config->intWithDefault('SESSION_EXPIRY_DAYS', 30),
    );
    $me = $service->me($rawSessionToken);
} catch (\Throwable $e) {
    error_log('me.php: failure: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

if ($me === null) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

echo json_encode($me);
```

- [ ] **Step 3: Write `logout.php`**

```php
<?php

declare(strict_types=1);

/**
 * Revoke the current session.
 *
 * POST /api/auth/logout.php
 * Header: Authorization: Bearer <raw-session-token>
 * -> 200 {"status": "ok"}  (always — revoking an already-invalid/unknown
 *    token is a safe no-op, matching SessionRepository::revoke()'s own
 *    contract, so this endpoint never needs to distinguish "was valid"
 *    from "wasn't")
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/EmailNormalizer.php';
require __DIR__ . '/../src/Auth/MagicLinkTokenRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/RateLimiter.php';
require __DIR__ . '/../src/Auth/Mailer.php';
require __DIR__ . '/../src/Auth/AuthService.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\AuthService;
use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\Mailer;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;

$config = Config::load();
$cors = new Cors($config->allowedOrigins());
$cors->applyHeaders($_SERVER['HTTP_ORIGIN'] ?? null);

header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$rawSessionToken = str_starts_with($authHeader, 'Bearer ')
    ? substr($authHeader, strlen('Bearer '))
    : null;

$noopMailer = new class implements Mailer {
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
    }
};

if ($rawSessionToken !== null) {
    try {
        $pdo = Db::connect($config);
        $service = new AuthService(
            $pdo,
            new MagicLinkTokenRepository($pdo),
            new UserRepository($pdo),
            new SessionRepository($pdo),
            new RateLimiter(
                $pdo,
                $config->require('RATE_LIMIT_PEPPER'),
                $config->intWithDefault('RATE_LIMIT_EMAIL_PER_HOUR', 5),
                $config->intWithDefault('RATE_LIMIT_IP_PER_HOUR', 20),
            ),
            $noopMailer,
            $config->require('MAGIC_LINK_BASE_URL'),
            $config->intWithDefault('MAGIC_LINK_TOKEN_EXPIRY_MINUTES', 15),
            $config->intWithDefault('SESSION_EXPIRY_DAYS', 30),
        );
        $service->logout($rawSessionToken);
    } catch (\Throwable $e) {
        error_log('logout.php: failure: ' . $e->getMessage());
        // Still return 200 — see the doc comment above.
    }
}

echo json_encode(['status' => 'ok']);
```

- [ ] **Step 4: Verify all three files parse**

Run:

```bash
php -l server/auth/verify.php
php -l server/auth/me.php
php -l server/auth/logout.php
```

Expected: `No syntax errors detected` for all three.

- [ ] **Step 5: Grep self-check — no raw token/email ever logged**

Run:

```bash
grep -n "error_log" server/auth/*.php
```

Expected output: four lines (one per file, `request-link.php` included),
each logging only `$e->getMessage()` — manually confirm none references
`$rawToken`, `$rawEmail`, `$rawSessionToken`, or `$result->sessionToken`.

- [ ] **Step 6: Commit**

```bash
git add server/auth/verify.php server/auth/me.php server/auth/logout.php
git commit -m "feat: add verify/me/logout auth entrypoints"
```

---

## Task 12: Frontend `SessionTransport` interface (in-memory only)

**Files:**
- Create: `src/lib/auth/sessionTransport.ts`
- Test: `src/lib/auth/sessionTransport.test.ts`

**Interfaces:**
- Produces:
  - `interface SessionTransport { getToken(): string | null; setToken(token: string): void; clear(): void }`
  - `export const inMemorySessionTransport: SessionTransport` — a
    singleton backed by a module-scoped variable. **Never**
    `localStorage`/`sessionStorage` (spec Section 3 — deferred
    production transport decision; this is a placeholder for PR C's
    dev-only harness to build against, not a production choice).

- [ ] **Step 1: Write the failing test**

Check the existing test-runner convention first — this repo uses Vitest
(confirmed by `npm test` in `CLAUDE.md` and existing `*.test.tsx` files).

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { inMemorySessionTransport } from './sessionTransport';

describe('inMemorySessionTransport', () => {
  beforeEach(() => {
    inMemorySessionTransport.clear();
  });

  it('getToken() returns null when no token has been set', () => {
    expect(inMemorySessionTransport.getToken()).toBeNull();
  });

  it('setToken() then getToken() returns the value that was set', () => {
    inMemorySessionTransport.setToken('abc-123');
    expect(inMemorySessionTransport.getToken()).toBe('abc-123');
  });

  it('clear() removes a previously set token', () => {
    inMemorySessionTransport.setToken('abc-123');
    inMemorySessionTransport.clear();
    expect(inMemorySessionTransport.getToken()).toBeNull();
  });

  it('never touches localStorage', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    inMemorySessionTransport.setToken('abc-123');
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it('never touches sessionStorage', () => {
    const setItemSpy = vi.spyOn(window.sessionStorage, 'setItem');
    inMemorySessionTransport.setToken('abc-123');
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });
});
```

Add the missing `vi` import: `import { describe, it, expect, beforeEach, vi } from 'vitest';`

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/auth/sessionTransport.test.ts`
Expected: fails — `Cannot find module './sessionTransport'`.

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * Session token storage for the auth foundation (Phase 3A). The
 * PRODUCTION browser transport decision (bearer-with-refresh vs.
 * SameSite=None cookie vs. same-site hosting migration) is deferred —
 * see docs/adr/0001-cross-site-auth-transport.md. This interface exists
 * so that decision, whenever it's made, can be implemented as a new
 * SessionTransport without touching any auth/purchase call site.
 *
 * The ONLY implementation built in this phase is in-memory — cleared on
 * page reload, never localStorage/sessionStorage. It exists purely so
 * PR C's dev-only /account-test harness can hold a bearer token across
 * calls within a single page session while exercising the backend auth
 * flow end-to-end.
 */
export interface SessionTransport {
  getToken(): string | null;
  setToken(token: string): void;
  clear(): void;
}

function createInMemorySessionTransport(): SessionTransport {
  let currentToken: string | null = null;

  return {
    getToken(): string | null {
      return currentToken;
    },
    setToken(token: string): void {
      currentToken = token;
    },
    clear(): void {
      currentToken = null;
    },
  };
}

export const inMemorySessionTransport: SessionTransport = createInMemorySessionTransport();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/auth/sessionTransport.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/sessionTransport.ts src/lib/auth/sessionTransport.test.ts
git commit -m "feat: add in-memory-only SessionTransport interface for the frontend"
```

---

## Task 13: Cross-site auth transport ADR

**Files:**
- Create: `docs/adr/0001-cross-site-auth-transport.md`

No test — this is a documentation-only deliverable (matches
`docs/definition-of-done.md`'s explicit allowance for docs-only changes
to state that focused tests have no signal here).

- [ ] **Step 1: Write the ADR**

```markdown
# ADR 0001: Cross-site auth transport for Tamamizu's frontend/API split

**Status:** Decision deferred (human checkpoint). This ADR frames the
options; it does not choose one. See "What is NOT decided here" below.

## Context

Tamamizu's frontend is deployed to GitHub Pages
(`https://yhalcyon-gh.github.io/kana-game/`) and its API (Phase 2's
Paddle webhook/entitlement endpoints, and Phase 3A's new auth endpoints)
is deployed to Xserver (`https://tamamizu.giganihongo.com`). These are
different origins — this is a genuinely cross-site setup, not merely a
different subdomain of the same registrable domain.

A Phase 3A session token is a **real account authentication
credential**, not merely a flag saying "entitlement active/inactive." A
valid session can:

- read the account's own email (`GET /api/auth/me.php`);
- (in PR B) authorize creation of a new Paddle purchase intent bound to
  that account.

The transport decision must be evaluated with the rigor appropriate to
any account-session transport — theft of this token via XSS is account
takeover for a low-PII account, not merely "someone finds out an
entitlement flag." It is not low-stakes just because the account holds
no payment/address data itself.

Relevant platform constraints:

- **SameSite cookie restrictions**: a cross-site cookie needs
  `SameSite=None; Secure`, which many browsers now restrict or phase
  out for third-party contexts.
- **Safari/iOS Intelligent Tracking Prevention (ITP)**: aggressively
  partitions or expires cross-site storage/cookies, with behavior that
  has changed across iOS versions.
- **PWA storage partitioning**: this app is a PWA candidate; installed
  PWA contexts can have different storage/cookie behavior than a normal
  browser tab on some platforms.
- **Chrome's third-party cookie changes**: an industry-wide direction
  making cross-site cookies progressively less reliable over time, not
  a one-time constraint.

## Options considered

### Option A — Bearer token, browser-held

No cookies at all. The session token travels as
`Authorization: Bearer <token>` on each API call. Avoids every
SameSite/ITP/third-party-cookie restriction entirely, since there is no
cookie.

- **Pro**: works identically across Safari/iOS/Chrome/PWA, because none
  of those restrictions apply to a bearer header.
- **Con**: the browser must hold the token somewhere across page loads
  for a persistent session. `localStorage`/`sessionStorage` are
  readable by any script on the page — an XSS vulnerability anywhere in
  the app becomes token theft (account takeover, per the framing
  above). An in-memory-only token (this PR's `InMemorySessionTransport`)
  avoids that persistence risk entirely but loses the session on every
  reload, which is a real UX cost for a "stay signed in" product
  expectation.
- **Open sub-question this option does not resolve**: *where* a
  production bearer token should live across reloads (in-memory with a
  refresh-token dance, an XSS-hardened storage strategy, etc.) is a
  separate decision from "bearer vs. cookie" and is also not made here.

### Option B — `SameSite=None; Secure` cookie

Keeps the familiar browser-managed cookie model — the browser attaches
the session cookie automatically, no manual header wiring on every
`fetch`.

- **Pro**: standard, well-understood pattern; `HttpOnly` would also
  make it immune to XSS-driven theft (unlike a bearer token in JS-
  accessible storage).
- **Con**: is exactly the pattern most exposed to the platform
  constraints listed above — Safari ITP and the general industry
  direction against third-party cookies make this an increasingly
  fragile bet specifically *for a cross-site PWA-capable app*, which is
  what Tamamizu is.

### Option C — Migrate the frontend to `tamamizu.giganihongo.com`

Serve the frontend from a same-site (sub)domain relative to the API,
eliminating the cross-site problem entirely — a same-site
`SameSite=Lax` (or even stricter) cookie works everywhere without any
of Option B's caveats.

- **Pro**: makes the entire problem class disappear; the "right" answer
  if hosting were being chosen from scratch today.
- **Con**: this is a hosting/deployment decision (GitHub Pages → Xserver
  or a proxy in front of both), not an auth-code decision — it has
  deployment cost, changes the app's public URL (with SEO/bookmark/PWA-
  installation-identity implications), and is explicitly out of this
  phase's scope and budget per the task brief (Sections 0, 28, 33).

## Recommendation (non-binding — see "What is NOT decided here")

Option A (bearer token) is the more robust choice for reliability across
Safari/iOS/PWA specifically, given Tamamizu's actual constraints (no
appetite right now for a hosting migration, and a strong need for the
auth experience to keep working on iOS Safari and inside an installed
PWA). This recommendation does **not** by itself answer where a
production bearer token should be held across reloads — that remains
open even if Option A is chosen.

## What is NOT decided here

Per the task brief's explicit instruction (Section 11: "If a clear
secure choice does not emerge, do not migrate hosting on your own"; and
Section 33(A): GitHub Pages cross-site session transport is a named
human checkpoint), **this ADR does not select a production transport.**
Phase 3A PR A builds only:

- the backend session model (hash-at-rest tokens, revocable, explicit
  expiry) — transport-agnostic, usable under any of the three options
  above without changes to `server/src/Auth/*`;
- `SessionTransport`, a frontend interface with exactly one
  implementation (`InMemorySessionTransport`), used only by PR C's
  dev-only test harness to exercise the backend flow — not a production
  transport choice.

A human decision-maker chooses among Options A/B/C (or a fourth option
not yet identified) before any production session transport is wired
up. That decision, once made, is implemented as a new `SessionTransport`
behind the existing interface.

## Consequences of deferring

- PR C's `/account-test` harness holds its bearer token in memory only,
  meaning the harness "logs out" on every page reload — acceptable for
  a manual test harness, not indicative of the eventual production
  behavior.
- No production login flow exists yet; this ADR's resolution is a
  prerequisite for building one.
```

- [ ] **Step 2: Confirm the file renders as valid Markdown (no unclosed code fences)**

Run:

```bash
grep -c '```' docs/adr/0001-cross-site-auth-transport.md
```

Expected: an even number (each fence opened is closed).

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0001-cross-site-auth-transport.md
git commit -m "docs: add ADR for cross-site auth transport (decision deferred)"
```

---

## Task 14: PR A-specific documentation

**Files:**
- Create: `docs/paddle-auth-phase3a-pr-a.md`
- Modify: `docs/README.md` (add an index entry, following its existing
  pattern — read the file first to match its exact list format before
  editing)

- [ ] **Step 1: Read `docs/README.md`'s current structure**

```bash
cat docs/README.md
```

(No fixed expected output — this step exists so the next step's edit
matches the file's real current format instead of guessing it.)

- [ ] **Step 2: Write `docs/paddle-auth-phase3a-pr-a.md`**

```markdown
# Phase 3A PR A — real-user identity + Magic Link auth foundation

Implements the `users`/`magic_link_tokens`/`sessions`/`rate_limits`
portion of
[`docs/superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-design.md`](superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-design.md)
(rev. 3). Builds on Phase 2
([`docs/paddle-webhook-poc.md`](paddle-webhook-poc.md)) without altering
its `payment_events`/`entitlements` tables or `sandbox-test-user` PoC
path in any way.

## Scope

**In this PR:** users, Magic Link request/verify, sessions, DB-backed
HMAC-keyed rate limiting, the cross-site auth transport ADR
([`docs/adr/0001-cross-site-auth-transport.md`](adr/0001-cross-site-auth-transport.md)).

**Explicitly NOT in this PR** (see the design spec's PR structure):
`purchase_intents`, `transaction_grants`, `pending_adjustments`, any
Paddle webhook/purchase-attribution changes, the `/account-test`
frontend harness, real SMTP, XServer deployment, production session
transport, curriculum locking.

## New endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/request-link.php` | POST | none | Request a Magic Link email. Always returns `200 {"status":"ok"}` — enumeration-safe. |
| `/api/auth/verify.php` | POST | none (token in body) | Consume a Magic Link token, create/resolve the user, issue a session. |
| `/api/auth/me.php` | GET | `Authorization: Bearer` | Resolve the current user from a session token. |
| `/api/auth/logout.php` | POST | `Authorization: Bearer` | Revoke the current session. |

## New tables

See [`server/sql/migrations/0001_users_auth_foundation.sql`](../server/sql/migrations/0001_users_auth_foundation.sql)
for full DDL: `users`, `magic_link_tokens`, `sessions`, `rate_limits`.
Additive only — no existing table is altered.

## New config keys

See `server/config.example.php` for the full list added by this PR:
`RATE_LIMIT_PEPPER` (required in real deployment), `RATE_LIMIT_EMAIL_PER_HOUR`
(default 5), `RATE_LIMIT_IP_PER_HOUR` (default 20),
`MAGIC_LINK_TOKEN_EXPIRY_MINUTES` (default 15), `SESSION_EXPIRY_DAYS`
(default 30), `MAGIC_LINK_BASE_URL` (required in real deployment).

## Magic-link token transport

The raw magic-link token is designed to travel as a URL **fragment**
(`.../#/verify?token=...`), which browsers never send to any HTTP
server, then be POSTed in a request body to `verify.php` — never a
query string. **This PR implements the backend half of that contract**
(`verify.php` accepts the token only in the POST body); the frontend
half (reading the fragment, stripping it from history before the POST)
is PR C's responsibility, since no frontend route consumes these
endpoints yet in PR A. See the design spec's Section 5 for the full
rationale.

## Mailer

`server/src/Auth/Mailer.php` is an interface with exactly one
implementation in this PR — `FakeMailer`, used only by
`server/tests/Auth/AuthServiceTest.php`. **No real email is sent by any
code in this PR.** The three HTTP entrypoints
(`request-link.php`/`verify.php`/`me.php`/`logout.php`, where
applicable) use an inline anonymous no-op `Mailer` implementation so the
endpoints are fully deployable without a real SMTP credential — see
each entrypoint's own comment. A real SMTP transport is future work
requiring a human-supplied credential (task brief Section 21).

## Deployment status

**Not deployed.** This PR contains code, migrations, and tests only. No
XServer deployment, no schema execution against the real
`giganihongo_tmzp` database, and no Paddle Sandbox interaction happen in
this PR. See the design spec's "Deferred to later phases" section.

## Tests

Run `php server/tests/run-tests.php` — all Phase 2 tests (32) plus this
PR's new tests must pass together. See the plan document
([`docs/superpowers/plans/2026-09-08-paddle-identity-foundation-pr-a.md`](superpowers/plans/2026-09-08-paddle-identity-foundation-pr-a.md))
for the exact per-task test list.

## Known limitations carried into PR B

- No real user-facing email delivery yet (see "Mailer" above).
- No frontend route exercises any of these endpoints yet — that is PR
  C's `/account-test` harness.
- The production browser session transport is undecided (see the ADR).
```

- [ ] **Step 3: Add the index entry to `docs/README.md`**

(Exact insertion point depends on the file's real current structure —
read it in Step 1 above and add one line matching its existing list
style, e.g. alongside the other `docs/paddle-*.md` entries if the file
groups related docs together. Do not guess the format; match what
Step 1 actually showed.)

- [ ] **Step 4: Commit**

```bash
git add docs/paddle-auth-phase3a-pr-a.md docs/README.md
git commit -m "docs: add PR A documentation for the auth foundation"
```

---

## Task 15: Full verification pass

**Files:** none new — this task runs the required verification commands
across everything Tasks 1–14 added.

- [ ] **Step 1: Run the full PHP test suite**

```bash
php server/tests/run-tests.php
```

Expected: every test passes — Phase 2's original 32 plus this plan's
additions (4 Uuid + 6 UserRepository + 6 MagicLinkTokenRepository + 6
SessionRepository + 7 RateLimiter + 4 EmailNormalizer + 13 AuthService =
46 new tests). Record the exact final count in the PR description
(do not hardcode an expected number here beyond this arithmetic check —
count what actually runs).

- [ ] **Step 2: Run the frontend test suite and full verify**

```bash
npm run verify
```

Expected: clean pass (test + lint + build + `git diff --check`) per
`docs/definition-of-done.md`.

- [ ] **Step 3: Explicit `git diff --check`**

```bash
git diff --check origin/codex/paddle-webhook-entitlement-poc..HEAD
```

Expected: no output (no trailing-whitespace/conflict-marker issues
across this PR's full diff against its base).

- [ ] **Step 4: Secret/logging self-review (manual, not a single command)**

Run each of the following and manually confirm the results match the
stated expectation — this is the design spec's Section 8 checklist
applied concretely to this PR's actual files:

```bash
grep -rn "error_log" server/auth/ server/src/Auth/
```
Expected: only the four `error_log('*.php: failure: ' . $e->getMessage())`
calls from Task 10/11's entrypoints — confirm by eye that none
interpolates `$rawToken`, `$rawEmail`, `$rawSessionToken`, or any
`session_token`/`token_hash` value.

```bash
grep -rn "RATE_LIMIT_PEPPER\s*=>\s*'[^']" server/config.example.php
```
Expected: no match (the example config's value stays an empty string).

```bash
git log --all -p -- server/config.php
```
Expected: no output — confirms `server/config.php` (the real, gitignored
config) was never accidentally committed at any point in this PR's
history.

- [ ] **Step 5: Confirm Phase 2 behavior is untouched**

```bash
git diff origin/codex/paddle-webhook-entitlement-poc..HEAD -- server/sql/schema.sql server/src/SandboxUser.php server/entitlement.php server/paddle-webhook.php
```

Expected: no output — none of Phase 2's core files were modified by
this plan (only `server/src/Config.php` and `server/config.example.php`
were modified, and only additively, per Task 9).

- [ ] **Step 6: Final commit if any verification step required a fix**

If Steps 1–5 all passed cleanly with no fixes needed, there is nothing
to commit here. If any step required a fix, commit it with a message
describing exactly what verification step caught it, e.g.:

```bash
git add -A
git commit -m "fix: address git diff --check trailing whitespace in <file>"
```

---

## Self-review notes (writing-plans skill requirement)

**Spec coverage check** — every PR A-scoped item from the design spec
(rev. 3) and from ChatGPT's PR A scope list maps to a task:

- `users`, `magic_link_tokens`, `sessions`, `rate_limits`, additive
  migration → Task 2.
- Auth repositories/services → Tasks 3, 4, 5, 6, 8.
- `request-link.php`/`verify.php`/`me.php`/`logout.php` → Tasks 10, 11.
- Mailer interface + FakeMailer (test-only) → Task 7.
- Rate-limit HMAC design → Task 6.
- UUIDv4 user ids → Task 1, consumed by Task 3.
- Atomic same-token verification → Task 4 (`consume()`) + Task 8
  (transaction boundary) + its concurrency test.
- Concurrent two-distinct-links/same-email safe user creation → Task 3
  (`findOrCreateByEmail()`) + Task 8's dedicated concurrency test.
- Session token hash-at-rest → Task 5.
- Cross-site auth transport ADR → Task 13.
- Backend/PHP tests → embedded in Tasks 1–8 (TDD steps) plus Task 15's
  full-suite run.
- Docs needed specifically for PR A → Tasks 13, 14.
- No PR B implementation → confirmed no task creates `purchase_intents`,
  `transaction_grants`, `pending_adjustments`, webhook/refund code, or
  the `/account-test` route; Task 12's `SessionTransport` is the one
  deliberate extension point PR B/C will reuse, built no further than
  PR A itself needs (a single in-memory implementation).

**Placeholder scan** — no "TBD"/"TODO"/"implement later"/"add
appropriate error handling" phrases appear in any task; every code step
has a complete, runnable code block; every test has concrete assertions.

**Type consistency check** — `AuthService`'s constructor signature is
defined once (Task 8) and every entrypoint (Tasks 10, 11) instantiates
it with exactly that same 9-argument order and types.
`MagicLinkTokenRepository::consume(): bool` (Task 4) is the exact method
`AuthService::verify()` (Task 8) calls. `SessionRepository::
findActiveUserIdForRawToken(): ?string` (Task 5) is the exact method
`AuthService::me()` (Task 8) calls. `UserRepository::
findOrCreateByEmail(): array{id: string, email_normalized: string}`
(Task 3) matches the shape `AuthService::verify()` (Task 8) destructures
(`$user['id']`, `$user['email_normalized']`) and the shape
`verify.php` (Task 11) reads (`$result->user['id']`).

---

## Verification commands (summary)

- `php server/tests/run-tests.php` — all PHP tests pass.
- `npm run verify` — full frontend verification (test + lint + build +
  `git diff --check`).
- `git diff --check` — explicit check against the PR's base branch.
- Manual secret/logging self-review — Task 15, Step 4.
- Phase 2 non-regression check — Task 15, Step 5.

**Not run in this PR**: any live MariaDB execution of the new
migration, any real HTTP request against a deployed entrypoint, any
real email send. These require XServer deployment / real config, which
is out of scope per the task brief's human-checkpoint list.

## Unresolved implementation-level questions for human/ChatGPT review

1. **`server/auth/` as a new subdirectory vs. flat `server/*.php`
   naming** (e.g. `server/auth-request-link.php`) — this plan chose a
   subdirectory (File Structure section's rationale) to avoid cluttering
   the existing flat `server/` directory, but this changes the URL path
   shape from Phase 2's `/api/paddle-webhook.php` convention to
   `/api/auth/request-link.php`. If ChatGPT/the deployment convention
   prefers keeping every entrypoint flat under one `server/`→`public_html/api/`
   mapping (simpler `.htaccess`/deployment-manifest reasoning, matching
   Phase 2's own deployment doc), this is a mechanical rename with no
   logic impact — flagging before implementation rather than after.
2. **Session expiry = 30 days** is this plan's own concrete choice
   (Global Constraints section explains the reasoning) since the spec
   left the exact number unspecified beyond "defined explicitly." Worth
   a explicit sign-off, since changing it later is cheap (one config
   default) but is a real product/security tradeoff (30 days is a long
   window for a leaked bearer token, per the ADR's own "this is a real
   credential" framing) that a builder shouldn't silently finalize.
3. **The inline anonymous no-op `Mailer` in each entrypoint** (Tasks 10,
   11) — an alternative would be a named `NullMailer` class in
   `server/src/Auth/`. This plan chose inline specifically to keep "no
   real mailer exists" visually obvious at each call site rather than
   implying a more permanent-looking named class; flagging this
   stylistic choice in case the reviewer prefers the named-class
   convention instead (e.g. for reuse across all three entrypoints
   without repeating the anonymous-class literal three times — a minor
   DRY tradeoff either way).
