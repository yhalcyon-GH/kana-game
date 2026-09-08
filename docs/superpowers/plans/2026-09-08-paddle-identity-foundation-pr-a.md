# PR A: Real-user identity + auth foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 2's total absence of real identity with a
minimal, secure users/Magic-Link/sessions/rate-limiting foundation —
`users`, `magic_link_tokens`, `sessions`, `rate_limits` tables;
`request-link.php`/`verify.php`/`me.php`/`logout.php` endpoints; a
`Mailer` interface (test-only `FakeMailer`); a `CurrentUserService` that
lets session-only consumers (like PR B's future `purchase-intent.php`)
resolve a user without depending on Magic Link/mail/rate-limit
infrastructure; CORS preflight support for the new endpoints; and the
cross-site auth transport ADR — while leaving Phase 2's
`payment_events`/`entitlements`/`SandboxUser` PoC path completely
untouched.

**Architecture:** New `KanaGame\Paddle\Auth` namespace under
`server/src/Auth/` holds repositories (`UserRepository`,
`MagicLinkTokenRepository`, `SessionRepository`, `RateLimiter`) and two
separate services: `CurrentUserService` (session token to user; the only
thing `me.php`/`logout.php`/PR B's future `purchase-intent.php` need)
and `MagicLinkAuthService` (request-link/verify orchestration, which
depends on `CurrentUserService` for the session-creation half of
`verify()` but is not itself a dependency of session-only consumers).
Four new `server/auth/*.php` entrypoints follow the existing
`entitlement.php`-style shape (Config, Cors, dispatch, JSON), extended
with real preflight handling in `Cors`. One additive SQL migration adds
four new tables; nothing existing is altered. All single-use consume
operations (magic-link token, and the user find-or-create they trigger)
use atomic conditional UPDATE / upsert-then-read patterns inside
explicit PDO transactions. The rate limiter uses a single atomic
`INSERT ... ON DUPLICATE KEY UPDATE`-based increment (MariaDB) with a
SQLite-safe equivalent — never SELECT-then-UPDATE.

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

**Revision note (rev. 2 of this plan, 2026-09-08):** revised per
ChatGPT's review of the original plan (approved at
`08ae596f6796bd4a95ef2612625c56531c5c0751`). Eight required corrections
plus three smaller fixes are folded into the tasks below; see each
task's own note for what changed, and the "Revision summary" section at
the end of this document.

## Global Constraints

- **No PR B/C implementation.** Do not create `purchase_intents`,
  `transaction_grants`, `pending_adjustments`, any purchase/webhook
  code, or the `/account-test` frontend route in this plan. PR A's one
  deliberate extension point for PR B is `CurrentUserService` (a
  session-only current-user resolver with no Magic Link/mail/rate-limit
  dependency) — build only what PR A itself needs to consume it
  (`me.php`, `logout.php`), not PR B's future consumer.
- **Additive migration only.** The new migration must not `ALTER`,
  `DROP`, or rename `payment_events` or `entitlements`, and must not
  touch `server/src/SandboxUser.php` or any Phase 2 PoC code path.
  Phase 2's existing 32 PHP tests must still pass unmodified after this
  plan's changes. `magic_link_tokens.user_id` and `sessions.user_id` are
  declared with `FOREIGN KEY` references to `users.id` (new in this
  revision — see Task 2 and Task 7's correction below) — additive,
  since these are brand-new tables, not a change to any existing one.
- **Raw secrets never stored or logged.** Magic-link tokens, session
  tokens: SHA-256 hash only in DB. The **final equality comparison**
  for a fetched hash against a freshly computed one uses `hash_equals()`
  — not just an indexed SQL equality match — per the spec's explicit
  requirement (see Task 4/5's correction below for exactly where this
  applies). Never appears in an `error_log()` call or exception message
  anywhere in this plan's code — and as of this revision, **no
  exception message from any DB/mailer/internal failure is logged
  verbatim** in the four auth entrypoints at all, only a generic
  operational log line (endpoint name + exception class), since a
  future DB/mailer exception could itself contain a normalized email, a
  Magic Link URL, or a raw token value (Task 10/11's correction).
- **Atomic single-use.** Magic-link consume uses a conditional
  `UPDATE ... WHERE used_at IS NULL AND expires_at > NOW()` and checks
  affected-row-count — never SELECT-then-UPDATE (spec Section 1).
- **MariaDB-safe user find-or-create.** `INSERT ... ON DUPLICATE KEY
  UPDATE id = id` followed by a re-`SELECT` in the same transaction —
  never a bare SELECT-then-unprotected-INSERT (spec Section 1, "Two
  distinct, simultaneously-valid tokens for the same email").
- **Rate limiting is HMAC-keyed for both email and IP, and is itself
  concurrency-safe.** Never persist a raw email or raw IP in
  `rate_limits.identifier`. Client IP is read only from
  `$_SERVER['REMOTE_ADDR']` — `X-Forwarded-For` is never trusted (spec
  Section 1, "Client IP resolution"). **As of this revision**, the
  counter increment itself is a single atomic
  `INSERT ... ON DUPLICATE KEY UPDATE`-based statement (MariaDB) with an
  equivalent SQLite path for tests — the original plan's
  SELECT-count-then-UPDATE pattern is replaced (Task 6's correction;
  that pattern could let concurrent requests both read a stale count and
  both proceed, exceeding the configured limit). Malformed email input
  still records against the IP bucket before returning (Task 8's
  correction) — a malformed-email request is no longer a free pass that
  skips IP-based throttling.
- **Enumeration-safe responses.** `request-link.php` always returns the
  same generic `200 {"status":"ok"}` body regardless of whether the
  email exists, is rate-limited, is malformed, or fails normalized-email
  validation. `verify.php` always returns the same generic `400` body
  for invalid/expired/already-used tokens — no distinguishable reason.
- **Magic-link token expiry: 15 minutes. Session expiry: 24 hours**
  (changed in this revision from a 30-day default — see Task 5's
  correction; `SESSION_EXPIRY_HOURS`, not `SESSION_EXPIRY_DAYS`. This
  value is explicitly provisional for Phase 3A: the current transport is
  in-memory-only and already loses the session on reload, so a long
  server-side session buys no UX benefit today, while there is no
  refresh/rotation system yet to reduce the risk of a longer-lived
  bearer credential. Must be reconsidered once a production browser
  transport is chosen — see the ADR, Task 13). Both are read through
  `Config`, not hardcoded.
- **No production browser transport decision.** `InMemorySessionTransport`
  and the `SessionTransport` interface are the only frontend pieces this
  plan builds; no cookie code, no `localStorage`/`sessionStorage` code
  for tokens.
- **CORS must support real preflight for the new endpoints** (Task 3's
  correction, new in this revision) — `OPTIONS` requests need
  `Access-Control-Allow-Methods` (GET, POST, OPTIONS) and
  `Access-Control-Allow-Headers` (Content-Type, Authorization) for an
  allowed origin, with **no** `Access-Control-Allow-Credentials` (a
  production cookie transport is still deferred). Phase 2's existing
  `entitlement.php` CORS behavior (simple
  `Access-Control-Allow-Origin`/`Vary` on non-preflight requests) must
  keep working unmodified.
- **Fragment-based magic-link transport is safe by construction, not by
  config convention** (Task 9's correction, new in this revision) — the
  code, not a config value, is responsible for placing the raw token
  after the fragment delimiter in the generated link. `MAGIC_LINK_BASE_URL`
  (the original plan's config key) is replaced by
  `MAGIC_LINK_FRONTEND_BASE_URL` (just the frontend origin/path prefix,
  with no verify route baked in), and a single, tested
  `MagicLinkUrlBuilder` class appends the fragment route and urlencoded
  token — so a config mistake cannot silently turn the raw token into a
  server-visible query parameter.
- **`FakeMailer` is test-only code, not production-adjacent code**
  (Mailer placement correction, new in this revision) — it lives under
  `server/tests/Auth/`, not `server/src/Auth/`. Only the `Mailer`
  interface itself lives in `server/src/Auth/`.
- **Race-scenario tests are explicitly named as such** (Task 8's
  correction on terminology, new in this revision) — this plan's
  concurrency tests run sequentially against a single SQLite connection
  and prove atomicity/idempotency of the SQL patterns used (an atomic
  conditional UPDATE cannot be won twice; an atomic upsert cannot double
  insert), not true simultaneous multi-connection MariaDB execution.
  Every such test in this plan is labeled "race-scenario test" or
  "atomicity/idempotency semantic test," and a documented follow-up
  requirement (Task 14) records the real-MariaDB verification that must
  happen before Live rollout, which this PR does not perform.
- **Follow existing repo conventions exactly**: no PHPUnit/Composer;
  `declare(strict_types=1)`; `namespace KanaGame\Paddle\...`; repository
  classes take a `PDO` constructor argument (never call `Db::connect`
  themselves) so tests can inject SQLite; entrypoints follow
  `entitlement.php`'s Config/Cors/method-check/dispatch shape; tests are
  `array<string, callable(): void>`-returning functions registered in
  `server/tests/run-tests.php`, using `assertTrue`/`assertFalse`/
  `assertSame` from `TestCase.php`.

---

## File structure

```
server/
  sql/
    migrations/
      0001_users_auth_foundation.sql      (NEW - additive only)
  src/
    Uuid.php                              (NEW - UUIDv4 generator, no deps)
    Cors.php                              (MODIFY - add preflight method/header policy)
    Auth/
      Mailer.php                          (NEW - interface only)
      EmailNormalizer.php                 (NEW)
      EmailValidator.php                  (NEW - syntax + length validation)
      MagicLinkUrlBuilder.php             (NEW - safe-by-construction fragment URL)
      UserRepository.php                  (NEW)
      MagicLinkTokenRepository.php        (NEW)
      SessionRepository.php               (NEW)
      RateLimiter.php                     (NEW - atomic upsert-based counter)
      CurrentUserService.php              (NEW - session -> user; logout; the
                                            lightweight PR-B-reusable service)
      MagicLinkAuthService.php            (NEW - request-link/verify
                                            orchestration; depends on
                                            CurrentUserService for the
                                            session-creation half of verify())
  auth/
    request-link.php                      (NEW - entrypoint)
    verify.php                            (NEW - entrypoint)
    me.php                                (NEW - entrypoint)
    logout.php                            (NEW - entrypoint)
  config.example.php                      (MODIFY - add new config keys)
  tests/
    UuidTest.php                          (NEW)
    CorsTest.php                          (MODIFY - add preflight tests)
    Auth/
      FakeMailer.php                      (NEW - TEST-ONLY, not under server/src/)
      EmailNormalizerTest.php             (NEW)
      EmailValidatorTest.php              (NEW)
      MagicLinkUrlBuilderTest.php         (NEW)
      UserRepositoryTest.php              (NEW)
      MagicLinkTokenRepositoryTest.php    (NEW)
      SessionRepositoryTest.php           (NEW)
      RateLimiterTest.php                 (NEW)
      CurrentUserServiceTest.php          (NEW)
      MagicLinkAuthServiceTest.php        (NEW - race-scenario/integration-
                                            style tests against SQLite)
    run-tests.php                         (MODIFY - register new test files)
src/
  lib/
    auth/
      sessionTransport.ts                 (NEW - frontend interface + in-memory impl)
      sessionTransport.test.ts            (NEW)
docs/
  adr/
    0001-cross-site-auth-transport.md     (NEW)
  paddle-auth-phase3a-pr-a.md             (NEW - PR A-specific docs, deployment notes)
```

Rationale for `server/auth/` (approved as-is by ChatGPT's review, no
change from the original plan): four new entrypoints under one flat
`server/` directory alongside `paddle-webhook.php`/`entitlement.php`
would clutter the existing directory and blur "Paddle payment PoC" vs.
"auth foundation" at a glance. A `server/auth/` subdirectory keeps the
existing two Phase 2 entrypoints exactly where they are while giving PR
A's four endpoints one clear home, mirroring `server/src/Auth/` as a
subnamespace.

**Why `CurrentUserService` and `MagicLinkAuthService` are two classes,
not one `AuthService`** (Task 7's correction, replacing the original
plan's single `AuthService`): the original plan's `AuthService`
constructor took `MagicLinkTokenRepository`, `UserRepository`,
`SessionRepository`, `RateLimiter`, and `Mailer` — meaning `me.php` and
`logout.php`, which only ever need "resolve a session to a user" or
"revoke a session," would have had to construct a `RateLimiter` (with a
pepper) and a `Mailer` just to satisfy that one constructor, and PR B's
future `purchase-intent.php` (which only needs "who is the current
user?") would face the same problem. `CurrentUserService` depends on
only `UserRepository` + `SessionRepository` — nothing else — and is the
one class `me.php`, `logout.php`, and (in PR B) `purchase-intent.php`
actually need. `MagicLinkAuthService` depends on
`MagicLinkTokenRepository` + `UserRepository` + `RateLimiter` + `Mailer`
+ `CurrentUserService` (composed, not duplicated — `verify()` calls into
`CurrentUserService`'s session-creation to avoid two classes both
knowing how to mint a session) and is used only by `request-link.php`
and `verify.php`.

---

## Task 1: UUIDv4 generator (no dependency)

**Unchanged from the original plan (approved as-is).**

**Files:**
- Create: `server/src/Uuid.php`
- Test: `server/tests/UuidTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Produces: `KanaGame\Paddle\Uuid::v4(): string` — returns a
  lowercase, hyphenated UUIDv4 string. Used by `UserRepository`
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

Run:

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
 * Composer/PHP dependency manager, so this uses only random_bytes(),
 * the same primitive already used for magic-link/session/purchase-ref
 * token generation elsewhere in this codebase.
 */
final class Uuid
{
    public static function v4(): string
    {
        $bytes = random_bytes(16);

        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
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

Modify `server/tests/run-tests.php` — add to the `$testFiles` array:

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
Expected: all previous 32 tests still pass, plus 4 new tests — `36 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add server/src/Uuid.php server/tests/UuidTest.php server/tests/run-tests.php
git commit -m "feat: add dependency-free UUIDv4 generator for user ids"
```

---

## Task 2: Additive migration for the four new tables (plus FK references)

**Revised in this rev.**: adds `FOREIGN KEY` constraints from
`magic_link_tokens.user_id` to `users.id` and `sessions.user_id` to
`users.id` (Task 7's correction — "schema consistency / referential
integrity"). `magic_link_tokens.user_id` was present in the original
migration but never meaningfully set anywhere in the original plan's
code; this revision both adds the FK and (in Task 11) makes `verify()`
actually populate it, inside the same transaction as the token consume
and user resolution.

**Files:**
- Create: `server/sql/migrations/0001_users_auth_foundation.sql`

**Interfaces:**
- Produces: the `users`, `magic_link_tokens`, `sessions`, `rate_limits`
  tables that Tasks 3–6's repositories read/write.

This task has no PHP to test directly (schema-only), but its DDL is
exercised indirectly by every later repository test, which creates the
equivalent schema in SQLite. **SQLite's foreign-key pragma is off by
default and this plan does not turn it on for tests** (matching the
rest of this codebase's test doubles) — the FK constraints below are a
MariaDB-level referential-integrity guarantee, proven by the migration's
DDL and by code-level tests asserting "no session can resolve to a
nonexistent user through normal code" (Task 7's required test, added in
Task 11).

- [ ] **Step 1: Write the migration file**

```sql
-- Phase 3A, PR A -- additive migration. Adds real-user identity and
-- Magic Link auth foundation tables. Does NOT alter, drop, or rename
-- payment_events or entitlements (see server/sql/schema.sql) -- Phase 2's
-- sandbox-test-user PoC path is completely untouched by this migration.
--
-- Run this once, after server/sql/schema.sql, against the same MariaDB
-- 10.5+ database used by Phase 2. This migration is NOT deployed to
-- Xserver as part of this PR.

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  email_normalized VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_email_normalized (email_normalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email_normalized VARCHAR(255) NOT NULL,
  -- Bound to the resolved user INSIDE the same transaction as the
  -- atomic token-consume + user find-or-create in
  -- MagicLinkAuthService::verify() -- set only on successful
  -- verification, never at issue() time. ON DELETE SET NULL: if a user
  -- row were ever deleted (not implemented in this PR), the historical
  -- token record survives with its user link cleared.
  user_id CHAR(36) NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_token_hash (token_hash),
  KEY idx_email_normalized (email_normalized),
  KEY idx_user_id (user_id),
  CONSTRAINT fk_magic_link_tokens_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash CHAR(64) NOT NULL,
  -- A session must always belong to a real user -- NOT NULL, and
  -- ON DELETE CASCADE: if a user row were ever deleted, that user's
  -- sessions are deleted with it rather than becoming orphaned rows
  -- that could otherwise resolve to a nonexistent user.
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_token_hash (token_hash),
  KEY idx_user_id (user_id),
  CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bucket VARCHAR(32) NOT NULL,
  -- HMAC-SHA256(bucket:value, RATE_LIMIT_PEPPER) hex digest. NEVER the
  -- raw normalized email or raw IP address.
  identifier VARCHAR(128) NOT NULL,
  window_start DATETIME NOT NULL,
  count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_bucket_identifier (bucket, identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Confirm the migration is additive-only**

Run:

```bash
grep -in "ALTER\|DROP" server/sql/migrations/0001_users_auth_foundation.sql
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add server/sql/migrations/0001_users_auth_foundation.sql
git commit -m "feat: add additive migration for users/magic-link/sessions/rate-limit tables"
```

---

## Task 3: `UserRepository` — atomic find-or-create

**Unchanged from the original plan (approved as-is).**

**Files:**
- Create: `server/src/Auth/UserRepository.php`
- Test: `server/tests/Auth/UserRepositoryTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Consumes: `KanaGame\Paddle\Uuid::v4()` (Task 1).
- Produces:
  - `KanaGame\Paddle\Auth\UserRepository::__construct(PDO $pdo)`
  - `findOrCreateByEmail(string $emailNormalized): array{id: string, email_normalized: string}`
    — used by `MagicLinkAuthService::verify()` (Task 11).
  - `findById(string $id): ?array{id: string, email_normalized: string}`
    — used by `CurrentUserService` (Task 8) and tests.

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
 * Reads/writes the users table. A users row is created ONLY via
 * findOrCreateByEmail(), which is called exclusively from
 * MagicLinkAuthService::verify() -- there is no code path that creates
 * a durable user from an unauthenticated request-link call.
 *
 * findOrCreateByEmail() is MariaDB-safe against two distinct,
 * simultaneously-valid magic-link tokens for the same email being
 * verified concurrently: it uses INSERT ... ON DUPLICATE KEY UPDATE (a
 * no-op on conflict) followed by a re-SELECT, rather than a bare
 * SELECT-then-unprotected-INSERT. The SQLite dialect used by tests has
 * no ON DUPLICATE KEY UPDATE, so this repository detects the driver and
 * uses SQLite's equivalent (INSERT OR IGNORE) when running under tests
 * -- both paths converge on the same re-SELECT.
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
    __DIR__ . '/Auth/UserRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\userRepositoryTests',
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

## Task 4: `MagicLinkTokenRepository` — atomic single-use consume + hash_equals()

**Revised in this rev.**: adds the `hash_equals()` final-comparison step
(the "hash_equals consistency" correction) and a `bindUser()` method
(Task 7's referential-integrity correction — called by
`MagicLinkAuthService::verify()`, Task 11, to populate
`magic_link_tokens.user_id` after the user is resolved, inside the same
transaction as the consume).

**Files:**
- Create: `server/src/Auth/MagicLinkTokenRepository.php`
- Test: `server/tests/Auth/MagicLinkTokenRepositoryTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Produces:
  - `KanaGame\Paddle\Auth\MagicLinkTokenRepository::__construct(PDO $pdo)`
  - `issue(string $emailNormalized, string $rawToken, \DateTimeImmutable $expiresAt): void`
  - `consume(string $rawToken): bool` — atomic conditional UPDATE, returns
    true iff exactly one row was affected.
  - `findEmailForRawToken(string $rawToken): ?string` — re-hashes the
    raw token, fetches the stored hash for a matching row, and calls
    `hash_equals()` between the freshly computed hash and the fetched
    one before trusting the row's email — see the note below for why
    this isn't redundant with the SQL lookup.
  - `bindUser(string $rawToken, string $userId): void` — sets
    `magic_link_tokens.user_id` for the matching row. Called only from
    `MagicLinkAuthService::verify()`, after `consume()` returns true and
    the user has been resolved, inside the same transaction.

**Why `hash_equals()` here, given the lookup is already an indexed SQL
equality match**: the spec (rev. 3) states the final comparison uses
`hash_equals()` "to avoid any timing signal beyond what the indexed
lookup itself leaks." This plan implements the explicit `hash_equals()`
step rather than only documenting why the indexed lookup suffices,
because: (1) it is cheap and adds no meaningful latency, (2) the SQLite
path used in every test does not have the same guaranteed
indexed-comparison characteristics as MariaDB's engine internals, so
relying on "the DB engine won't leak timing" is a weaker, less portable
guarantee than doing the comparison explicitly in PHP, and (3) it keeps
plan/spec/code consistent, which ChatGPT's review explicitly asked for.

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

        'bindUser() associates a consumed token with the resolved user' => function () {
            $pdo = makeMagicLinkTestDb();
            $repo = new MagicLinkTokenRepository($pdo);
            $repo->issue('bind-me@example.com', 'bind-token', new \DateTimeImmutable('+15 minutes'));
            $repo->consume('bind-token');

            $repo->bindUser('bind-token', 'user-uuid-123');

            $userId = $pdo->query("SELECT user_id FROM magic_link_tokens WHERE email_normalized = 'bind-me@example.com'")->fetchColumn();
            assertSame('user-uuid-123', $userId, 'user_id should be bound after bindUser()');
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
 * Reads/writes magic_link_tokens. The raw token is never stored -- only
 * SHA-256(raw) -- and consume() enforces single-use via an atomic
 * conditional UPDATE + affected-row-count check. The final hash
 * comparison in findEmailForRawToken() uses hash_equals() per the
 * spec's explicit requirement.
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

    public function consume(string $rawToken): bool
    {
        $tokenHash = hash('sha256', $rawToken);
        $nowExpression = $this->nowExpression();

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
        $expectedHash = hash('sha256', $rawToken);

        $statement = $this->pdo->prepare(
            'SELECT email_normalized, token_hash FROM magic_link_tokens WHERE token_hash = :token_hash LIMIT 1',
        );
        $statement->execute(['token_hash' => $expectedHash]);
        /** @var array{email_normalized: string, token_hash: string}|false $row */
        $row = $statement->fetch();

        if ($row === false) {
            return null;
        }

        if (!hash_equals($expectedHash, $row['token_hash'])) {
            return null;
        }

        return $row['email_normalized'];
    }

    public function bindUser(string $rawToken, string $userId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE magic_link_tokens SET user_id = :user_id WHERE token_hash = :token_hash',
        );
        $statement->execute([
            'user_id' => $userId,
            'token_hash' => hash('sha256', $rawToken),
        ]);
    }

    private function nowExpression(): string
    {
        return $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';
    }
}
```

- [ ] **Step 4: Register the test file in the runner**

```php
    __DIR__ . '/Auth/MagicLinkTokenRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\magicLinkTokenRepositoryTests',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: `49 passed, 0 failed` (7 tests this time — one more than the
original plan's 6, for `bindUser()`).

- [ ] **Step 6: Commit**

```bash
git add server/src/Auth/MagicLinkTokenRepository.php server/tests/Auth/MagicLinkTokenRepositoryTest.php server/tests/run-tests.php
git commit -m "feat: add MagicLinkTokenRepository with atomic consume, hash_equals, and user binding"
```

---

## Task 5: `SessionRepository` — hash_equals(), 24-hour default expiry

**Revised in this rev.**: adds `hash_equals()` (same rationale as Task
4). Session expiry changed from 30 days to 24 hours per ChatGPT's
explicit decision.

**Files:**
- Create: `server/src/Auth/SessionRepository.php`
- Test: `server/tests/Auth/SessionRepositoryTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Produces:
  - `KanaGame\Paddle\Auth\SessionRepository::__construct(PDO $pdo)`
  - `create(string $userId, string $rawToken, \DateTimeImmutable $expiresAt): void`
  - `findActiveUserIdForRawToken(string $rawToken): ?string` — hash_equals-verified,
    updates `last_seen_at` as a side effect on success.
  - `revoke(string $rawToken): void` — safe no-op if unknown.

**Session expiry: 24 hours, not 30 days** (`SESSION_EXPIRY_HOURS`): the
current transport (`InMemorySessionTransport`, Task 15) is already lost
on every page reload, so a long server-side session provides no UX
benefit today, while the token is a real account credential with no
refresh/rotation system yet. This is explicitly provisional — the ADR
(Task 13) notes it must be reconsidered once a production browser
transport is chosen. See Task 9 for the config key.

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
            $repo->create('user-123', 'session-raw-token', new \DateTimeImmutable('+24 hours'));

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
            $repo->create('user-789', 'to-be-revoked', new \DateTimeImmutable('+24 hours'));
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
            $repo->create('user-abc', 'super-secret-session-value', new \DateTimeImmutable('+24 hours'));

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
 * Reads/writes sessions. Raw session token is never stored -- only
 * SHA-256(raw). A session is a real account credential, not merely an
 * entitlement flag. The final hash comparison in
 * findActiveUserIdForRawToken() uses hash_equals(), same pattern as
 * MagicLinkTokenRepository.
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
        $expectedHash = hash('sha256', $rawToken);
        $nowExpression = $this->nowExpression();

        $select = $this->pdo->prepare(
            "SELECT user_id, token_hash FROM sessions
             WHERE token_hash = :token_hash AND revoked_at IS NULL AND expires_at > {$nowExpression}
             LIMIT 1",
        );
        $select->execute(['token_hash' => $expectedHash]);
        /** @var array{user_id: string, token_hash: string}|false $row */
        $row = $select->fetch();

        if ($row === false) {
            return null;
        }

        if (!hash_equals($expectedHash, $row['token_hash'])) {
            return null;
        }

        $touch = $this->pdo->prepare(
            "UPDATE sessions SET last_seen_at = {$nowExpression} WHERE token_hash = :token_hash",
        );
        $touch->execute(['token_hash' => $expectedHash]);

        return $row['user_id'];
    }

    public function revoke(string $rawToken): void
    {
        $nowExpression = $this->nowExpression();

        $statement = $this->pdo->prepare(
            "UPDATE sessions SET revoked_at = {$nowExpression}
             WHERE token_hash = :token_hash AND revoked_at IS NULL",
        );
        $statement->execute(['token_hash' => hash('sha256', $rawToken)]);
    }

    private function nowExpression(): string
    {
        return $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite'
            ? "datetime('now')"
            : 'NOW()';
    }
}
```

- [ ] **Step 4: Register the test file in the runner**

```php
    __DIR__ . '/Auth/SessionRepositoryTest.php' => 'KanaGame\\Paddle\\Tests\\sessionRepositoryTests',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: `55 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add server/src/Auth/SessionRepository.php server/tests/Auth/SessionRepositoryTest.php server/tests/run-tests.php
git commit -m "feat: add SessionRepository with revocable hash_equals-verified sessions"
```

---

## Task 6: `RateLimiter` — atomic MariaDB-safe counter (required correction 2)

**Substantially revised in this rev.** The original plan's
`checkAndRecord()` did `SELECT count` -> check in PHP -> separate
`UPDATE count = count + 1`. ChatGPT's review correctly identified this
as unsafe: two concurrent requests can both `SELECT` the same
pre-increment count, both see "under the limit," and both proceed,
letting the effective limit be exceeded — and the very first `INSERT`
for a brand-new `(bucket, identifier)` pair also raced unprotected.

**New approach**: every check-and-record call runs inside its own short
PDO transaction. It first executes an atomic
`INSERT ... ON DUPLICATE KEY UPDATE` that unconditionally ensures a row
exists and (if the existing window is still current) increments
`count`, or (if the window has expired) resets `count` to 1 and moves
`window_start` forward — all in ONE statement, so there is no
read-then-write gap for the row's existence or its count column between
two concurrent callers. It then re-reads that same row with
`SELECT ... FOR UPDATE` (still inside the same transaction, so the
row stays locked against a concurrent second `INSERT ... ON DUPLICATE
KEY UPDATE` until this transaction commits) to learn the
post-increment count and decide allow/deny, and commits. This makes the
whole "did this push us over the limit" decision atomic per identifier:
a second concurrent caller's `INSERT ... ON DUPLICATE KEY UPDATE`
blocks on the row lock until the first caller's transaction commits, so
the two calls are effectively serialized against each other for that
one identifier, which is exactly the property needed (two different
identifiers still proceed fully in parallel, since they're different
rows).

SQLite (used only by tests) has no `ON DUPLICATE KEY UPDATE` and no
`SELECT ... FOR UPDATE` (SQLite's transaction locking model is
file-level, not row-level) — the SQLite path uses `INSERT OR IGNORE`
plus a normal `UPDATE ... WHERE` for the increment, still wrapped in an
explicit transaction, which is sufficient to prove the *logical*
atomicity/idempotency of the increment-vs-reset decision under test
(single-threaded PHP CLI execution), even though it cannot exercise
MariaDB's actual row-locking behavior — this is exactly the
"race-scenario test, not true concurrent execution" caveat from Global
Constraints, called out explicitly in this task's tests.

**Files:**
- Create: `server/src/Auth/RateLimiter.php`
- Test: `server/tests/Auth/RateLimiterTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Produces:
  - `KanaGame\Paddle\Auth\RateLimiter::__construct(PDO $pdo, string $pepper, int $emailLimitPerHour, int $ipLimitPerHour)`
  - `checkAndRecordEmail(string $emailNormalized): bool`
  - `checkAndRecordIp(string $rawIp): bool`
  - Both compute `hash_hmac('sha256', "{$bucket}:{$value}", $pepper)` as
    the stored `identifier`.

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

        'the raw email is never persisted -- only its HMAC is stored' => function () {
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

        'the raw IP is never persisted -- only its HMAC is stored' => function () {
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

        // -- Race-scenario / atomicity semantic test (NOT true concurrent
        // MariaDB execution -- see Global Constraints). Proves the
        // atomic-upsert-then-locked-read pattern converges on exactly
        // one row per identifier even when the very first call for a
        // brand-new identifier is repeated back-to-back, which is the
        // scenario the original SELECT-then-UPDATE pattern mishandled.
        'race-scenario test: repeated first-ever calls for a brand-new identifier never create duplicate rows' => function () {
            $pdo = makeRateLimitTestDb();
            $limiter = new RateLimiter($pdo, 'test-pepper', 5, 20);

            for ($i = 0; $i < 3; $i++) {
                $limiter->checkAndRecordEmail('brand-new@example.com');
            }

            $count = (int) $pdo->query(
                "SELECT COUNT(*) FROM rate_limits WHERE bucket = 'magic_link_email'",
            )->fetchColumn();
            assertSame(1, $count, 'exactly one row must exist for this identifier no matter how many times the first-call path runs');
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
 * persists a raw email or raw IP -- only HMAC-SHA256(bucket:value,
 * pepper). No Redis/external service.
 *
 * Concurrency-safe by construction: checkAndRecord() wraps an atomic
 * INSERT ... ON DUPLICATE KEY UPDATE (which unconditionally creates the
 * row or advances/increments it in one statement -- no read-then-write
 * gap) together with a SELECT ... FOR UPDATE re-read of that same row,
 * inside one transaction. The FOR UPDATE row lock serializes concurrent
 * callers for the SAME identifier against each other until this
 * transaction commits, so two concurrent requests for the same
 * email/IP cannot both observe a stale pre-increment count and both
 * proceed past the limit. Different identifiers are different rows and
 * are not serialized against each other.
 *
 * SQLite (tests only) has neither ON DUPLICATE KEY UPDATE nor row-level
 * locking -- the SQLite branch below uses INSERT OR IGNORE plus a
 * separate UPDATE, which is sufficient to prove the logical
 * increment/reset decision under single-threaded test execution but
 * does NOT exercise MariaDB's actual row-locking behavior. See this
 * repo's PR A plan, Task 14, for the required real-MariaDB verification
 * this class's true concurrency behavior still needs before Live
 * rollout.
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
        $driver = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME);

        $this->pdo->beginTransaction();
        try {
            if ($driver === 'sqlite') {
                $this->upsertWindowSqlite($bucket, $identifier, $now);
            } else {
                $this->upsertWindowMariaDb($bucket, $identifier, $now);
            }

            $lockClause = $driver === 'sqlite' ? '' : ' FOR UPDATE';
            $select = $this->pdo->prepare(
                "SELECT count FROM rate_limits WHERE bucket = :bucket AND identifier = :identifier{$lockClause}",
            );
            $select->execute(['bucket' => $bucket, 'identifier' => $identifier]);
            $count = (int) $select->fetchColumn();

            $allowed = $count <= $limitPerHour;
            $this->pdo->commit();

            return $allowed;
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * MariaDB: one atomic statement either creates the row at count=1,
     * or -- if the existing window is still current -- increments
     * count, or -- if the existing window has expired -- resets count
     * to 1 and moves window_start forward. No separate read happens
     * before this write, so there is no gap for a concurrent caller to
     * exploit.
     */
    private function upsertWindowMariaDb(string $bucket, string $identifier, \DateTimeImmutable $now): void
    {
        $nowStr = $now->format('Y-m-d H:i:s');
        $cutoffStr = $now->modify('-' . self::WINDOW_SECONDS . ' seconds')->format('Y-m-d H:i:s');

        $statement = $this->pdo->prepare(
            'INSERT INTO rate_limits (bucket, identifier, window_start, count)
             VALUES (:bucket, :identifier, :now, 1)
             ON DUPLICATE KEY UPDATE
               count = IF(window_start < :cutoff, 1, count + 1),
               window_start = IF(window_start < :cutoff, :now2, window_start)',
        );
        $statement->execute([
            'bucket' => $bucket,
            'identifier' => $identifier,
            'now' => $nowStr,
            'cutoff' => $cutoffStr,
            'now2' => $nowStr,
        ]);
    }

    /**
     * SQLite (tests only): no ON DUPLICATE KEY UPDATE, so this uses
     * INSERT OR IGNORE (atomic row creation) followed by a separate
     * UPDATE for the increment/reset -- skipped entirely when the
     * INSERT OR IGNORE just created the row (checked via rowCount(),
     * not a timestamp comparison, since two calls within the same
     * wall-clock second would otherwise be indistinguishable by
     * window_start alone). This does not carry the same
     * single-statement atomicity guarantee as the MariaDB path, but
     * SQLite's tests run single-threaded, so no real race exists to
     * expose the gap -- see this method's and the class's own caveats.
     */
    private function upsertWindowSqlite(string $bucket, string $identifier, \DateTimeImmutable $now): void
    {
        $nowStr = $now->format('Y-m-d H:i:s');
        $cutoffStr = $now->modify('-' . self::WINDOW_SECONDS . ' seconds')->format('Y-m-d H:i:s');

        $insert = $this->pdo->prepare(
            'INSERT OR IGNORE INTO rate_limits (bucket, identifier, window_start, count)
             VALUES (:bucket, :identifier, :now, 1)',
        );
        $insert->execute(['bucket' => $bucket, 'identifier' => $identifier, 'now' => $nowStr]);

        if ($insert->rowCount() === 1) {
            // This call's own INSERT OR IGNORE just created the row at
            // (now, 1) -- the row is already correct, skip the UPDATE
            // entirely so it isn't double-incremented to 2.
            return;
        }

        $update = $this->pdo->prepare(
            'UPDATE rate_limits
             SET count = CASE WHEN window_start < :cutoff THEN 1 ELSE count + 1 END,
                 window_start = CASE WHEN window_start < :cutoff THEN :now ELSE window_start END
             WHERE bucket = :bucket AND identifier = :identifier',
        );
        $update->execute([
            'cutoff' => $cutoffStr,
            'now' => $nowStr,
            'bucket' => $bucket,
            'identifier' => $identifier,
        ]);
    }
}
```

**Note on the `rowCount()` guard (corrected during implementation)**:
an earlier draft of this method used a `WHERE NOT (window_start = :now
AND count = 1)` clause to skip the `UPDATE` for a just-created row, but
that comparison is unreliable — two separate calls landing within the
same wall-clock second produce an identical `:now` value, so the guard
could not actually distinguish "I just created this row" from "this row
already existed and happens to still show the same second," causing the
`UPDATE` to be skipped for legitimate subsequent calls too (verified by
a manual reproduction during implementation: 6 calls in a tight loop all
read back `count = 1`). Checking `$insert->rowCount() === 1` directly
reports whether *this specific* `INSERT OR IGNORE` inserted a row,
which is unambiguous regardless of timestamp collisions, and is what
the shipped implementation uses.

- [ ] **Step 4: Register the test file in the runner**

```php
    __DIR__ . '/Auth/RateLimiterTest.php' => 'KanaGame\\Paddle\\Tests\\rateLimiterTests',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: `63 passed, 0 failed` (8 tests this time — one more than the
original plan's 7, for the race-scenario duplicate-row test).

- [ ] **Step 6: Commit**

```bash
git add server/src/Auth/RateLimiter.php server/tests/Auth/RateLimiterTest.php server/tests/run-tests.php
git commit -m "feat: rewrite RateLimiter with atomic MariaDB upsert-based counting"
```

---

## Task 7: `EmailNormalizer` and `EmailValidator`

**Revised in this rev.**: adds `EmailValidator` (new — required
correction 2's "add validation for normalized email"). `EmailNormalizer`
itself is unchanged from the original plan.

**Files:**
- Create: `server/src/Auth/EmailNormalizer.php`
- Create: `server/src/Auth/EmailValidator.php`
- Test: `server/tests/Auth/EmailNormalizerTest.php`
- Test: `server/tests/Auth/EmailValidatorTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Produces:
  - `KanaGame\Paddle\Auth\EmailNormalizer::normalize(string $rawEmail): string`
    — lowercase + trim only.
  - `KanaGame\Paddle\Auth\EmailValidator::isValid(string $normalizedEmail): bool`
    — checks PHP's built-in email syntax filter
    (`FILTER_VALIDATE_EMAIL`) AND that the value fits the
    `users.email_normalized VARCHAR(255)` column (`<= 255` bytes).
    Used by `MagicLinkAuthService::requestLink()` (Task 11) — an invalid
    email still returns the same generic `200 {"status":"ok"}` (per
    Global Constraints' enumeration-safety rule), it just never reaches
    the rate limiter/token-issue/mailer path. This is a **quality** gate
    (don't waste a rate-limit slot or attempt to insert a row that would
    violate the column's length), not a security gate — an invalid
    email was never going to be deliverable anyway.

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
            assertSame('a.b@example.com', EmailNormalizer::normalize('a.b@example.com'), 'dots must be preserved -- no alias folding per the design spec');
        },

        'normalize() does NOT fold Gmail plus aliases' => function () {
            assertSame('user+tag@example.com', EmailNormalizer::normalize('user+tag@example.com'), 'plus-tags must be preserved -- no alias folding per the design spec');
        },
    ];
}
```

- [ ] **Step 2: Run test to verify it fails, then write `EmailNormalizer`**

Run: `php -r "require 'server/tests/TestCase.php'; require 'server/tests/Auth/EmailNormalizerTest.php';"`
Expected: `Fatal error: ... 'EmailNormalizer' not found`.

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Deliberately minimal: lowercase + trim only. No Gmail dot/plus-alias
 * folding -- merging identities this way requires its own reviewed
 * migration, not an automatic normalization change.
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

- [ ] **Step 3: Register and run**

```php
    __DIR__ . '/Auth/EmailNormalizerTest.php' => 'KanaGame\\Paddle\\Tests\\emailNormalizerTests',
```

Run: `php server/tests/run-tests.php` — expect `67 passed, 0 failed`.

- [ ] **Step 4: Commit the normalizer**

```bash
git add server/src/Auth/EmailNormalizer.php server/tests/Auth/EmailNormalizerTest.php server/tests/run-tests.php
git commit -m "feat: add EmailNormalizer (lowercase+trim only, no alias folding)"
```

- [ ] **Step 5: Write the failing test for `EmailValidator`**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\EmailValidator;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/EmailValidator.php';

/**
 * @return array<string, callable(): void>
 */
function emailValidatorTests(): array
{
    return [
        'isValid() accepts a normal email address' => function () {
            assertTrue(EmailValidator::isValid('user@example.com'), 'a normal email should be valid');
        },

        'isValid() rejects a string with no @ sign' => function () {
            assertFalse(EmailValidator::isValid('not-an-email'), 'missing @ should be invalid');
        },

        'isValid() rejects an empty string' => function () {
            assertFalse(EmailValidator::isValid(''), 'empty string should be invalid');
        },

        'isValid() rejects a value longer than the email_normalized column (255 bytes)' => function () {
            $tooLong = str_repeat('a', 250) . '@example.com';
            assertFalse(EmailValidator::isValid($tooLong), 'a value over 255 bytes should be invalid');
        },

        'isValid() accepts the longest syntactically valid email PHP\'s own filter allows (254 bytes, under the 255-byte column limit)' => function () {
            // PHP's FILTER_VALIDATE_EMAIL enforces RFC 5321's 64-char
            // local-part limit and an overall ~254-byte practical cap,
            // so this class's own 255-byte column-length check can
            // never actually reject anything FILTER_VALIDATE_EMAIL
            // itself accepts -- this test proves the two checks compose
            // without the column-length check spuriously rejecting a
            // value the syntax filter already allows. (Corrected during
            // implementation -- an earlier draft of this test assumed a
            // 255-byte email built from one long local part would be
            // syntactically valid; PHP's filter rejects any local part
            // over 64 chars, so that assumption was wrong. A multi-label
            // domain reaches the real 254-byte ceiling instead.)
            $label = str_repeat('a', 60);
            $domain = implode('.', array_fill(0, 4, $label)) . '.com';
            $localPart = str_repeat('u', 6);
            $longestValidEmail = $localPart . '@' . $domain;
            assertSame(254, strlen($longestValidEmail), 'test setup sanity check');
            assertTrue(EmailValidator::isValid($longestValidEmail), 'a syntactically valid 254-byte email should be valid');
        },
    ];
}
```

- [ ] **Step 6: Run test to verify it fails, then write `EmailValidator`**

Run: `php -r "require 'server/tests/TestCase.php'; require 'server/tests/Auth/EmailValidatorTest.php';"`
Expected: `Fatal error: ... 'EmailValidator' not found`.

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Quality gate, not a security gate -- rejects an email that could
 * never be deliverable or that would not fit the users.email_normalized
 * VARCHAR(255) column, before it reaches the rate limiter or the mailer.
 * An invalid email still gets the same generic 200 response from
 * request-link.php (see MagicLinkAuthService::requestLink()) -- this
 * class only decides whether the request-link flow proceeds internally,
 * never what the caller sees.
 */
final class EmailValidator
{
    private const MAX_LENGTH = 255;

    public static function isValid(string $normalizedEmail): bool
    {
        if ($normalizedEmail === '' || strlen($normalizedEmail) > self::MAX_LENGTH) {
            return false;
        }

        return filter_var($normalizedEmail, FILTER_VALIDATE_EMAIL) !== false;
    }

    private function __construct()
    {
    }
}
```

- [ ] **Step 7: Register and run**

```php
    __DIR__ . '/Auth/EmailValidatorTest.php' => 'KanaGame\\Paddle\\Tests\\emailValidatorTests',
```

Run: `php server/tests/run-tests.php` — expect `72 passed, 0 failed`.

- [ ] **Step 8: Commit**

```bash
git add server/src/Auth/EmailValidator.php server/tests/Auth/EmailValidatorTest.php server/tests/run-tests.php
git commit -m "feat: add EmailValidator (syntax + column-length check)"
```

---

## Task 8: `CurrentUserService` — the session-only, PR-B-reusable service (required correction 3)

**New in this rev.** This is the class that did not exist in the
original plan — it's the direct fix for "do not make me.php/logout.php
require RATE_LIMIT_PEPPER, MagicLink base URL, Mailer,
MagicLinkTokenRepository just to resolve a session." `me.php` and
`logout.php` (Task 12) depend on `CurrentUserService` ONLY.
`MagicLinkAuthService` (Task 11) also depends on it, composing rather
than duplicating the session-creation logic.

**Files:**
- Create: `server/src/Auth/CurrentUserService.php`
- Test: `server/tests/Auth/CurrentUserServiceTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Consumes: `UserRepository` (Task 3), `SessionRepository` (Task 5).
- Produces:
  - `KanaGame\Paddle\Auth\CurrentUserService::__construct(UserRepository $users, SessionRepository $sessions, int $sessionExpiryHours)`
  - `createSession(string $userId): string` — generates a raw session
    token, calls `sessions->create()`, returns the raw token. Called by
    `MagicLinkAuthService::verify()` (Task 11) — this is the "compose,
    don't duplicate" seam mentioned in the File Structure rationale.
  - `resolve(string $rawSessionToken): ?array{user_id: string, email_normalized: string}`
    — the single method `me.php` needs. Returns `null` for any
    invalid/expired/revoked/unknown token, or if the session's `user_id`
    somehow doesn't resolve to a real user (defensive — should be
    unreachable given the `ON DELETE CASCADE` FK from Task 2, but
    `findById()` returning `null` is handled explicitly rather than
    assumed impossible).
  - `logout(string $rawSessionToken): void` — delegates to
    `sessions->revoke()`. This method's return type is `void` — see
    Task 12 for how `logout.php` itself (not this service) implements
    required correction 6's "genuine DB error must not look like
    success" behavior, since that's an HTTP-layer distinction
    (500 vs. 200), not something this service needs to encode.

- [ ] **Step 1: Write the failing test**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/CurrentUserService.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';
require_once __DIR__ . '/../../src/Uuid.php';

function makeCurrentUserServiceTestDb(): PDO
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

function makeCurrentUserService(PDO $pdo): CurrentUserService
{
    return new CurrentUserService(new UserRepository($pdo), new SessionRepository($pdo), 24);
}

/**
 * @return array<string, callable(): void>
 */
function currentUserServiceTests(): array
{
    return [
        'createSession() then resolve() resolves the correct user' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $service = makeCurrentUserService($pdo);
            $user = $users->findOrCreateByEmail('session-test@example.com');

            $rawToken = $service->createSession($user['id']);
            $resolved = $service->resolve($rawToken);

            assertTrue($resolved !== null, 'a freshly created session should resolve');
            assertSame('session-test@example.com', $resolved['email_normalized'], 'email should match');
            assertSame($user['id'], $resolved['user_id'], 'user_id should match');
        },

        'resolve() returns null for an unknown token' => function () {
            $service = makeCurrentUserService(makeCurrentUserServiceTestDb());
            assertSame(null, $service->resolve('never-created'), 'unknown token should return null');
        },

        'logout() revokes the session so a later resolve() call fails' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $service = makeCurrentUserService($pdo);
            $user = $users->findOrCreateByEmail('logout-test@example.com');
            $rawToken = $service->createSession($user['id']);

            $service->logout($rawToken);

            assertSame(null, $service->resolve($rawToken), 'resolve() must fail after logout');
        },

        'createSession() generates a different token on each call' => function () {
            $pdo = makeCurrentUserServiceTestDb();
            $users = new UserRepository($pdo);
            $service = makeCurrentUserService($pdo);
            $user = $users->findOrCreateByEmail('multi-session@example.com');

            $first = $service->createSession($user['id']);
            $second = $service->createSession($user['id']);

            assertFalse($first === $second, 'two calls should not produce the same raw token');
            assertTrue($service->resolve($first) !== null, 'first session should still resolve');
            assertTrue($service->resolve($second) !== null, 'second session should also resolve');
        },
    ];
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php -r "require 'server/tests/TestCase.php'; require 'server/tests/Auth/CurrentUserServiceTest.php';"`
Expected: `Fatal error: ... 'CurrentUserService' not found`.

- [ ] **Step 3: Write minimal implementation**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * The ONLY service me.php and logout.php depend on -- and, in PR B,
 * the ONLY service purchase-intent.php will depend on to resolve "who
 * is the current user?". Deliberately has NO dependency on
 * MagicLinkTokenRepository, RateLimiter, or Mailer, so a session-only
 * consumer never has to construct rate-limit/mail infrastructure just
 * to answer "who is this?". See this plan's File Structure section for
 * the full rationale for this split.
 */
final class CurrentUserService
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly SessionRepository $sessions,
        private readonly int $sessionExpiryHours,
    ) {
    }

    public function createSession(string $userId): string
    {
        $rawToken = $this->generateRawToken();
        $expiresAt = new \DateTimeImmutable("+{$this->sessionExpiryHours} hours");
        $this->sessions->create($userId, $rawToken, $expiresAt);

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
            // Defensive -- the sessions.user_id -> users.id FK (ON
            // DELETE CASCADE, see the migration) should make this
            // unreachable in production, but a session must never be
            // treated as valid if it can't resolve to a real user.
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

- [ ] **Step 4: Register the test file in the runner**

```php
    __DIR__ . '/Auth/CurrentUserServiceTest.php' => 'KanaGame\\Paddle\\Tests\\currentUserServiceTests',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: `76 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add server/src/Auth/CurrentUserService.php server/tests/Auth/CurrentUserServiceTest.php server/tests/run-tests.php
git commit -m "feat: add CurrentUserService as the lightweight session-to-user resolver"
```

---

## Task 9: Extend `Cors` with preflight support (required correction 1)

**New in this rev.** The current `server/src/Cors.php` (Phase 2) only
emits `Access-Control-Allow-Origin`/`Vary` via `applyHeaders()` — no
`OPTIONS`/preflight method or header policy at all, because
`entitlement.php`'s own `OPTIONS` branch just returns 204 with no
authorization headers, which happened to be enough for Phase 2's simple
unauthenticated GET-only endpoint. PR A's endpoints need real preflight:
browsers preflight any cross-origin request using a non-simple method
(POST counts once `Content-Type: application/json` is used) or a
custom header (`Authorization`), and a preflight response must
explicitly allow those methods/headers or the browser blocks the actual
request before it's ever sent.

This extension is **strictly additive** to the existing `Cors` class —
`isOriginAllowed()` keeps its exact current signature and behavior, and
Phase 2's `entitlement.php` call site (`new Cors($config->allowedOrigins())`)
needs zero modification. A new `applyPreflightHeaders()` method is added
alongside `applyHeaders()` for the auth entrypoints (Task 13) to call
only on an `OPTIONS` request.

**Correction made during implementation — testability seam.** PHP's CLI
SAPI (used by `server/tests/run-tests.php`) does not record `header()`
calls via `headers_list()` the way a real web server does —
`headers_list()` always returns an empty array under CLI, discovered
when the tests below were first run and failed even against a correct
implementation. Testing actual header output therefore requires a small
seam: `Cors`'s constructor gains an **optional** second parameter, a
`callable(string): void` that receives each header string that would
have been sent. It defaults to a closure that calls PHP's real
`header()`, so **every existing call site (`entitlement.php`) needs zero
changes** and production behavior is identical to calling `header()`
directly. Only `server/tests/CorsTest.php` ever passes a non-default
value (a closure that appends to an array for the test to inspect).
Both `applyHeaders()` and `applyPreflightHeaders()` route through this
one injected callable instead of calling `header()` inline.

**Files:**
- Modify: `server/src/Cors.php`
- Modify: `server/tests/CorsTest.php`

**Interfaces:**
- Produces:
  - `Cors::__construct(array $allowedOrigins, ?callable $sendHeader = null)`
    — `$sendHeader`, when omitted, defaults to PHP's real `header()`;
    production code (`entitlement.php`, and the new `server/auth/*.php`
    entrypoints in Task 13) never passes this argument.
  - `Cors::applyPreflightHeaders(?string $requestOrigin): void` — if the
    origin is allowed, emits (via `$sendHeader`)
    `Access-Control-Allow-Origin: <origin>`, `Vary: Origin`,
    `Access-Control-Allow-Methods: GET, POST, OPTIONS`,
    `Access-Control-Allow-Headers: Content-Type, Authorization`.
    **Never** emits `Access-Control-Allow-Credentials` and never echoes
    the origin back as a literal wildcard (production cookie transport
    remains deferred — see the ADR, Task 15). If the origin is not
    allowed, emits nothing.

- [ ] **Step 1: Write the failing test (added to the existing `CorsTest.php`, not a new file)**

Add these entries to the existing `corsTests()` array in
`server/tests/CorsTest.php` (append inside the existing returned array,
after its current five entries — do not remove or modify any existing
entry):

```php
        'applyPreflightHeaders() emits the required method/header policy for an allowed origin' => function () {
            $sent = [];
            $cors = new Cors(['https://yhalcyon-gh.github.io'], function (string $header) use (&$sent) {
                $sent[] = $header;
            });

            $cors->applyPreflightHeaders('https://yhalcyon-gh.github.io');

            $joined = implode("\n", $sent);
            assertTrue(
                str_contains($joined, 'Access-Control-Allow-Origin: https://yhalcyon-gh.github.io'),
                'allowed origin should be echoed back',
            );
            assertTrue(str_contains($joined, 'Vary: Origin'), 'Vary: Origin should be present');
            assertTrue(
                str_contains($joined, 'Access-Control-Allow-Methods: GET, POST, OPTIONS'),
                'GET, POST, and OPTIONS must all be in Access-Control-Allow-Methods',
            );
            assertTrue(
                str_contains($joined, 'Access-Control-Allow-Headers: Content-Type, Authorization'),
                'Content-Type and Authorization must both be in Access-Control-Allow-Headers',
            );
        },

        'applyPreflightHeaders() emits nothing for a disallowed origin' => function () {
            $sent = [];
            $cors = new Cors(['https://yhalcyon-gh.github.io'], function (string $header) use (&$sent) {
                $sent[] = $header;
            });

            $cors->applyPreflightHeaders('https://evil.example.com');

            assertSame([], $sent, 'a disallowed origin must get no headers at all, including no preflight authorization headers');
        },

        'applyPreflightHeaders() never emits Access-Control-Allow-Credentials or a wildcard origin' => function () {
            $sent = [];
            $cors = new Cors(['https://yhalcyon-gh.github.io'], function (string $header) use (&$sent) {
                $sent[] = $header;
            });

            $cors->applyPreflightHeaders('https://yhalcyon-gh.github.io');

            $joined = implode("\n", $sent);
            assertFalse(
                str_contains($joined, 'Access-Control-Allow-Credentials'),
                'production cookie transport is deferred -- this header must never be emitted yet',
            );
            assertFalse(
                str_contains($joined, 'Access-Control-Allow-Origin: *'),
                'the origin must never be echoed back as a wildcard',
            );
        },

        'applyHeaders() (non-preflight) emits exactly Access-Control-Allow-Origin and Vary for an allowed origin, nothing more' => function () {
            // Regression guard: Phase 2's entitlement.php calls
            // applyHeaders(), not applyPreflightHeaders() -- this test
            // pins that the original method's output is unchanged by
            // this extension.
            $sent = [];
            $cors = new Cors(['https://yhalcyon-gh.github.io'], function (string $header) use (&$sent) {
                $sent[] = $header;
            });

            $cors->applyHeaders('https://yhalcyon-gh.github.io');

            assertSame(
                ['Access-Control-Allow-Origin: https://yhalcyon-gh.github.io', 'Vary: Origin'],
                $sent,
                'applyHeaders() must emit exactly these two headers, no preflight method/header policy',
            );
        },

        'applyHeaders() emits nothing for a disallowed origin' => function () {
            $sent = [];
            $cors = new Cors(['https://yhalcyon-gh.github.io'], function (string $header) use (&$sent) {
                $sent[] = $header;
            });

            $cors->applyHeaders('https://evil.example.com');

            assertSame([], $sent, 'a disallowed origin must get no Access-Control-Allow-Origin header at all');
        },

        'the default constructor (no injected callable) still calls PHP\'s real header() function' => function () {
            // Confirms existing Phase 2 call sites (entitlement.php),
            // which construct `new Cors($config->allowedOrigins())` with
            // no second argument, are unaffected by this extension.
            $cors = new Cors(['https://yhalcyon-gh.github.io']);
            $cors->applyHeaders('https://yhalcyon-gh.github.io');
            assertTrue(true, 'constructing and calling with no injected callable must not throw');
        },
```

**Note on the test technique (corrected during implementation)**: an
earlier draft of this task tested `applyHeaders()`/
`applyPreflightHeaders()` by wrapping calls in `ob_start()`/
`ob_end_clean()` and reading `headers_list()`. This does not work: PHP's
CLI SAPI (used by this repo's dependency-free test runner) does not
record `header()` calls via `headers_list()` the way a real web server
does — `headers_list()` always returns an empty array under CLI,
confirmed by direct reproduction during implementation. The fix is the
constructor seam described above (an optional injected `$sendHeader`
callable, defaulting to real `header()`), which every test above uses
instead of `headers_list()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `php server/tests/run-tests.php`
Expected: the new CORS tests fail with "Call to undefined method
Cors::applyPreflightHeaders()" (wrapped as an unexpected `Error` by the
test runner's catch-all).

- [ ] **Step 3: Extend `Cors.php`**

Modify `server/src/Cors.php` — add the optional injected `$sendHeader`
parameter to the constructor, route both existing and new header-
emitting methods through it, and add `applyPreflightHeaders()`:

```php
final class Cors
{
    /** @var callable(string): void */
    private $sendHeader;

    /**
     * @param list<string> $allowedOrigins
     * @param (callable(string): void)|null $sendHeader Defaults to PHP's
     *   real header() function. Overridable only for tests -- PHP's CLI
     *   SAPI (used by server/tests/run-tests.php) does not record
     *   header() calls via headers_list() the way a real web server
     *   does, so server/tests/CorsTest.php injects a recording closure
     *   here to observe what would have been sent. Production code
     *   never passes this argument.
     */
    public function __construct(private readonly array $allowedOrigins, ?callable $sendHeader = null)
    {
        $this->sendHeader = $sendHeader ?? static function (string $header): void {
            header($header);
        };
    }

    public function isOriginAllowed(?string $requestOrigin): bool
    {
        if ($requestOrigin === null || $requestOrigin === '') {
            return false;
        }
        return in_array($requestOrigin, $this->allowedOrigins, true);
    }

    public function applyHeaders(?string $requestOrigin): void
    {
        if (!$this->isOriginAllowed($requestOrigin)) {
            return;
        }
        ($this->sendHeader)('Access-Control-Allow-Origin: ' . $requestOrigin);
        ($this->sendHeader)('Vary: Origin');
    }

    /**
     * Applies CORS headers for a preflight (OPTIONS) request from an
     * allowed origin -- the new auth endpoints (server/auth/*.php) use
     * POST with a JSON body and/or an Authorization header, both of
     * which trigger a browser preflight. Never emits
     * Access-Control-Allow-Credentials -- a production cookie transport
     * is still deferred. Does nothing for a disallowed origin, same as
     * applyHeaders().
     */
    public function applyPreflightHeaders(?string $requestOrigin): void
    {
        if (!$this->isOriginAllowed($requestOrigin)) {
            return;
        }
        ($this->sendHeader)('Access-Control-Allow-Origin: ' . $requestOrigin);
        ($this->sendHeader)('Vary: Origin');
        ($this->sendHeader)('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        ($this->sendHeader)('Access-Control-Allow-Headers: Content-Type, Authorization');
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: all tests pass, including the new CORS tests (`CorsTest.php`
was already registered in `run-tests.php` since Phase 2, so no
registration change is needed here).

- [ ] **Step 5: Confirm Phase 2's own CORS behavior and call site are unaffected**

Run:

```bash
grep -n "new Cors(" server/entitlement.php
php -l server/entitlement.php
```

Expected: the existing single-argument `new Cors($config->allowedOrigins())`
call site, unmodified, still parses and (per the test suite) behaves
identically.

```bash
grep -c "=>" server/tests/CorsTest.php
```

Expected: `11` (Phase 2's original 5 plus this task's 6 new entries --
more than the 4 originally planned, since the corrected testing
approach needed extra coverage: a disallowed-origin case for
`applyHeaders()` itself, and a default-constructor smoke test) —
confirms no existing entry was accidentally removed while appending.

- [ ] **Step 6: Commit**

```bash
git add server/src/Cors.php server/tests/CorsTest.php
git commit -m "feat: add CORS preflight support for the new auth endpoints"
```

---

## Task 10: `MagicLinkUrlBuilder` (required correction 4) + `Mailer` interface + test-only `FakeMailer`

**New/relocated in this rev.** `MagicLinkUrlBuilder` is entirely new
(required correction 4 — "make fragment transport safe by
construction"). `Mailer` is unchanged in shape from the original plan
but `FakeMailer` moves from `server/src/Auth/` to `server/tests/Auth/`
(the Mailer-placement correction) since it is test-only code with no
reason to ship as part of the deployable `server/src/` tree.

**Files:**
- Create: `server/src/Auth/MagicLinkUrlBuilder.php`
- Create: `server/src/Auth/Mailer.php`
- Create: `server/tests/Auth/FakeMailer.php` (note: under `tests/`, not `src/`)
- Test: `server/tests/Auth/MagicLinkUrlBuilderTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Produces:
  - `KanaGame\Paddle\Auth\MagicLinkUrlBuilder::__construct(string $frontendBaseUrl)`
  - `build(string $rawToken): string` — returns
    `<frontendBaseUrl-with-exactly-one-trailing-slash>#/verify?token=<urlencoded-rawToken>`.
    The `#/verify` route segment is a **compile-time string literal
    inside this class**, never taken from config — a config value only
    ever supplies the origin/path prefix before the fragment delimiter,
    so a config mistake (missing/malformed `#/verify`) cannot cause the
    raw token to end up in the server-visible portion of the URL. This
    is what "safe by construction, not by config convention" means
    concretely: the fragment delimiter is written directly in this
    class's own source code, not read from any config key.
  - `KanaGame\Paddle\Auth\Mailer` (interface):
    `sendMagicLink(string $emailNormalized, string $magicLinkUrl): void`.
  - `KanaGame\Paddle\Auth\FakeMailer implements Mailer` (test-only,
    under `server/tests/Auth/`) — records every call in
    `public array $sent = []`.

- [ ] **Step 1: Write the failing test for `MagicLinkUrlBuilder`**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\MagicLinkUrlBuilder;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkUrlBuilder.php';

/**
 * @return array<string, callable(): void>
 */
function magicLinkUrlBuilderTests(): array
{
    return [
        'build() produces a URL containing the fragment verify route with the token' => function () {
            $builder = new MagicLinkUrlBuilder('https://yhalcyon-gh.github.io/kana-game/');
            $url = $builder->build('raw-token-value');

            assertTrue(str_contains($url, '#/verify?token=raw-token-value'), "expected fragment route with token, got: {$url}");
        },

        'build() places the raw token strictly AFTER the fragment delimiter' => function () {
            $builder = new MagicLinkUrlBuilder('https://yhalcyon-gh.github.io/kana-game/');
            $url = $builder->build('secret-abc-123');

            $fragmentPosition = strpos($url, '#');
            $tokenPosition = strpos($url, 'secret-abc-123');

            assertTrue($fragmentPosition !== false, 'the URL must contain a fragment delimiter');
            assertTrue($tokenPosition !== false, 'the URL must contain the token');
            assertTrue($tokenPosition > $fragmentPosition, 'the raw token must appear strictly after the # delimiter');
        },

        'build() never places the raw token in the server-visible portion of the URL (before #)' => function () {
            $builder = new MagicLinkUrlBuilder('https://yhalcyon-gh.github.io/kana-game/');
            $url = $builder->build('never-server-visible-token');

            $serverVisiblePortion = strtok($url, '#');
            assertFalse(
                str_contains($serverVisiblePortion, 'never-server-visible-token'),
                'the raw token must never appear in the portion of the URL a browser would send to a server',
            );
        },

        'build() URL-encodes the token' => function () {
            $builder = new MagicLinkUrlBuilder('https://yhalcyon-gh.github.io/kana-game/');
            $url = $builder->build('token/with+special=chars');

            assertTrue(str_contains($url, urlencode('token/with+special=chars')), 'the token must be urlencoded in the query portion after the fragment');
        },

        'build() normalizes a base URL missing a trailing slash' => function () {
            $builder = new MagicLinkUrlBuilder('https://yhalcyon-gh.github.io/kana-game');
            $url = $builder->build('tok');

            assertTrue(str_contains($url, '/kana-game/#/verify?token=tok'), "expected a single slash before the fragment, got: {$url}");
        },

        'build() does not duplicate a trailing slash already present in the base URL' => function () {
            $builder = new MagicLinkUrlBuilder('https://yhalcyon-gh.github.io/kana-game/');
            $url = $builder->build('tok');

            assertFalse(str_contains($url, '//#'), "must not produce a doubled slash before the fragment, got: {$url}");
        },
    ];
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php -r "require 'server/tests/TestCase.php'; require 'server/tests/Auth/MagicLinkUrlBuilderTest.php';"`
Expected: `Fatal error: ... 'MagicLinkUrlBuilder' not found`.

- [ ] **Step 3: Write minimal implementation**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Builds the Magic Link URL sent to a user. SAFE BY CONSTRUCTION: the
 * "#/verify" fragment route is a literal string in THIS FILE, never
 * read from config -- config only ever supplies the origin/path prefix
 * that comes BEFORE the fragment delimiter. This means a config mistake
 * (e.g. an operator omitting "#/verify" from a config value, or a typo
 * that turns "#/verify" into a literal "/verify" query path) CANNOT
 * cause the raw token to end up in the server-visible portion of the
 * URL -- the fragment delimiter is not something a config file gets to
 * decide. See docs/superpowers/specs/2026-09-08-paddle-auth-
 * entitlement-phase3-design.md, section 5, for why the token must live
 * in a URL fragment (never sent to any HTTP server by the browser).
 */
final class MagicLinkUrlBuilder
{
    private const FRAGMENT_ROUTE = '#/verify';

    private readonly string $baseUrl;

    public function __construct(string $frontendBaseUrl)
    {
        $this->baseUrl = rtrim($frontendBaseUrl, '/') . '/';
    }

    public function build(string $rawToken): string
    {
        return $this->baseUrl . self::FRAGMENT_ROUTE . '?token=' . urlencode($rawToken);
    }
}
```

- [ ] **Step 4: Register the test file in the runner**

```php
    __DIR__ . '/Auth/MagicLinkUrlBuilderTest.php' => 'KanaGame\\Paddle\\Tests\\magicLinkUrlBuilderTests',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: `86 passed, 0 failed`.

- [ ] **Step 6: Commit `MagicLinkUrlBuilder`**

```bash
git add server/src/Auth/MagicLinkUrlBuilder.php server/tests/Auth/MagicLinkUrlBuilderTest.php server/tests/run-tests.php
git commit -m "feat: add MagicLinkUrlBuilder (fragment-safe by construction)"
```

- [ ] **Step 7: Write the `Mailer` interface**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

/**
 * Sends a Magic Link email. NO production implementation exists in
 * this PR -- the only implementation anywhere in this codebase is
 * FakeMailer, under server/tests/Auth/ (test-only, not part of the
 * deployable server/src/ tree -- see that file's own doc comment for
 * why). A real SMTP/XServer-mail transport is future work requiring a
 * real credential (human checkpoint per the task brief, Section 21).
 * No production email is ever sent by this PR's code.
 */
interface Mailer
{
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void;
}
```

- [ ] **Step 8: Write the test-only `FakeMailer` UNDER `server/tests/Auth/`**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

require_once __DIR__ . '/../../src/Auth/Mailer.php';

/**
 * TEST-ONLY. Lives under server/tests/Auth/, not server/src/Auth/ --
 * it has no reason to be part of the production deployment (see
 * docs/paddle-auth-phase3a-pr-a.md's deployment-manifest notes). Its
 * in-memory state does NOT and CANNOT survive across separate HTTP
 * requests -- each PHP-FPM/CGI request is a fresh process with no
 * shared memory. FakeMailer is therefore only ever instantiated inside
 * same-process PHP unit tests (server/tests/Auth/MagicLinkAuthServiceTest.php)
 * -- never by any real entrypoint. request-link.php (Task 12) uses its
 * own inline no-op Mailer implementation, not this class, for exactly
 * that reason.
 *
 * Despite being namespaced KanaGame\Paddle\Auth (matching the interface
 * it implements), this file is intentionally NOT under server/src/ --
 * PHP namespaces don't have to match directory structure 1:1 in a
 * project with no autoloader (this repo has none; every file is
 * require_once'd explicitly), and keeping the namespace consistent with
 * Mailer's own namespace is clearer than inventing a separate
 * KanaGame\Paddle\Tests\Auth namespace solely for this one class. Note
 * (added during implementation): this file must `require_once` its own
 * `Mailer.php` since it implements that interface directly -- this repo
 * has no autoloader, so every direct dependency needs its own explicit
 * require regardless of namespace; omitting this line surfaced as a
 * "Interface not found" fatal error the first time
 * MagicLinkAuthServiceTest.php exercised this class.
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

- [ ] **Step 9: Confirm both files parse cleanly**

```bash
php -l server/src/Auth/Mailer.php
php -l server/tests/Auth/FakeMailer.php
```

Expected: `No syntax errors detected` for both.

- [ ] **Step 10: Commit**

```bash
git add server/src/Auth/Mailer.php server/tests/Auth/FakeMailer.php
git commit -m "feat: add Mailer interface and test-only FakeMailer (under tests/, not src/)"
```

---

## Task 11: `MagicLinkAuthService` — request-link/verify orchestration

**Substantially revised in this rev.**, replacing the original plan's
`AuthService`. Changes:

- Depends on `CurrentUserService` (Task 8) for session creation, instead
  of talking to `SessionRepository` directly — `verify()` composes
  `CurrentUserService::createSession()` rather than duplicating that
  logic.
- Uses `EmailValidator` (Task 7) — an invalid email now short-circuits
  before either rate-limit bucket is touched, but see the next point for
  the specific exception.
- **`requestLink()` now records against the IP bucket even for a
  malformed email** (required correction 2's "rate-limit the source IP
  for malformed email requests rather than returning before any IP
  limit is recorded"). The original plan's `requestLink()` returned
  immediately on a malformed email, before touching the rate limiter at
  all — meaning an attacker could send unlimited malformed-email
  requests from one IP with no rate-limit signal ever recorded against
  that IP. The corrected order is: normalize -> **always record against
  the IP bucket first** -> if the IP bucket itself is already exhausted,
  stop -> validate the email -> if invalid, stop (having already
  recorded the IP hit) -> record against the email bucket -> if
  exhausted, stop -> issue token + send mail.
- Uses `MagicLinkUrlBuilder` (Task 10) instead of raw string
  concatenation for the magic-link URL.
- `verify()` now calls `MagicLinkTokenRepository::bindUser()` (Task 4)
  inside the same transaction, after the user is resolved (required
  correction 7).
- Its concurrency tests are explicitly labeled "race-scenario test" per
  the terminology correction (required correction 8).

**Files:**
- Create: `server/src/Auth/MagicLinkAuthService.php`
- Test: `server/tests/Auth/MagicLinkAuthServiceTest.php`
- Modify: `server/tests/run-tests.php`

**Interfaces:**
- Consumes: `MagicLinkTokenRepository` (Task 4), `UserRepository`
  (Task 3), `RateLimiter` (Task 6), `Mailer` (Task 10),
  `EmailValidator` (Task 7), `MagicLinkUrlBuilder` (Task 10),
  `CurrentUserService` (Task 8).
- Produces:
  - `KanaGame\Paddle\Auth\MagicLinkAuthService::__construct(\PDO $pdo, MagicLinkTokenRepository $tokens, UserRepository $users, RateLimiter $rateLimiter, Mailer $mailer, MagicLinkUrlBuilder $urlBuilder, CurrentUserService $currentUser, int $tokenExpiryMinutes)`
    — note this constructor is now 8 arguments instead of the original
    plan's 9, and drops `SessionRepository`/base-URL-string/
    `sessionExpiryDays` entirely (those live in `CurrentUserService`
    now, constructed once and passed in).
  - `MagicLinkAuthResult` — value object, same shape as the original
    plan's `AuthResult` (`success`, `sessionToken`, `user`).
  - `requestLink(string $rawEmail, string $clientIp): void` — see the
    corrected ordering above. Never touches `UserRepository`.
  - `verify(string $rawToken): MagicLinkAuthResult` — one PDO
    transaction: `tokens->consume()` -> if false, rollback, return
    invalid; else `tokens->findEmailForRawToken()` ->
    `users->findOrCreateByEmail()` -> `tokens->bindUser($rawToken,
    $user['id'])` -> `currentUser->createSession($user['id'])` -> commit
    -> return success.

- [ ] **Step 1: Write the failing test**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Tests;

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\MagicLinkAuthService;
use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\MagicLinkUrlBuilder;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use PDO;

require_once __DIR__ . '/../TestCase.php';
require_once __DIR__ . '/../../src/Auth/CurrentUserService.php';
require_once __DIR__ . '/../../src/Auth/EmailNormalizer.php';
require_once __DIR__ . '/../../src/Auth/EmailValidator.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkAuthService.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkTokenRepository.php';
require_once __DIR__ . '/../../src/Auth/MagicLinkUrlBuilder.php';
require_once __DIR__ . '/../../src/Auth/RateLimiter.php';
require_once __DIR__ . '/../../src/Auth/SessionRepository.php';
require_once __DIR__ . '/../../src/Auth/UserRepository.php';
require_once __DIR__ . '/FakeMailer.php';
require_once __DIR__ . '/../../src/Uuid.php';

function makeMagicLinkAuthServiceTestDb(): PDO
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

/**
 * @return array{service: MagicLinkAuthService, mailer: \KanaGame\Paddle\Auth\FakeMailer, pdo: PDO}
 */
function makeMagicLinkAuthServiceHarness(?PDO $pdo = null, int $emailLimit = 5, int $ipLimit = 20): array
{
    $pdo ??= makeMagicLinkAuthServiceTestDb();
    $mailer = new \KanaGame\Paddle\Auth\FakeMailer();
    $currentUser = new CurrentUserService(new UserRepository($pdo), new SessionRepository($pdo), 24);
    $service = new MagicLinkAuthService(
        $pdo,
        new MagicLinkTokenRepository($pdo),
        new UserRepository($pdo),
        new RateLimiter($pdo, 'test-pepper', $emailLimit, $ipLimit),
        $mailer,
        new MagicLinkUrlBuilder('https://example.com/kana-game/'),
        $currentUser,
        15,
    );

    return ['service' => $service, 'mailer' => $mailer, 'pdo' => $pdo];
}

function extractTokenFromUrl(string $url): string
{
    $query = parse_url($url, PHP_URL_FRAGMENT);
    parse_str(substr((string) $query, strpos((string) $query, '?') + 1), $params);
    return $params['token'];
}

/**
 * @return array<string, callable(): void>
 */
function magicLinkAuthServiceTests(): array
{
    return [
        'requestLink() sends a magic link email for a valid request' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('User@Example.com', '203.0.113.1');

            assertSame(1, count($h['mailer']->sent), 'exactly one email should have been sent');
            assertSame('user@example.com', $h['mailer']->sent[0]['email'], 'the recorded email should be normalized');
        },

        'requestLink() does not create a users row' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('nouser@example.com', '203.0.113.1');

            $count = (int) $h['pdo']->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(0, $count, 'request-link must never create a durable user row');
        },

        'requestLink() with a malformed email sends no mail but STILL records against the IP bucket' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('not-an-email', '203.0.113.50');

            assertSame(0, count($h['mailer']->sent), 'a malformed email must never trigger a mailer call');

            $row = $h['pdo']->query("SELECT count FROM rate_limits WHERE bucket = 'magic_link_ip'")->fetch();
            assertTrue($row !== false, 'the IP bucket must have recorded this attempt even though the email was malformed');
            assertSame(1, (int) $row['count'], 'the IP bucket count should be 1 after one malformed-email attempt');
        },

        'requestLink() silently drops the email send when the per-email rate limit is exceeded' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            for ($i = 0; $i < 5; $i++) {
                $h['service']->requestLink('spammed@example.com', "203.0.113.{$i}");
            }
            $h['service']->requestLink('spammed@example.com', '203.0.113.99');

            assertSame(5, count($h['mailer']->sent), 'the 6th request in the window must not trigger a mailer call');
        },

        'requestLink() silently drops the email send when the per-IP rate limit is exceeded, even for a brand-new email' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            for ($i = 0; $i < 20; $i++) {
                $h['service']->requestLink("victim{$i}@example.com", '203.0.113.9');
            }
            $h['service']->requestLink('final-victim@example.com', '203.0.113.9');

            assertSame(20, count($h['mailer']->sent), 'the 21st request from this one IP must not trigger a mailer call, even for a never-before-seen email');
        },

        'verify() with a freshly issued token succeeds and creates a session' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('verify-me@example.com', '203.0.113.1');
            $rawToken = extractTokenFromUrl($h['mailer']->sent[0]['url']);

            $result = $h['service']->verify($rawToken);

            assertTrue($result->success, 'verification should succeed');
            assertTrue($result->sessionToken !== null, 'a session token should be returned');
            assertSame('verify-me@example.com', $result->user['email_normalized'], 'resolved user should match');
        },

        'verify() creates exactly one user on first-ever verification' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('firsttime@example.com', '203.0.113.1');
            $rawToken = extractTokenFromUrl($h['mailer']->sent[0]['url']);

            $h['service']->verify($rawToken);

            $count = (int) $h['pdo']->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(1, $count, 'exactly one user row should exist after first verification');
        },

        'verify() binds the consumed token to the resolved user (referential integrity)' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('bind-check@example.com', '203.0.113.1');
            $rawToken = extractTokenFromUrl($h['mailer']->sent[0]['url']);

            $result = $h['service']->verify($rawToken);

            $boundUserId = $h['pdo']->query(
                "SELECT user_id FROM magic_link_tokens WHERE email_normalized = 'bind-check@example.com'",
            )->fetchColumn();
            assertSame($result->user['id'], $boundUserId, 'the consumed token row must be bound to the resolved user');
        },

        'verify() with the same token twice succeeds once and fails the second time (single-use)' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('reuse@example.com', '203.0.113.1');
            $rawToken = extractTokenFromUrl($h['mailer']->sent[0]['url']);

            $first = $h['service']->verify($rawToken);
            $second = $h['service']->verify($rawToken);

            assertTrue($first->success, 'first verify should succeed');
            assertFalse($second->success, 'second verify of the same token must fail');
        },

        'verify() with an unknown token fails with the same generic result shape as an expired/used token' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $result = $h['service']->verify('never-issued-token');

            assertFalse($result->success, 'unknown token must fail');
            assertSame(null, $result->sessionToken, 'no session token should be returned on failure');
        },

        // -- Race-scenario tests (NOT true concurrent MariaDB execution
        // -- see this plan's Global Constraints). These run
        // sequentially against one SQLite connection and prove the
        // ATOMICITY/IDEMPOTENCY of the SQL patterns used, not real
        // simultaneous multi-connection behavior. See Task 14 for the
        // documented real-MariaDB pre-Live verification requirement.

        'race-scenario test: two concurrent verify() calls for the SAME token -- exactly one succeeds' => function () {
            $h = makeMagicLinkAuthServiceHarness();
            $h['service']->requestLink('race-same-token@example.com', '203.0.113.1');
            $rawToken = extractTokenFromUrl($h['mailer']->sent[0]['url']);

            $first = $h['service']->verify($rawToken);
            $second = $h['service']->verify($rawToken);

            $successCount = ($first->success ? 1 : 0) + ($second->success ? 1 : 0);
            assertSame(1, $successCount, 'exactly one of the two concurrent verifications must succeed');
        },

        'race-scenario test: two DISTINCT valid tokens for the SAME email -- both succeed, resolve to one user, no duplicate-key error' => function () {
            $h = makeMagicLinkAuthServiceHarness();

            $h['service']->requestLink('two-links@example.com', '203.0.113.1');
            $h['service']->requestLink('two-links@example.com', '203.0.113.2');
            $rawTokenA = extractTokenFromUrl($h['mailer']->sent[0]['url']);
            $rawTokenB = extractTokenFromUrl($h['mailer']->sent[1]['url']);

            $resultA = $h['service']->verify($rawTokenA);
            $resultB = $h['service']->verify($rawTokenB);

            assertTrue($resultA->success, 'verifying link A must succeed');
            assertTrue($resultB->success, 'verifying link B must succeed');
            assertSame(
                $resultA->user['id'],
                $resultB->user['id'],
                'both links for the same email must resolve to the same user id',
            );

            $userCount = (int) $h['pdo']->query('SELECT COUNT(*) FROM users')->fetchColumn();
            assertSame(1, $userCount, 'exactly one user row must exist -- no duplicate-key error, no duplicate user');
        },
    ];
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php -r "require 'server/tests/TestCase.php'; require 'server/tests/Auth/MagicLinkAuthServiceTest.php';"`
Expected: `Fatal error: ... 'MagicLinkAuthService' not found`.

- [ ] **Step 3: Write minimal implementation**

```php
<?php

declare(strict_types=1);

namespace KanaGame\Paddle\Auth;

use PDO;

/**
 * Value object returned by MagicLinkAuthService::verify(). success=false
 * never distinguishes WHY (unknown/expired/already-used token).
 */
final class MagicLinkAuthResult
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
 * Orchestrates the Magic Link request/verify flow. Depends on
 * CurrentUserService (not SessionRepository directly) to create the
 * session at the end of verify() -- composing, not duplicating,
 * session-creation logic. Has NO consumer outside request-link.php and
 * verify.php; me.php/logout.php/PR B's future purchase-intent.php use
 * CurrentUserService directly and never construct this class.
 */
final class MagicLinkAuthService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly MagicLinkTokenRepository $tokens,
        private readonly UserRepository $users,
        private readonly RateLimiter $rateLimiter,
        private readonly Mailer $mailer,
        private readonly MagicLinkUrlBuilder $urlBuilder,
        private readonly CurrentUserService $currentUser,
        private readonly int $tokenExpiryMinutes,
    ) {
    }

    /**
     * Always "succeeds" from the caller's perspective -- no exception,
     * no distinguishable return value for "already registered" vs.
     * "new" vs. "rate-limited" vs. "malformed."
     *
     * Ordering (required correction 2): the IP bucket is recorded FIRST,
     * before email validation -- a malformed email must not be a free
     * pass that skips IP-based throttling. Only after the IP bucket
     * allows this request do we validate/normalize-check the email and
     * then check the EMAIL bucket.
     */
    public function requestLink(string $rawEmail, string $clientIp): void
    {
        if (!$this->rateLimiter->checkAndRecordIp($clientIp)) {
            return;
        }

        $email = EmailNormalizer::normalize($rawEmail);
        if (!EmailValidator::isValid($email)) {
            return;
        }

        if (!$this->rateLimiter->checkAndRecordEmail($email)) {
            return;
        }

        $rawToken = $this->generateRawToken();
        $expiresAt = new \DateTimeImmutable("+{$this->tokenExpiryMinutes} minutes");
        $this->tokens->issue($email, $rawToken, $expiresAt);

        $magicLinkUrl = $this->urlBuilder->build($rawToken);
        $this->mailer->sendMagicLink($email, $magicLinkUrl);
    }

    public function verify(string $rawToken): MagicLinkAuthResult
    {
        $this->pdo->beginTransaction();

        try {
            if (!$this->tokens->consume($rawToken)) {
                $this->pdo->rollBack();
                return MagicLinkAuthResult::invalid();
            }

            $email = $this->tokens->findEmailForRawToken($rawToken);
            if ($email === null) {
                $this->pdo->rollBack();
                return MagicLinkAuthResult::invalid();
            }

            $user = $this->users->findOrCreateByEmail($email);
            $this->tokens->bindUser($rawToken, $user['id']);

            $rawSessionToken = $this->currentUser->createSession($user['id']);

            $this->pdo->commit();

            return MagicLinkAuthResult::success($rawSessionToken, $user);
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    private function generateRawToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }
}
```

- [ ] **Step 4: Register the test file in the runner**

```php
    __DIR__ . '/Auth/MagicLinkAuthServiceTest.php' => 'KanaGame\\Paddle\\Tests\\magicLinkAuthServiceTests',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php server/tests/run-tests.php`
Expected: `98 passed, 0 failed` (86 from Task 10, plus 12 new tests here).

- [ ] **Step 6: Commit**

```bash
git add server/src/Auth/MagicLinkAuthService.php server/tests/Auth/MagicLinkAuthServiceTest.php server/tests/run-tests.php
git commit -m "feat: add MagicLinkAuthService with IP-first rate limiting and token-user binding"
```

---

## Task 12: Config additions for the new auth settings

**Revised in this rev.**: `SESSION_EXPIRY_DAYS` -> `SESSION_EXPIRY_HOURS`
(default 24, not 30 days). `MAGIC_LINK_BASE_URL` ->
`MAGIC_LINK_FRONTEND_BASE_URL` (required correction 4 — this key now
holds only the frontend origin/path prefix, with the `#/verify` route
never appearing in config at all, only inside
`MagicLinkUrlBuilder`'s own source).

**Files:**
- Modify: `server/src/Config.php`
- Modify: `server/config.example.php`

**Interfaces:**
- Produces: `Config::get()`/`Config::require()` now recognize 6 new
  keys: `RATE_LIMIT_PEPPER`, `RATE_LIMIT_EMAIL_PER_HOUR` (default 5),
  `RATE_LIMIT_IP_PER_HOUR` (default 20),
  `MAGIC_LINK_TOKEN_EXPIRY_MINUTES` (default 15),
  `SESSION_EXPIRY_HOURS` (default 24), `MAGIC_LINK_FRONTEND_BASE_URL`.

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
            'SESSION_EXPIRY_HOURS',
            'MAGIC_LINK_FRONTEND_BASE_URL',
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
Expected: `98 passed, 0 failed` (unchanged from Task 11 — `Config` has
no dedicated test file, so this run just confirms nothing else broke).

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
    // only resets everyone's rate-limit window -- it does not invalidate
    // any stored identity, magic-link token, or session.
    'RATE_LIMIT_PEPPER' => '',

    // Optional -- defaults to 5/hour and 20/hour respectively if unset or
    // non-numeric (see Config::intWithDefault()).
    'RATE_LIMIT_EMAIL_PER_HOUR' => '',
    'RATE_LIMIT_IP_PER_HOUR' => '',

    // Optional -- defaults to 15 minutes (magic-link token) and 24 hours
    // (session) if unset or non-numeric. The 24-hour session default is
    // explicitly provisional for Phase 3A (in-memory-only browser
    // transport, no refresh/rotation system yet) -- see
    // docs/adr/0001-cross-site-auth-transport.md.
    'MAGIC_LINK_TOKEN_EXPIRY_MINUTES' => '',
    'SESSION_EXPIRY_HOURS' => '',

    // The frontend origin/path prefix a magic-link token is appended to
    // -- e.g. 'https://yhalcyon-gh.github.io/kana-game/'. Do NOT include
    // a "#/verify" route here: server/src/Auth/MagicLinkUrlBuilder.php
    // appends that fragment route and the urlencoded token itself, in
    // code, specifically so a config mistake here cannot turn the raw
    // token into a server-visible query parameter. See
    // docs/superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-
    // design.md, section 5.
    'MAGIC_LINK_FRONTEND_BASE_URL' => '',
```

- [ ] **Step 5: Verify the example config still parses**

Run: `php -l server/config.example.php`
Expected: `No syntax errors detected`.

- [ ] **Step 6: Commit**

```bash
git add server/src/Config.php server/config.example.php
git commit -m "feat: add auth config keys (SESSION_EXPIRY_HOURS, MAGIC_LINK_FRONTEND_BASE_URL)"
```

---

## Task 13: The four auth entrypoints (required corrections 1, 5, 6)

**Substantially revised in this rev.** All four entrypoints:

- call `Cors::applyPreflightHeaders()` on `OPTIONS` (required correction 1);
- **never log `$e->getMessage()`** — only a generic operational line
  naming the endpoint and the exception's class (required correction
  5), since a real DB/mailer exception message could itself contain a
  normalized email, a magic-link URL, or a raw token;
- `me.php`/`logout.php` construct only `CurrentUserService` — NOT
  `MagicLinkTokenRepository`, `RateLimiter`, or `Mailer` (required
  correction 3 — this is the concrete entrypoint-level payoff of Task
  8's split);
- `logout.php` returns a genuine `500` (not a silent `200`) when a real
  DB error prevents the revoke from happening (required correction 6) —
  it still returns `200` for the idempotent "no token / unknown token /
  already-revoked" cases, since those are not errors.

**Files:**
- Create: `server/auth/request-link.php`
- Create: `server/auth/verify.php`
- Create: `server/auth/me.php`
- Create: `server/auth/logout.php`

**Interfaces:**
- Consumes: `MagicLinkAuthService` (Task 11, request-link.php/verify.php
  only), `CurrentUserService` (Task 8, all four — request-link.php and
  verify.php need it transitively via `MagicLinkAuthService`'s own
  constructor; me.php/logout.php construct it directly and nothing
  else).

- [ ] **Step 1: Write `request-link.php`**

```php
<?php

declare(strict_types=1);

/**
 * Request a Magic Link sign-in email.
 *
 * POST /api/auth/request-link.php {"email": "user@example.com"}
 * -> 200 {"status": "ok"}  (ALWAYS this exact response)
 *
 * Enumeration-safe by construction: identical 200/{"status":"ok"}
 * response whether the email is malformed, already registered, brand
 * new, or currently rate-limited. See MagicLinkAuthService::
 * requestLink()'s own doc comment for the mechanism. Never creates a
 * users row.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/CurrentUserService.php';
require __DIR__ . '/../src/Auth/EmailNormalizer.php';
require __DIR__ . '/../src/Auth/EmailValidator.php';
require __DIR__ . '/../src/Auth/MagicLinkAuthService.php';
require __DIR__ . '/../src/Auth/MagicLinkTokenRepository.php';
require __DIR__ . '/../src/Auth/MagicLinkUrlBuilder.php';
require __DIR__ . '/../src/Auth/Mailer.php';
require __DIR__ . '/../src/Auth/RateLimiter.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\MagicLinkAuthService;
use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\MagicLinkUrlBuilder;
use KanaGame\Paddle\Auth\Mailer;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;

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

$body = json_decode(file_get_contents('php://input') ?: '', true);
$rawEmail = is_array($body) ? ($body['email'] ?? null) : null;

if (!is_string($rawEmail)) {
    echo json_encode(['status' => 'ok']);
    exit;
}

// server/src/Auth/RateLimiter.php's IP bucket deliberately reads ONLY
// REMOTE_ADDR -- X-Forwarded-For is never trusted absent an explicit
// trusted-proxy configuration (not present in this phase).
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';

// No real Mailer implementation exists in this PR -- see
// server/src/Auth/Mailer.php's doc comment. This inline no-op keeps
// "no real mailer exists yet" visible at the one call site that
// matters, and makes this endpoint fully deployable (if email-less)
// without a real SMTP credential.
$noopMailer = new class implements Mailer {
    public function sendMagicLink(string $emailNormalized, string $magicLinkUrl): void
    {
    }
};

try {
    $pdo = Db::connect($config);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
    );
    $service = new MagicLinkAuthService(
        $pdo,
        new MagicLinkTokenRepository($pdo),
        new UserRepository($pdo),
        new RateLimiter(
            $pdo,
            $config->require('RATE_LIMIT_PEPPER'),
            $config->intWithDefault('RATE_LIMIT_EMAIL_PER_HOUR', 5),
            $config->intWithDefault('RATE_LIMIT_IP_PER_HOUR', 20),
        ),
        $noopMailer,
        new MagicLinkUrlBuilder($config->require('MAGIC_LINK_FRONTEND_BASE_URL')),
        $currentUser,
        $config->intWithDefault('MAGIC_LINK_TOKEN_EXPIRY_MINUTES', 15),
    );
    $service->requestLink($rawEmail, $clientIp);
} catch (\Throwable $e) {
    // NEVER log $e->getMessage() here -- a DB/mailer exception could
    // itself contain a normalized email, a magic-link URL, or a raw
    // token. Log only the endpoint name and the exception's class.
    error_log('request-link.php: ' . get_class($e));
    // Still return the generic response -- an internal failure must
    // not be distinguishable from "email was fine, link was sent."
}

echo json_encode(['status' => 'ok']);
```

- [ ] **Step 2: Write `verify.php`**

```php
<?php

declare(strict_types=1);

/**
 * Consume a Magic Link token and issue a session.
 *
 * POST /api/auth/verify.php {"token": "<raw-token-from-the-URL-fragment>"}
 * -> 200 {"session_token": "<raw>", "user": {"user_id": "...", "email_normalized": "..."}}
 * -> 400 {"error": "invalid or expired token"}
 *
 * The token is read from the REQUEST BODY here, never a query string --
 * see docs/superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-
 * design.md, section 5. The frontend reads the raw token from the URL
 * fragment and strips it from history before POSTing it here.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/CurrentUserService.php';
require __DIR__ . '/../src/Auth/EmailNormalizer.php';
require __DIR__ . '/../src/Auth/EmailValidator.php';
require __DIR__ . '/../src/Auth/MagicLinkAuthService.php';
require __DIR__ . '/../src/Auth/MagicLinkTokenRepository.php';
require __DIR__ . '/../src/Auth/MagicLinkUrlBuilder.php';
require __DIR__ . '/../src/Auth/Mailer.php';
require __DIR__ . '/../src/Auth/RateLimiter.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\MagicLinkAuthService;
use KanaGame\Paddle\Auth\MagicLinkTokenRepository;
use KanaGame\Paddle\Auth\MagicLinkUrlBuilder;
use KanaGame\Paddle\Auth\Mailer;
use KanaGame\Paddle\Auth\RateLimiter;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;

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
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
    );
    $service = new MagicLinkAuthService(
        $pdo,
        new MagicLinkTokenRepository($pdo),
        new UserRepository($pdo),
        new RateLimiter(
            $pdo,
            $config->require('RATE_LIMIT_PEPPER'),
            $config->intWithDefault('RATE_LIMIT_EMAIL_PER_HOUR', 5),
            $config->intWithDefault('RATE_LIMIT_IP_PER_HOUR', 20),
        ),
        $noopMailer,
        new MagicLinkUrlBuilder($config->require('MAGIC_LINK_FRONTEND_BASE_URL')),
        $currentUser,
        $config->intWithDefault('MAGIC_LINK_TOKEN_EXPIRY_MINUTES', 15),
    );
    $result = $service->verify($rawToken);
} catch (\Throwable $e) {
    error_log('verify.php: ' . get_class($e));
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

- [ ] **Step 3: Write `me.php`** (constructs `CurrentUserService` ONLY —
  no `RateLimiter`, no `Mailer`, no `MagicLinkTokenRepository`)

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
 *
 * Depends ONLY on CurrentUserService -- no Magic Link/rate-limit/mail
 * infrastructure is constructed here, since none of it is needed to
 * resolve a session (required correction 3).
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/CurrentUserService.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;

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

$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!str_starts_with($authHeader, 'Bearer ')) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}
$rawSessionToken = substr($authHeader, strlen('Bearer '));

try {
    $pdo = Db::connect($config);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
    );
    $me = $currentUser->resolve($rawSessionToken);
} catch (\Throwable $e) {
    error_log('me.php: ' . get_class($e));
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

- [ ] **Step 4: Write `logout.php`** (also `CurrentUserService`-only;
  returns 500 on a genuine failure rather than a silent 200 —
  required correction 6)

```php
<?php

declare(strict_types=1);

/**
 * Revoke the current session.
 *
 * POST /api/auth/logout.php
 * Header: Authorization: Bearer <raw-session-token>
 * -> 200 {"status": "ok"}  -- for a MISSING token, an UNKNOWN token, or
 *    an ALREADY-REVOKED token: these are idempotent no-ops by design
 *    (SessionRepository::revoke()'s own contract), not errors.
 * -> 500 {"error": "temporary server error"} -- ONLY if an actual
 *    DB/server exception prevents the revoke attempt from completing.
 *    Required correction 6: a genuine failure to revoke must never be
 *    reported as 200, since that would let a caller believe a session
 *    was revoked when the server never actually attempted (or failed)
 *    the revoke.
 */

require __DIR__ . '/../src/Config.php';
require __DIR__ . '/../src/Db.php';
require __DIR__ . '/../src/Cors.php';
require __DIR__ . '/../src/Auth/CurrentUserService.php';
require __DIR__ . '/../src/Auth/SessionRepository.php';
require __DIR__ . '/../src/Auth/UserRepository.php';
require __DIR__ . '/../src/Uuid.php';

use KanaGame\Paddle\Auth\CurrentUserService;
use KanaGame\Paddle\Auth\SessionRepository;
use KanaGame\Paddle\Auth\UserRepository;
use KanaGame\Paddle\Config;
use KanaGame\Paddle\Cors;
use KanaGame\Paddle\Db;

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

$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$rawSessionToken = str_starts_with($authHeader, 'Bearer ')
    ? substr($authHeader, strlen('Bearer '))
    : null;

if ($rawSessionToken === null) {
    // No token supplied at all -- nothing to revoke, not an error.
    echo json_encode(['status' => 'ok']);
    exit;
}

try {
    $pdo = Db::connect($config);
    $currentUser = new CurrentUserService(
        new UserRepository($pdo),
        new SessionRepository($pdo),
        $config->intWithDefault('SESSION_EXPIRY_HOURS', 24),
    );
    // SessionRepository::revoke() is itself a safe no-op for an
    // unknown/already-revoked token (see its own doc comment) -- if
    // this call returns normally, the revoke attempt (or no-op) is
    // considered genuinely complete, whether or not a matching row
    // existed. Only a THROWN exception here (a real DB failure)
    // reaches the catch block below and produces a 500.
    $currentUser->logout($rawSessionToken);
} catch (\Throwable $e) {
    error_log('logout.php: ' . get_class($e));
    http_response_code(500);
    echo json_encode(['error' => 'temporary server error']);
    exit;
}

echo json_encode(['status' => 'ok']);
```

- [ ] **Step 5: Verify all four files parse**

```bash
php -l server/auth/request-link.php
php -l server/auth/verify.php
php -l server/auth/me.php
php -l server/auth/logout.php
```

Expected: `No syntax errors detected` for all four.

- [ ] **Step 6: Grep self-check — no raw token/email/exception-message ever logged**

```bash
grep -n "error_log" server/auth/*.php
```

Expected: four lines, each of the exact shape
`error_log('<endpoint>.php: ' . get_class($e));` — manually confirm
**none** references `$e->getMessage()`, `$rawToken`, `$rawEmail`,
`$rawSessionToken`, or `$result->sessionToken`.

- [ ] **Step 7: Grep self-check — `me.php`/`logout.php` do not construct rate-limit/mail infrastructure**

```bash
grep -l "RateLimiter\|MagicLinkAuthService\|Mailer" server/auth/me.php server/auth/logout.php
```

Expected: no output (neither file matches) — confirms required
correction 3's separation actually holds at the entrypoint level, not
just in the service layer.

- [ ] **Step 8: Commit**

```bash
git add server/auth/request-link.php server/auth/verify.php server/auth/me.php server/auth/logout.php
git commit -m "feat: add auth entrypoints with preflight CORS, safe logging, and session-only me/logout"
```

---

## Task 14: Frontend `SessionTransport` interface (in-memory only)

**Unchanged from the original plan (approved as-is).**

**Files:**
- Create: `src/lib/auth/sessionTransport.ts`
- Test: `src/lib/auth/sessionTransport.test.ts`

**Interfaces:**
- Produces:
  - `interface SessionTransport { getToken(): string | null; setToken(token: string): void; clear(): void }`
  - `export const inMemorySessionTransport: SessionTransport` — a
    singleton backed by a module-scoped variable. Never
    `localStorage`/`sessionStorage`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/auth/sessionTransport.test.ts`
Expected: fails — cannot find module './sessionTransport'.

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * Session token storage for the auth foundation (Phase 3A). The
 * PRODUCTION browser transport decision is deferred -- see
 * docs/adr/0001-cross-site-auth-transport.md. This interface exists so
 * that decision, whenever it's made, can be implemented as a new
 * SessionTransport without touching any auth/purchase call site.
 *
 * The ONLY implementation built in this phase is in-memory -- cleared
 * on page reload, never localStorage/sessionStorage. It exists purely
 * so PR C's dev-only /account-test harness can hold a bearer token
 * across calls within a single page session while exercising the
 * backend auth flow end-to-end.
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

## Task 15: Cross-site auth transport ADR

**Revised in this rev.**: notes the 24-hour provisional session expiry
and its reconsideration requirement.

**Files:**
- Create: `docs/adr/0001-cross-site-auth-transport.md`

No test — documentation-only deliverable.

- [ ] **Step 1: Write the ADR**

```markdown
# ADR 0001: Cross-site auth transport for Tamamizu's frontend/API split

**Status:** Decision deferred (human checkpoint). This ADR frames the
options; it does not choose one.

## Context

Tamamizu's frontend is deployed to GitHub Pages and its API (Phase 2's
Paddle webhook/entitlement endpoints, and Phase 3A's new auth
endpoints) is deployed to Xserver. These are different origins -- a
genuinely cross-site setup.

A Phase 3A session token is a real account authentication credential,
not merely a flag saying "entitlement active/inactive." A valid session
can read the account's own email (GET /api/auth/me.php) and, in PR B,
authorize creation of a new Paddle purchase intent bound to that
account. Theft of this token via XSS is account takeover for a
low-PII account, not merely "someone finds out an entitlement flag."

Relevant platform constraints: SameSite cookie restrictions, Safari/iOS
Intelligent Tracking Prevention, PWA storage partitioning, and Chrome's
ongoing third-party cookie changes.

## Options considered

### Option A -- Bearer token, browser-held

No cookies. Works identically across Safari/iOS/Chrome/PWA, since none
of the cross-site cookie restrictions apply to a bearer header. Open
sub-question: where a production bearer token should live across
reloads (in-memory with a refresh-token dance, or an XSS-hardened
storage strategy) is separate from "bearer vs. cookie" and is also not
decided here.

### Option B -- `SameSite=None; Secure` cookie

Familiar browser-managed model, `HttpOnly` would make it XSS-immune,
but is exactly the pattern most exposed to Safari ITP and the general
industry direction against third-party cookies for a cross-site
PWA-capable app.

### Option C -- Migrate the frontend to a same-site (sub)domain

Eliminates the cross-site problem entirely, but is a hosting/deployment
decision, not an auth-code decision, and is out of this phase's scope
and budget.

## Recommendation (non-binding)

Option A is the more robust choice for reliability across
Safari/iOS/PWA specifically. This does not by itself answer where a
production bearer token should be held across reloads.

## What is NOT decided here

This ADR does not select a production transport. Phase 3A PR A builds
only the backend session model (hash-at-rest tokens, revocable,
explicit expiry -- transport-agnostic) and `SessionTransport`, a
frontend interface with exactly one implementation
(`InMemorySessionTransport`), used only by PR C's dev-only test
harness.

## Provisional session expiry: 24 hours

PR A's `SESSION_EXPIRY_HOURS` defaults to 24 hours, down from an
earlier 30-day draft. This value is explicitly provisional: the current
transport is in-memory-only and already loses the session on every page
reload, so a long server-side session buys no UX benefit today, while
there is no refresh/rotation system yet to bound the risk of a
longer-lived bearer credential. **This value must be reconsidered once
a production browser transport is chosen** -- a persistent transport
(Option A with durable storage, or Option B/C) will need its own
explicit session-lifetime decision, informed by that transport's actual
theft/exposure risk profile, not simply inherited from this provisional
default.

## Consequences of deferring

PR C's `/account-test` harness holds its bearer token in memory only,
meaning the harness "logs out" on every page reload. No production
login flow exists yet; this ADR's resolution is a prerequisite for
building one.
```

- [ ] **Step 2: Confirm the file renders as valid Markdown**

```bash
grep -c '```' docs/adr/0001-cross-site-auth-transport.md
```

Expected: an even number.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0001-cross-site-auth-transport.md
git commit -m "docs: add ADR for cross-site auth transport (decision deferred)"
```

---

## Task 16: PR A-specific documentation, including the real-MariaDB pre-Live requirement (required correction 8)

**Revised in this rev.**: adds an explicit "Known remaining
verification" section documenting the real-MariaDB concurrency checks
that must happen before Live rollout, since this PR's own tests are
race-scenario/atomicity semantic tests against SQLite, not true
concurrent MariaDB execution.

**Files:**
- Create: `docs/paddle-auth-phase3a-pr-a.md`
- Modify: `docs/README.md` (add an index entry, matching its existing format)

- [ ] **Step 1: Read `docs/README.md`'s current structure**

```bash
cat docs/README.md
```

- [ ] **Step 2: Write `docs/paddle-auth-phase3a-pr-a.md`**

```markdown
# Phase 3A PR A -- real-user identity + Magic Link auth foundation

Implements the users/magic_link_tokens/sessions/rate_limits portion of
docs/superpowers/specs/2026-09-08-paddle-auth-entitlement-phase3-design.md
(rev. 3). Builds on Phase 2 (docs/paddle-webhook-poc.md) without
altering its payment_events/entitlements tables or sandbox-test-user
PoC path in any way.

## Scope

In this PR: users, Magic Link request/verify, sessions, DB-backed
HMAC-keyed concurrency-safe rate limiting, CORS preflight support, the
cross-site auth transport ADR.

Explicitly NOT in this PR: purchase_intents, transaction_grants,
pending_adjustments, any Paddle webhook/purchase-attribution changes,
the /account-test frontend harness, real SMTP, XServer deployment,
production session transport, curriculum locking.

## New endpoints

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| /api/auth/request-link.php | POST | none | Request a Magic Link email. Always 200 {"status":"ok"}. |
| /api/auth/verify.php | POST | none (token in body) | Consume a token, create/resolve the user, issue a session. |
| /api/auth/me.php | GET | Authorization: Bearer | Resolve the current user. Depends only on CurrentUserService. |
| /api/auth/logout.php | POST | Authorization: Bearer | Revoke the current session. 500 on genuine failure, not a silent 200. |

## New tables

See server/sql/migrations/0001_users_auth_foundation.sql: users,
magic_link_tokens, sessions, rate_limits. Additive only -- no existing
table is altered. magic_link_tokens.user_id and sessions.user_id carry
real FOREIGN KEY constraints to users.id.

## New config keys

RATE_LIMIT_PEPPER (required), RATE_LIMIT_EMAIL_PER_HOUR (default 5),
RATE_LIMIT_IP_PER_HOUR (default 20), MAGIC_LINK_TOKEN_EXPIRY_MINUTES
(default 15), SESSION_EXPIRY_HOURS (default 24, explicitly provisional
-- see the ADR), MAGIC_LINK_FRONTEND_BASE_URL (required -- frontend
origin/path prefix only, never a "#/verify" route; the fragment route
is built in code by MagicLinkUrlBuilder, not read from config).

## Magic-link token transport

Fragment-based: `.../#/verify?token=...`, never sent to any HTTP
server by the browser, then POSTed in a request body to verify.php.
`MagicLinkUrlBuilder` guarantees this by construction -- the fragment
route is a literal in that class's source, not a config value.

## Mailer

server/src/Auth/Mailer.php is an interface. Its only implementation
anywhere in this codebase is FakeMailer, under server/tests/Auth/
(test-only -- not part of the production deployment). No real email is
sent by any code in this PR; the four entrypoints use an inline
anonymous no-op Mailer where one is structurally required.

## CORS / preflight

server/src/Cors.php gained applyPreflightHeaders() (additive -- the
existing applyHeaders() used by Phase 2's entitlement.php is
unchanged). Preflight responses for an allowed origin include
Access-Control-Allow-Methods (GET, POST, OPTIONS) and
Access-Control-Allow-Headers (Content-Type, Authorization). No
Access-Control-Allow-Credentials is ever emitted -- a production cookie
transport remains deferred.

## Rate limiting

Atomic MariaDB upsert-based counting (INSERT ... ON DUPLICATE KEY
UPDATE plus a SELECT ... FOR UPDATE re-read inside one transaction),
replacing an earlier SELECT-then-UPDATE draft that could let concurrent
requests both read a stale count and both exceed the limit. Both the
email and IP buckets are HMAC-keyed; raw values are never persisted.
The IP bucket is recorded even for a malformed email request.

## Deployment status

Not deployed. This PR contains code, migrations, and tests only. No
XServer deployment, no schema execution against the real
giganihongo_tmzp database, and no Paddle Sandbox interaction happen in
this PR.

## Known remaining verification: real-MariaDB concurrency (required before Live)

This PR's concurrency tests (see
server/tests/Auth/MagicLinkAuthServiceTest.php and
server/tests/Auth/RateLimiterTest.php) are **race-scenario tests /
atomicity-idempotency semantic tests** -- they run sequentially against
a single in-process SQLite connection and prove that the SQL patterns
used (atomic conditional UPDATE, atomic upsert) cannot be won twice or
double-inserted under repeated/simulated-sequential invocation. They do
**not** prove true simultaneous multi-connection MariaDB execution.

Before any Live Paddle rollout, a human must additionally verify, against
a real deployed MariaDB instance (not covered by this PR):

1. **Simultaneous consume of one magic-link token** from two real,
   concurrent HTTP requests (e.g. two curl processes launched at once)
   -- expected: exactly one succeeds and creates exactly one session;
   the other receives the generic invalid/expired/used response.
2. **Simultaneous verification of two different valid links for one
   email** from two real, concurrent HTTP requests -- expected: one
   user row, two valid sessions, no HTTP 500 from either request.

Neither check is performed in PR A. This is an explicit, documented gap
-- not silently assumed to be covered by the SQLite-backed unit tests
above.

## Tests

Run `php server/tests/run-tests.php` -- all Phase 2 tests (32) plus
this PR's new tests must pass together.
```

- [ ] **Step 3: Add the index entry to `docs/README.md`**

(Match the file's real current structure, as read in Step 1 — add one
line in whatever list format it already uses for related docs.)

- [ ] **Step 4: Commit**

```bash
git add docs/paddle-auth-phase3a-pr-a.md docs/README.md
git commit -m "docs: add PR A documentation, including the real-MariaDB pre-Live verification gap"
```

---

## Task 17: Full verification pass

**Revised in this rev.**: the secret/logging self-review now also
checks for `getMessage()` in the auth entrypoints specifically (required
correction 5), and adds a check that `me.php`/`logout.php` never
reference `RateLimiter`/`MagicLinkAuthService`/`Mailer` (required
correction 3).

**Files:** none new — this task runs verification across everything
Tasks 1–16 added.

- [ ] **Step 1: Run the full PHP test suite**

```bash
php server/tests/run-tests.php
```

Expected: every test passes. Record the exact final count in the PR
description — count what actually runs rather than trusting any number
written in this plan, since manual arithmetic across 17 tasks is
error-prone.

- [ ] **Step 2: Run the frontend test suite and full verify**

```bash
npm run verify
```

Expected: clean pass (test + lint + build + `git diff --check`).

- [ ] **Step 3: Explicit `git diff --check`**

```bash
git diff --check origin/codex/paddle-webhook-entitlement-poc..HEAD
```

Expected: no output.

- [ ] **Step 4: Secret/logging self-review**

```bash
grep -rn "getMessage()" server/auth/ server/src/Auth/
```

Expected: **no output** — required correction 5 explicitly disallows
`$e->getMessage()` anywhere in the auth entrypoints or Auth classes
(the only exception in the whole codebase remains Phase 2's existing
`entitlement.php`/`paddle-webhook.php`, which this task does not touch
and which are out of scope for this grep).

```bash
grep -n "error_log" server/auth/*.php
```

Expected: exactly four lines, one per entrypoint, each of the shape
`error_log('<name>.php: ' . get_class($e));` — confirm by eye that none
interpolates a token/email/session value.

```bash
grep -l "RateLimiter\|MagicLinkAuthService\|Mailer" server/auth/me.php server/auth/logout.php
```

Expected: no output (required correction 3's separation holds).

```bash
grep -rn "RATE_LIMIT_PEPPER\s*=>\s*'[^']" server/config.example.php
```

Expected: no match (the example config's value stays an empty string).

```bash
git log --all -p -- server/config.php
```

Expected: no output — `server/config.php` (the real, gitignored config)
was never committed.

```bash
grep -rn "localStorage\|sessionStorage" src/lib/auth/
```

Expected: no output in `sessionTransport.ts` itself (only appears in
the corresponding `.test.ts` file, where it's the thing being asserted
*against*, not used).

- [ ] **Step 5: Confirm Phase 2 behavior is untouched**

```bash
git diff origin/codex/paddle-webhook-entitlement-poc..HEAD -- server/sql/schema.sql server/src/SandboxUser.php server/entitlement.php server/paddle-webhook.php
```

Expected: no output — none of Phase 2's core files were modified by
this plan (`server/src/Cors.php`, `server/src/Config.php`, and
`server/config.example.php` were modified, and only additively).

- [ ] **Step 6: Confirm production build contains no test-only material**

```bash
npm run build
grep -rl "FakeMailer\|super-secret\|test-pepper" dist/ 2>/dev/null || echo "clean"
```

Expected: `clean` (or no matches) — `server/tests/` is never part of
the frontend build in the first place (it's PHP, not bundled by Vite),
but this is a defensive check against any accidental frontend reference
to test-only naming.

- [ ] **Step 7: Final commit if any verification step required a fix**

If Steps 1–6 all passed cleanly, there is nothing to commit here. If
any step required a fix, commit it with a message describing exactly
what verification step caught it.

---

## Self-review notes (writing-plans skill requirement)

**Spec coverage check** — every PR A-scoped item from the design spec
(rev. 3) and from ChatGPT's two rounds of review maps to a task:

- `users`, `magic_link_tokens`, `sessions`, `rate_limits`, additive
  migration, FK references → Task 2.
- Auth repositories → Tasks 3, 4, 5, 6.
- `EmailNormalizer`/`EmailValidator` → Task 7.
- `CurrentUserService` (session-only, PR-B-reusable) → Task 8.
- CORS preflight → Task 9.
- `MagicLinkUrlBuilder`, `Mailer` interface, test-only `FakeMailer` →
  Task 10.
- `MagicLinkAuthService` (IP-first rate limiting, token-user binding) →
  Task 11.
- Config (`SESSION_EXPIRY_HOURS`, `MAGIC_LINK_FRONTEND_BASE_URL`) →
  Task 12.
- `request-link.php`/`verify.php`/`me.php`/`logout.php` (preflight, safe
  logging, session-only me/logout, logout 500-on-failure) → Task 13.
- `SessionTransport` → Task 14.
- ADR (with provisional-expiry note) → Task 15.
- Docs, including the real-MariaDB pre-Live verification gap → Task 16.
- Full verification, including the corrected security grep → Task 17.
- All 8 required corrections from ChatGPT's second review are each
  addressed in a specifically-named task (cited by "required correction
  N" throughout) — CORS/preflight (1, Task 9), atomic rate limiting (2,
  Task 6) plus IP-first ordering and email validation (2, Task 7/11),
  `CurrentUserService` split (3, Task 8), fragment-safe URL construction
  (4, Task 10), safe logging (5, Task 13), logout failure semantics (6,
  Task 13), schema FK + `bindUser()` (7, Tasks 2/4/11), and
  race-scenario terminology plus the documented real-MariaDB
  requirement (8, Global Constraints + Tasks 6/11/16).
- The three smaller corrections (endpoint layout kept as-is, session
  expiry to 24 hours, `Mailer`/`FakeMailer` placement, `hash_equals()`
  consistency) are folded into Tasks 5, 10, and 4/5 respectively.
- No PR B/C implementation — confirmed no task creates
  `purchase_intents`, `transaction_grants`, `pending_adjustments`,
  webhook/refund code, or the `/account-test` route; `CurrentUserService`
  (Task 8) is the one deliberate extension point PR B will reuse, built
  no further than PR A itself needs (`me.php`/`logout.php` are its only
  consumers in this plan).

**Placeholder scan** — no "TBD"/"TODO"/"implement later" phrases appear
in any task; every code step has a complete, runnable code block; every
test has concrete assertions.

**Type consistency check** — `MagicLinkAuthService`'s constructor
(8 arguments: `PDO`, `MagicLinkTokenRepository`, `UserRepository`,
`RateLimiter`, `Mailer`, `MagicLinkUrlBuilder`, `CurrentUserService`,
`int $tokenExpiryMinutes`) is defined once (Task 11) and instantiated
identically in both `request-link.php` and `verify.php` (Task 13).
`CurrentUserService`'s constructor (`UserRepository`, `SessionRepository`,
`int $sessionExpiryHours`) is defined once (Task 8) and instantiated
identically in all four entrypoints (Task 13) — `me.php`/`logout.php`
construct nothing else. `MagicLinkTokenRepository::consume(): bool`
(Task 4) is the exact method `MagicLinkAuthService::verify()` (Task 11)
calls; `bindUser(string, string): void` (Task 4) is called with
`($rawToken, $user['id'])` exactly matching `UserRepository::
findOrCreateByEmail()`'s return shape (Task 3). `CurrentUserService::
resolve(): ?array{user_id: string, email_normalized: string}` (Task 8)
is exactly what `me.php` (Task 13) echoes verbatim as its JSON response.
`Cors::applyPreflightHeaders(?string): void` (Task 9) is called with
`$_SERVER['HTTP_ORIGIN'] ?? null` identically in all four entrypoints
(Task 13), matching `applyHeaders()`'s existing call convention.

---

## Verification commands (summary)

- `php server/tests/run-tests.php` — all PHP tests pass.
- `npm run verify` — full frontend verification (test + lint + build +
  `git diff --check`).
- `git diff --check` — explicit check against the PR's base branch.
- Manual secret/logging self-review — Task 17, Step 4 (now includes the
  `getMessage()` ban and the `me.php`/`logout.php` dependency-isolation
  check).
- Phase 2 non-regression check — Task 17, Step 5.
- Production-build test-material check — Task 17, Step 6.

**Not run in this PR**: any live MariaDB execution of the new
migration, any real HTTP request against a deployed entrypoint, any
real email send, and — per required correction 8 — no true concurrent
multi-connection MariaDB verification of the atomic patterns used here.
Task 16 documents the exact real-MariaDB checks a human must run before
Live rollout.

## Revision summary (rev. 2 of this plan)

Applied against ChatGPT's review of the original plan (approved at
`08ae596f6796bd4a95ef2612625c56531c5c0751`):

1. **Endpoint layout** — kept as originally proposed (`server/auth/`
   subdirectory), per explicit approval. No change.
2. **Session expiry** — changed from a 30-day default to
   `SESSION_EXPIRY_HOURS` defaulting to 24 hours (Task 5, Task 12, ADR).
3. **CORS/preflight (required correction 1)** — `Cors::
   applyPreflightHeaders()` added, additive to the existing
   `applyHeaders()`; all four entrypoints call it on `OPTIONS` (Task 9,
   Task 13).
4. **Concurrency-safe `RateLimiter` (required correction 2)** — rewritten
   from SELECT-then-UPDATE to an atomic `INSERT ... ON DUPLICATE KEY
   UPDATE` plus `SELECT ... FOR UPDATE` inside one transaction; IP
   bucket now recorded even for a malformed email; `EmailValidator`
   added for syntax/length checking (Task 6, Task 7, Task 11).
5. **`CurrentUserService` split (required correction 3)** — new class
   depending only on `UserRepository`/`SessionRepository`;
   `me.php`/`logout.php` construct nothing else (Task 8, Task 13).
6. **Fragment-safe `MagicLinkUrlBuilder` (required correction 4)** — the
   `#/verify` route is a literal in code, never read from config; config
   key renamed `MAGIC_LINK_FRONTEND_BASE_URL` to make this explicit
   (Task 10, Task 12).
7. **Safe logging (required correction 5)** — all four entrypoints log
   only `get_class($e)`, never `$e->getMessage()` (Task 13).
8. **Logout failure semantics (required correction 6)** — `logout.php`
   returns 500 on a genuine thrown exception, 200 only for the
   idempotent no-token/unknown-token/already-revoked cases (Task 13).
9. **Schema/referential integrity (required correction 7)** — added
   `FOREIGN KEY` constraints on `magic_link_tokens.user_id` and
   `sessions.user_id`; `MagicLinkTokenRepository::bindUser()` added and
   wired into `MagicLinkAuthService::verify()`'s transaction (Task 2,
   Task 4, Task 11).
10. **Race-scenario terminology + documented real-MariaDB requirement
    (required correction 8)** — every concurrency test explicitly
    labeled "race-scenario test"/"atomicity-idempotency semantic test";
    a "Known remaining verification" section added to the PR docs
    listing the exact real-MariaDB checks still required before Live
    rollout (Global Constraints, Task 6, Task 11, Task 16).
11. **`Mailer` placement** — `FakeMailer` moved from `server/src/Auth/`
    to `server/tests/Auth/`; only the `Mailer` interface remains under
    `server/src/Auth/` (Task 10).
12. **`hash_equals()` consistency** — `MagicLinkTokenRepository::
    findEmailForRawToken()` and `SessionRepository::
    findActiveUserIdForRawToken()` both perform an explicit
    `hash_equals()` comparison against the fetched hash before trusting
    the row (Task 4, Task 5).
