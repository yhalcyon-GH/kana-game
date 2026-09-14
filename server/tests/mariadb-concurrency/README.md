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

## What this PR does NOT do

This is a **diagnostic** PR. If a scenario here finds a real concurrency defect
(e.g. entitlement write-skew under InnoDB `REPEATABLE READ`), this PR does
**not** attempt to fix the underlying runtime code — see the top-level PR
report for what was found and what remains as follow-up work.

## Layout

- `bootstrap.php` — requires the real `server/src/` classes needed by every
  scenario (via the existing, unmodified `Config`/`Db` classes, fed
  ephemeral CI-only credentials — never a real `server/config.php`), plus the
  existing SQLite-backed test files under `server/tests/Auth/` and
  `server/tests/Purchase/` purely to **reuse** their already-reviewed helper
  functions (`makeMagicLinkAuthServiceHarness`'s dependency wiring pattern,
  `makePurchaseWebhookHandler()`, `pwhSign()`, `pwhTransactionCompletedPayload()`,
  `pwhAdjustmentPayload()`) and `TestCase.php`'s assertion helpers. No existing
  test file is modified.
- `Barrier.php` — a file-based ready/go barrier. Every worker process signals
  "ready" by creating a file, then polls (short `usleep` loop, not a single
  blind `sleep`) for a `go` file the orchestrator creates only once every
  worker has signaled ready. This is what makes each worker's racy operation
  actually start at (as close as this mechanism can guarantee) the same
  moment, rather than relying on guessed sleep offsets.
- `scenarios.php` — one function per scenario (A, B, C1–C4), each run inside a
  worker process against that worker's own dedicated `PDO` connection.
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
