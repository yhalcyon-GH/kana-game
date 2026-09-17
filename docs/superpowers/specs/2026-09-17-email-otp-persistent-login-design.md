# Design: 6-digit email OTP + persistent login (max 3 slots, LRU eviction)

Status: approved by user (spec dictated directly, verbatim requirements below adapted to
existing repo conventions). Source: user task brief, 2026-09-17. Base: `main` @
`92b9ddabf113ee7a85e0bb89efe0607943e202d7` (PR #291 merged).

## Goal

Replace Magic Link as the primary Production sign-in UX with a 6-digit email code, add a
90-day "remember this browser" persistent credential so normal sign-in survives visits
without re-auth, and cap persistent credentials at 3 per user with LRU eviction on a 4th
login — without weakening the existing Paddle purchase/entitlement security boundary.

## Existing architecture this builds on (from repo survey)

- `users`, `magic_link_tokens`, `sessions`, `rate_limits` — `server/sql/migrations/0001_users_auth_foundation.sql`.
- `MagicLinkAuthService` (`server/src/Auth/MagicLinkAuthService.php`): atomic single-use
  token consume via PDO transaction, enumeration-safe `request-link.php` (always `{"status":"ok"}`,
  IP-throttle-before-validation ordering).
- `RateLimiter` (`server/src/Auth/RateLimiter.php`): `identifier = HMAC-SHA256(bucket:value, RATE_LIMIT_PEPPER)`,
  atomic MariaDB path via `INSERT...ON DUPLICATE KEY UPDATE` + `SELECT...FOR UPDATE`; separate
  SQLite path for unit tests. New buckets (`login_code_email`, `login_code_ip`) reuse this
  service and `RATE_LIMIT_PEPPER` unchanged (per-bucket identifiers already namespaced by
  `bucket`, so no new pepper needed here — `LOGIN_CODE_PEPPER` is reserved for the code MAC,
  a different secret, per Human's explicit instruction not to reuse `RATE_LIMIT_PEPPER` there).
- `WebSessionCookie` (`server/src/Auth/WebSessionCookie.php`): `__Host-tamamizu_session`,
  Secure/HttpOnly/SameSite=Lax/Path=/, no Domain, `SESSION_EXPIRY_HOURS` (default 24). New
  persistent cookie follows the same builder pattern: `__Host-tamamizu_remember`.
- Purchase/entitlement chain (`server/src/Purchase/PurchaseIntentService.php`,
  `PurchaseWebhookHandler.php`): server-issued `purchase_ref` (hash-only storage) →
  Paddle `custom_data.purchase_ref` → signature-verified `transaction.completed` webhook →
  atomic intent consume → `transaction_grants` → entitlement recompute under row lock. **Not
  touched** except: (a) prefill checkout email from the now-authenticated session, (b) after
  OTP verify, `entitlement-me` gates whether checkout opens.
- No existing public capability/flag endpoint — `email_code_auth` capability detection is
  net-new (frontend today gates purely on `VITE_PRODUCTION_AUTH_API_BASE_URL` being set at
  build time).
- PHP tests: plain classes under `server/tests/Auth/*.php`, run via `server/tests/run-tests.php`.
  Separate real-MariaDB concurrency suite: `server/tests/mariadb-concurrency/` (true
  multi-process races, GH Actions service container) — used to prove the max-3/LRU-eviction
  path and the code-verify race are race-safe, not just sequentially safe.
- ADR `docs/adr/0001-cross-site-auth-transport.md`: same-site cookie transport, host-only
  `__Host-` cookies, Bearer remains for non-Production-Web callers, 24h session TTL is
  deliberate and not to be casually extended — this design keeps that boundary and adds the
  separate persistent-credential mechanism instead of stretching session TTL.

## Data model (additive migration only, MariaDB-compatible, mirrors 0001's conventions)

New migration `server/sql/migrations/0003_email_otp_persistent_login.sql`:

**`email_login_challenges`**
- `id` BIGINT AUTO_INCREMENT PK
- `challenge_token_hash` CHAR(64) UNIQUE — SHA-256 hex of the opaque challenge token returned
  to the browser (same raw-never-stored pattern as `magic_link_tokens.token_hash`)
- `email_normalized` VARCHAR(255)
- `code_mac` CHAR(64) — `HMAC-SHA256(challenge_token_raw + ":" + code, LOGIN_CODE_PEPPER)` hex
- `expires_at` DATETIME — now + `LOGIN_CODE_TTL_MINUTES` (default 10)
- `attempts` TINYINT UNSIGNED DEFAULT 0
- `used_at` DATETIME NULL — set on successful atomic consume
- `invalidated_at` DATETIME NULL — set when a resend supersedes this challenge
- `created_at` DATETIME

**`persistent_sessions`**
- `id` BIGINT AUTO_INCREMENT PK
- `token_hash` CHAR(64) UNIQUE — SHA-256 hex of the raw 256-bit token in the
  `__Host-tamamizu_remember` cookie
- `user_id` CHAR(36) NOT NULL FK → `users` ON DELETE CASCADE
- `expires_at` DATETIME — created_at + `PERSISTENT_LOGIN_DAYS` (default 90), absolute, not
  sliding
- `revoked_at` DATETIME NULL
- `created_at`, `last_seen_at` DATETIME

**`sessions.persistent_session_id`** — new nullable `BIGINT` FK → `persistent_sessions.id`
ON DELETE SET NULL, so revoking a persistent credential can cascade-revoke (application-level,
not DB cascade, to keep the same explicit-revocation audit pattern as today) its linked normal
sessions.

`magic_link_tokens`, existing `sessions` rows, and `rate_limits` are untouched; Magic Link
stays fully functional as fallback.

## Endpoints (`server/auth/`, matching existing file-per-endpoint layout)

- `POST /api/auth/request-code.php` — mirrors `request-link.php`'s ordering (IP throttle →
  validate → email throttle → invalidate prior active challenge for that email → generate →
  persist → send) and its enumeration-safe always-`{"status":"ok"}` contract, plus a
  `{"challenge": "<opaque>"}` field the frontend needs to submit the code against.
- `POST /api/auth/verify-code.php` — mirrors `verify.php`'s transactional shape: PDO
  transaction → atomic consume (fails closed on already-used/expired/attempts-exhausted,
  constant-time MAC compare) → find-or-create user by normalized verified email → enforce
  max-3-persistent-slots (evict LRU `persistent_sessions` row + its linked `sessions` rows if
  at cap) → create new `persistent_sessions` row → create new `sessions` row linked to it →
  commit → issue both cookies (`__Host-tamamizu_session`, `__Host-tamamizu_remember`) → return
  current-user payload (same shape as `me.php`).
- `GET /api/auth/capabilities.php` (or extend an existing public config endpoint if
  `me.php`/an equivalent already returns non-authenticated JSON — confirm during
  implementation) — returns `{"email_code_auth": true}`; frontend falls back to Magic Link
  when absent/false/unreachable, so a GitHub-Pages-ahead-of-backend deploy never locks anyone
  out.
- Session refresh: extend `CurrentUserService`/`SessionCredentialResolver` (not yet read in
  detail — confirm exact hook point during implementation) so that when the normal session
  cookie is missing/expired but a valid `__Host-tamamizu_remember` resolves to a non-revoked,
  non-expired `persistent_sessions` row, the server transparently mints a fresh `sessions` row
  and re-issues `__Host-tamamizu_session`, with no user-visible re-login.
- `POST /api/auth/sign-out-others.php` — revokes all `persistent_sessions` (and their linked
  `sessions`) for the current user except the one tied to the caller's own current
  `persistent_sessions` row.
- Existing `logout.php` — extended to also revoke the current `persistent_sessions` row and
  delete `__Host-tamamizu_remember`.
- `request-link.php`, `verify.php`, `MagicLinkAuthService` — unchanged, kept as fallback per
  explicit instruction.

## Security properties (carried over 1:1 from the brief; not renegotiated)

- OTP: crypto-secure RNG, 000000–999999 with preserved leading zeros; 10 min TTL; 5 attempts
  then challenge dead; resend invalidates the prior code; code never logged/returned/stored
  plaintext/put in URL or browser storage; `code_mac` uses `LOGIN_CODE_PEPPER`, distinct from
  `RATE_LIMIT_PEPPER`; verification is bound to the challenge token, not email+code alone;
  concurrent verify attempts on the same challenge: exactly one succeeds (atomic conditional
  UPDATE on `used_at IS NULL`, same pattern as `magic_link_tokens.consume`).
- Persistent login: 256-bit opaque token, hash-only storage, 90-day absolute expiry,
  server-revocable, `last_seen_at` touched on legitimate use.
- Max 3 / LRU eviction: quota unit is `persistent_sessions` rows, not devices/IPs/fingerprints.
  4th successful OTP login evicts the least-recently-used (`last_seen_at`) active row for that
  user and its linked `sessions`, then proceeds — login is never blocked with a "too many
  devices" message.
- Explicitly out of scope: passwords, SMS OTP, MFA, passkeys, CAPTCHA-by-default, device/canvas
  fingerprinting, IP or geo locking, saved Paddle payment methods, full device-history UI.
- Purchase/entitlement boundary is unchanged: frontend checkout success is never authoritative;
  only the signature-verified `transaction.completed` webhook + `purchase_ref` consume +
  entitlement recompute unlocks Full Access. OTP only supplies the authenticated user identity
  used to create the purchase intent and to prefill Paddle checkout email.

## Config (new, additive; Production values are a human gate)

`LOGIN_CODE_PEPPER`, `EMAIL_CODE_AUTH_ENABLED`, `LOGIN_CODE_TTL_MINUTES` (10),
`LOGIN_CODE_MAX_ATTEMPTS` (5), `PERSISTENT_LOGIN_DAYS` (90), `MAX_PERSISTENT_SESSIONS` (3) —
added to `server/config.example.php` only, following the existing `RATE_LIMIT_PEPPER`
documentation pattern (what it protects, rotation impact).

## PR breakdown (as specified by the user; unchanged)

- **PR A** — backend: migration, OTP challenge service + endpoints, persistent-session service,
  max-3/LRU enforcement, session-refresh-from-persistent-credential, capability endpoint,
  security tests (SQLite unit + real-MariaDB concurrency suite additions), Magic Link
  untouched/compatible.
- **PR B** — frontend: Full Access → email → code → checkout flow, capability-detection
  fallback to Magic Link, automatic persistent-login restoration (no explicit client action
  needed — it's a server-side cookie behavior), Account UX ("Signed-in browsers & devices" +
  "Sign out other browsers"), browser-smoke coverage at 320px.
- **PR C** — only if purchase-flow integration/cleanup doesn't fit safely inside A+B (e.g.
  Paddle email prefill wiring, updated Privacy/Terms copy about the new primary auth method).
  Each PR branches from `main`; PR B depends on PR A merging (documented in the PR body) unless
  capability-detection makes it safe to land independently — evaluate at PR-B time.

