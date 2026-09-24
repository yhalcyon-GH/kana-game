# Security hardening tranche 2

Date: 2026-09-24
Tracking: issue #392 (audit follow-up), issue #395 (this tranche), tranche 1 was issue #393 / PR #394.

Repository-side follow-up to `docs/security/security-audit-v1.md`, scoped to
items tranche 1 (same-origin analytics, anti-phishing copy, incident runbook)
did not cover: dependency lifecycle-script review, a fail-closed Production
auth API origin, and independent PHP static analysis.

## 1. Dependency lifecycle-script review policy

`package-lock.json` currently has exactly three packages with
`hasInstallScript: true`. `package.json`'s `allowScripts` map pins each one by
**exact `name@version`**, not by bare package name, so a version bump doesn't
silently inherit an old approval:

- `esbuild@0.28.1: true` — required build tool (Vite/tsc depend on its
  platform binary).
- `ffmpeg-static@5.3.0: true` — dev-only voice tooling; `scripts/asr.ts`
  depends on whisper tooling that uses it. Not part of any runtime/CI path;
  the voice pipeline itself is never executed by CI.
- `fsevents@2.3.3: false` — optional macOS-only dev dependency; its script is
  not needed for Tamamizu CI/runtime and is explicitly denied. It is also a
  `darwin`-only optional dependency, so Linux CI never installs it at all
  regardless of this policy.

`scripts/checkSupplyChainSafety.mjs` (wired into `npm run verify`, so the
already-required PR Verify check enforces it on every PR) mechanically
enforces this policy is kept exact and current:

- every `hasInstallScript` package in `package-lock.json` must have an exact
  `name@version` entry in `allowScripts` (missing entries fail the check);
- `allowScripts` keys must be exact version pins — a bare name, a semver
  range (`^`, `~`, `*`), or any other non-exact key fails the check;
- an `allowScripts` entry that no longer matches any current lifecycle
  package (e.g. left over after a version bump) fails the check, so
  approvals stay reviewed against what's actually in the lockfile;
- every external GitHub Actions `uses:` reference in `.github/workflows/*.yml`
  must be pinned to a full 40-hex commit SHA;
- no workflow may use the `pull_request_target` trigger.

The repository also sets `.npmrc` to `strict-allow-scripts=true`. Modern npm therefore turns any unreviewed dependency lifecycle script into a hard install error instead of a warning/implicit skip. The guard script verifies that setting remains present and true, so the install-time policy and the review-time policy cannot silently drift apart.

## 2. Production auth API base: canonical and fail-closed

`src/lib/auth/productionAuthApiBase.ts` (`readProductionAuthApiBase()`) is
the single source of the Production Web-auth API base
(`server/auth/*.php`, `server/entitlement-me.php`) used by
`EntitlementProvider`, `LoginPage`, `AccountPage`, `ProductionVerifyPage`,
and `useProductionSandboxPurchase`.

Behavior:

- unset in production → the canonical base,
  `https://tamamizu.giganihongo.com/api` (harmless trailing-slash
  normalization only);
- explicitly configured to exactly the canonical base (with or without a
  trailing slash) in production → that canonical base;
- explicitly configured to anything else in production — a different origin,
  scheme (`http` instead of `https`), path, or port — **fails closed**:
  the function returns `undefined` instead of the configured value, so
  auth/session traffic is never silently sent to an unintended origin. Every
  caller already treats `undefined` as signed-out/unavailable, so this is a
  pure config-safety change, not a new UI state.
- development is unaffected: an explicitly configured development auth API
  URL is used as-is (trimmed, trailing slash normalized), same as before.

OTP/Magic Link/session semantics and endpoints are unchanged. See
`src/lib/auth/productionAuthApiBase.test.ts` for the regression coverage
(default canonical base; exact canonical base with/without trailing slash;
cross-origin/http/wrong-path/wrong-port rejection in production; development
explicit URL).

## 3. PHP static analysis (PHPStan) without Composer

`docs/security/security-audit-v1.md` and audit #391/#392 noted the backend
had no PHP SAST coverage. `server/phpstan.neon` plus a `.github/workflows/
phpstan.yml` workflow add one, without introducing Composer into this
repository.

- downloads the official PHPStan PHAR (pinned to exactly `2.2.13`,
  <https://github.com/phpstan/phpstan/releases/download/2.2.13/phpstan.phar>)
  with `curl --fail --location --proto '=https' --tlsv1.2`, verifies its
  SHA-256 (`a3293d850a9966fbef43e39d04f2b081b8eec35839126c43a54684f21b10ad69`)
  **before** executing it, and only then runs `analyse`;
- runs on PRs and pushes to `main` that touch `server/**` or the workflow
  file itself, with `permissions: contents: read`;
- uses the same `shivammathur/setup-php` SHA already approved elsewhere in
  this repository (`server-unit-tests.yml`, `mariadb-concurrency.yml`);
- analyzes `server/src` and `server/auth` per `server/phpstan.neon`
  (`level: 6`, `phpVersion: 80400`); there is no Composer autoloader in this
  repository, so PHPStan's own reflection over those two `paths` is relied
  on instead.

The first GitHub CI run at level 6 found exactly two pre-existing findings and no others. They are narrowly baselined in `server/phpstan-baseline.neon` with exact message/identifier/count/path matches:

- `src/Purchase/GrantAdjustmentReducer.php:147` — `booleanNot.alwaysTrue`
- `src/Purchase/PurchaseWebhookHandler.php:189` — `if.alwaysFalse`

The level was not lowered and no broad suppression was added. Any additional PHPStan finding remains blocking.

`.github/workflows/pr-verify.yml` (the already-required PR Verify check) also runs a fast, unconditional `php -l` syntax sweep over every file under `server/` on every PR, using the same approved `setup-php` SHA. This is a cheap baseline sanity check, not a substitute for `server-unit-tests.yml` (real behavior, already its own workflow) or `phpstan.yml` (real static analysis, scoped to `server/**` above).

## Explicitly out of scope for this tranche

- Frontend HTTP security headers (CSP / `frame-ancestors` / HSTS) remain an
  open residual (`docs/security/security-audit-v1.md` #350) that needs a
  hosting/CDN/DNS change; not solved here.
- No permanent remote PWA kill switch was added. Tranche 1's
  `docs/security/pwa-security-incident-response.md` remains the intended
  emergency process.
- No DNS, hosting/CDN, Production DB, Paddle Live, secrets, or paid-service
  changes were made.
