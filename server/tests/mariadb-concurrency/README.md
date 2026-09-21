# Real MariaDB concurrency verification harness

**This directory is intentionally separate from `server/tests/` (the SQLite-backed
suite driven by `server/tests/run-tests.php`).** It is NOT wired into
`run-tests.php` and does not run as part of `php server/tests/run-tests.php`.

## Why this exists

`server/tests/run-tests.php`'s Auth and Purchase tests run every statement
sequentially against a single in-process SQLite connection. Several of them are
explicitly labeled "race-scenario test" and carry a comment (see
`MagicLinkAuthServiceTest.php`, `PurchaseWebhookHandlerTest.php`) stating they
prove the *atomicity/idempotency of the SQL patterns used*, not true
simultaneous multi-connection behavior. `docs/paddle-auth-phase3a-pr-a.md` and
`docs/paddle-auth-phase3a-pr-b.md` both carry a "Known remaining verification:
real-MariaDB concurrency (required before Live)" section describing exactly
this gap.

This harness closes that gap by running genuinely concurrent PHP **processes**
(never threads inside one PHP process, never sequential calls on one shared PDO)
against a real, disposable MariaDB instance — provisioned only as a GitHub
Actions service container, torn down at the end of the job, seeded with
test-only credentials generated in the workflow itself. It is never pointed at
Production, never uses Production credentials, and never touches Production in
any way.

## Harness boundary

This directory is **diagnostic verification infrastructure**. Feature/security
PRs may change runtime code and extend these scenarios, but the harness itself
only exercises disposable CI databases and reports invariant violations. It
never performs a Production migration, Production DB write, deployment, or
Paddle mutation.

## Layout

- `bootstrap.php` — requires the real `server/src/` classes needed by every
  scenario (via the existing, unmodified `Config`/`Db` classes, fed
  ephemeral CI-only credentials — never a real `server/config.php`), plus the
  existing SQLite-backed test files under `server/tests/Auth/` and
  `server/tests/Purchase/` purely to **reuse** their already-reviewed helper
  functions (`makeMagicLinkAuthServiceHarness`'s dependency wiring pattern,
  `makePurchaseWebhookHandler()`, `pwhSign()`, `pwhTransactionCompletedPayload()`,
  `pwhAdjustmentPayload()`) and `TestCase.php`'s assertion helpers rather than
  duplicating that wiring inside the harness.
- `Barrier.php` — a file-based ready/go barrier. Every worker process signals
  "ready" by creating a file, then polls (short `usleep` loop, not a single
  blind `sleep`) for a `go` file the orchestrator creates only once every
  worker has signaled ready. This is what makes each worker's racy operation
  actually start at (as close as this mechanism can guarantee) the same
  moment, rather than relying on guessed sleep offsets.
- `scenarios.php` — one function per worker operation used by scenarios A, B,
  C1–C4, D, E, F, G, H1, H2, and H3, each run inside a worker process against
  that worker's own dedicated `PDO` connection. D: same OTP challenge/code raced across 3 workers — exactly
  one verifyCode() succeeds. E: a user at the 3-persistent-session cap, two
  concurrent 4th-login verifyCode() calls with distinct challenges — both
  succeed, the LRU row is evicted, and the active count never exceeds the
  cap. F: 8 concurrent WRONG-code guesses raced against one challenge with
  LOGIN_CODE_MAX_ATTEMPTS=5 — exactly 5 are accepted (incorrect_code), the
  rest are rejected as attempts_exhausted, `attempts` never exceeds 5, and
  the correct code no longer succeeds once the budget is spent.
  G: a remember-session refresh observes an active parent, races with parent
  revocation + child sweep, then deliberately creates its linked child after
  that sweep. The child row may exist unrevoked, but it must still be
  unauthenticatable because SessionRepository requires its persistent parent
  to remain active and unexpired.
  H1/H2: `transaction.completed` races a full refund for the **same** Paddle
  transaction id in both forced lock-acquisition orders. Both must settle with
  a refunded grant, inactive entitlement, one retained normalized adjustment
  history row, and no missed/unreconciled adjustment. These scenarios exercise
  the MariaDB `transaction_event_locks` row lock added by security migration
  0009.
  H3: while one worker keeps transaction A's event-lock row locked inside an
  open MariaDB transaction, a second worker must acquire transaction B's
  different event-lock row before A commits. This directly proves the lock is
  per Paddle transaction rather than a global serialization point.
- `worker.php` — the actual separate-process entrypoint (`proc_open`s this,
  never calls a scenario function in-process). Reads scenario args from a
  per-iteration JSON file (never argv, never stdout) so raw secret values
  (Magic Link tokens, purchase_ref) never appear in any CI log line — only
  derived booleans/counts/hashes/classes are written to each worker's result
  file and to the orchestrator's summary output.
- `orchestrate.php` — the entrypoint invoked by CI. For each scenario, for
  each of `ITERATIONS` (default 20) iterations: resets the relevant tables,
  seeds the scenario's starting state through the same repository classes
  Production uses, spawns the scenario's workers via `proc_open`, waits at
  the barrier, collects results, and asserts every stated invariant from a
  **separate, fresh verification connection** after all workers have
  finished. Exits non-zero (and prints full non-secret diagnostic detail) on
  the first invariant violation, without retrying or silently continuing.

## Running it yourself

This needs a real MariaDB server — there is no local fallback, and this
harness deliberately does not try to guess or reproduce Production. See
`.github/workflows/mariadb-concurrency.yml` for the exact schema/migration
application sequence and the environment variables `orchestrate.php` expects
(`MARIADB_CONCURRENCY_DB_HOST`, `_PORT`, `_NAME`, `_USER`, `_PASSWORD` — named
distinctly from `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` specifically so
they can never be confused with, or accidentally fall back to, a real
Production config value).