## Testing (as specified by the user; unchanged, mapped onto existing suites)

Security tests added to `server/tests/Auth/*.php` (OTP correctness/expiry/reuse/attempts/
resend-invalidation/pepper-isolation/no-plaintext-storage) and
`server/tests/mariadb-concurrency/` (concurrent verify race, 4th-login LRU eviction race).
Purchase-flow tests added to `server/tests/Purchase/*.php` (new-device paid account restores
entitlement with no checkout, webhook-delay UX contract). Frontend: Vitest for OTP UX
components/hooks, existing browser-smoke suite extended for the new flow at 320px per the
brief's checklist. Standard gates before each PR: `npm test`, `npm run lint`, `npm run build`,
`npm run verify`, `npm run test:browser-smoke`, `server/tests/run-tests.php`, `git diff --check`,
and the MariaDB concurrency suite where new atomic/lock behavior depends on real MariaDB
semantics.

## Human gates (unchanged, restated)

No real Paddle payment/refund, no Production Paddle product/price changes, no Production DB
migration/write, no Production secret/DNS/deploy changes, no paid-service trigger, no bulk
real-user email. Migration files and config examples are fine to create. These PRs are not
auto-merged — implementation stops once PR A/B(/C) are ready with green exact-head CI, pending
human review and merge decision.

## Open items to confirm during implementation (not blocking spec approval)

- Exact hook point in `CurrentUserService`/`SessionCredentialResolver` for the
  persistent-session-refresh path (not read in detail during research).
- Whether an existing non-authenticated JSON endpoint can carry the `email_code_auth` flag
  instead of a new file, once `me.php` and friends are read directly.
- Exact current purchase-trigger UI in `AccountPage.tsx` / `sandboxCheckoutController.ts` for
  wiring the "skip checkout if already entitled" step B UX.
