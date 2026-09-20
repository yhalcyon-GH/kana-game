# Security & Safety Audit v1

**Date:** 2026-09-20  
**Parent:** GitHub Issue #341  
**Original baseline:** `77c5240440bb58eba7c73ebf5b44bf94c0001f88`  
**Remediated source snapshot used by this draft:** `85ced65b65a508b3094ab7e49fafec65209c3928`

## Executive summary

This was a targeted, repository-wide security review of the launched Tamamizu application, using OWASP ASVS 5.0.0 as the primary verification frame, OWASP WSTG v4.2 as testing guidance, OWASP Top 10:2025 as risk taxonomy, and NIST SP 800-218 SSDF 1.1 as secure-development/process guidance.

**No Critical or High findings were identified.** The highest confirmed findings were Medium-severity software-supply-chain / CI cost-abuse weaknesses. Those Medium findings have been fixed in source and merged.

The authentication and Paddle entitlement paths were materially stronger than a typical early-stage individual project: one-time credentials are cryptographically generated and atomically consumed, Production Web session secrets are HttpOnly, credential conflicts fail closed after remediation, Paddle webhook authenticity is verified before business-state mutation, replay/duplicate/out-of-order events are handled explicitly, and real entitlement is server-derived rather than client-authoritative.

This is **not** an OWASP ASVS certification or complete ASVS checklist attestation. Items that could not be safely observed through repository/read-only tooling remain explicitly NOT VERIFIED or Human Action.

## Evidence classes

- **PASS** — directly evidenced by current source/tests/CI or a bounded read-only Production observation.
- **FINDING** — a concrete weakness with evidence and a tracked remediation.
- **N/A** — requirement does not apply to this architecture.
- **NOT VERIFIED** — relevant, but current tooling/guardrails cannot safely establish the real Production/account setting.

## Scope results

| Area | Result | Evidence summary |
| --- | --- | --- |
| Threat model / trust boundaries | PASS | See `docs/security/threat-model-v1.md`. |
| Authentication / OTP / Magic Link | PASS with remediated findings | CSPRNG credentials, hashed/HMAC storage, atomic single-use, attempt/rate caps; #342 closed by PR #343. |
| Sessions / persistent login / logout | PASS with residual design trade-off | HttpOnly/Secure/SameSite/`__Host-`; server revocation; max persistent sessions; persistent-token rotation on every refresh is not implemented. |
| CSRF / CORS / Origin | PASS with remediated findings | Exact allowlist; cookie state changes check Origin; public email-request browser abuse path fixed in #342 / PR #343. |
| Authorization / IDOR / entitlement | PASS | Current-user identity is server-derived; no real entitlement endpoint accepts client-selected user id. |
| Paddle purchase / promo / webhook | PASS | Server-created purchase intent, webhook signature-first verification, server-side product matching, transactional idempotency, refund/order reconciliation. |
| Injection / XSS / URL / client storage | PASS | PDO native prepared statements; no app `dangerouslySetInnerHTML`/direct `innerHTML` sink found; Production Web session token not exposed to JS. |
| Error handling / fail-closed behavior | PASS with Low operational finding | Security-sensitive code generally fails closed; unknown API paths returning 500 instead of 404 tracked in #351. |
| HTTP/cache/browser hardening | FINDING / partly remediated | API source hardening + sign-out no-store merged in PR #346; Production backend deployment still required. Frontend hosting headers tracked in #350. |
| Secrets / logs / URLs / bundle | PASS, some settings NOT VERIFIED | Production config ignored/untracked; token-bearing exception messages not logged; GitHub secret-scanning/push-protection setting not observable through connector. |
| Dependencies / software supply chain | PASS after remediation | Full-SHA Action pins, Dependabot, CodeQL JS/TS, owner-gated paid Claude review merged in PR #349. |
| GitHub repository controls | PASS with UI-only checks remaining | Active `Protect main` ruleset verified read-only; strict required checks + PR/thread rules; some security settings unavailable through integration. |
| Backup / rollback / incident response | PASS for rollback discipline; monitoring partly NOT VERIFIED | Production-operation docs require pre-write backup/rollback. Formal active-abuse monitoring beyond fixed error tags remains limited/not fully observable. |

## Confirmed findings and disposition

### F-01 — ambiguous multi-credential fallback on refresh-aware auth paths

**Severity:** Low  
**State:** FIXED IN SOURCE  
**Issue / PR:** #342 / #343

`auth/me.php` and `auth/sign-out-others.php` could collapse a disagreeing Bearer+cookie pair into a null normal-session credential and then reach the remember-cookie refresh path. Other sensitive endpoints already explicitly rejected the resolver's `ambiguous` state.

The fix rejects ambiguous credentials with 401 before `resolveOrRefresh()`, while preserving the legitimate missing/expired-session + valid-remember-cookie refresh path.

### F-02 — browser-origin abuse of public authentication email request endpoints

**Severity:** Low  
**State:** FIXED IN SOURCE  
**Issue / PR:** #342 / #343

The OTP/Magic Link request endpoints only withheld CORS response authorization from untrusted origins. Because their request body parser accepted JSON regardless of browser Content-Type, a hostile page could send a CORS-simple request and trigger bounded sign-in email traffic.

The fix rejects a **present** non-allowlisted Origin before reading/processing the email request, while preserving no-Origin non-browser callers and the existing per-email/IP rate limits.

### F-03 — mutable GitHub Action references / missing automated supply-chain baselines

**Severity:** Medium  
**State:** FIXED  
**Issue / PR:** #344 / #349

External Actions were referenced by mutable major tags and the repository had no Dependabot or CodeQL configuration.

All external workflow Actions are now pinned to verified full commit SHAs. Dependabot tracks npm and GitHub Actions. CodeQL analyzes JavaScript/TypeScript on main and PRs. A main-branch CodeQL run completed successfully after merge.

PHP is intentionally not represented as CodeQL-covered.

### F-04 — untrusted PR author could request paid Claude review

**Severity:** Medium (cost/availability abuse; not code execution)  
**State:** FIXED  
**Issue / PR:** #347 / #349

The paid Claude review workflow used an exact marker in the PR body but did not require the event actor to be the repository owner. An untrusted PR author could therefore attempt to cause paid model usage by copying the marker.

The workflow now has both a job-level repository-owner gate and a script-level defense-in-depth owner check, with deterministic regression cases. Existing exact-marker transition semantics remain.

### F-05 — validation workflows relied on repository-default token permissions

**Severity:** Low  
**State:** FIXED  
**Issue / PR:** #347 / #349

PR Verify and Browser Smoke now explicitly request only `contents: read`.

### F-06 — sign-out-others response lacked no-store

**Severity:** Low  
**State:** FIXED IN SOURCE  
**Issue / PR:** #345 / #346

`auth/sign-out-others.php` mutates authentication state but did not emit `Cache-Control: no-store`. It now does, and is covered by the shared cache-policy regression test.

### F-07 — API baseline browser-security headers missing

**Severity:** Low  
**State:** FIXED IN SOURCE; PRODUCTION ACTIVATION PENDING HUMAN DEPLOYMENT  
**Issue / PR:** #345 / #346

A bounded read-only Production scan showed the API capability endpoint without baseline response hardening. The shared PHP response layer now emits:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- a restrictive Permissions Policy
- a restrictive JSON-API CSP

An initial design attempted to ship a root `.htaccess`; independent review correctly identified that Production `api/.htaccess` may contain environment-specific `SetEnv`/rewrite configuration. That design was removed. The normal release must never overwrite the host-owned root `.htaccess`.

HSTS remains hosting-layer work because PHP cannot safely infer original TLS behind an unverified proxy boundary.

### F-08 — dev-only one-time credential retrieval uses side-effectful GET

**Severity:** Low  
**State:** REMEDIATION IN PROGRESS  
**Issue:** #360

The dev harness consumes pending Magic Link/OTP values on GET. CORS prevents response reading but cannot prevent a blind cross-site GET from burning a pending value. Production exposure is mitigated because `server/dev-only/` is excluded from the release and `DEV_HARNESS_ENABLED` defaults closed.

Issue #360 converts the retrieval to POST + JSON + preflight/origin enforcement and keeps it outside Production.

### F-09 — long-horizon stale authentication / purchase-intent row growth

**Severity:** Low  
**State:** OPEN RESIDUAL RISK  
**Issue:** #348

Expired/settled auth artifacts and some expired purchase intents do not have a routine pruning path. Authentication remains secure because expiry/revocation is checked on use and request creation is rate-limited, but long-term storage growth and data minimization should be addressed with a documented retention policy before implementing cleanup.

No Production delete/cron/schema action was taken during this audit.

### F-10 — static frontend lacks desired response security headers

**Severity:** Low  
**State:** OPEN HOSTING HARDENING  
**Issue:** #350

A read-only scan of `https://app.tamamizu.giganihongo.com/` showed the GitHub Pages response without HSTS/CSP/frame/nosniff/referrer/permissions headers. HTTP navigation does redirect to HTTPS.

The frontend source showed no direct HTML injection sink during this audit, and Production Web session secrets live in HttpOnly API cookies. Still, frame protection and a reviewed CSP would be useful as the product grows.

GitHub Pages does not provide arbitrary custom response-header control for this deployment. Do not use brittle meta-only CSP/frame-busting merely to improve a scanner score; a CDN/hosting change is a DNS/Production Human Gate.

### F-11 — unknown Production API paths return 500 rather than 404

**Severity:** Low  
**State:** OPEN HOSTING/OPERATIONS HARDENING  
**Issue:** #351

A definitely nonexistent `/api/*` path returned 500. Expected-excluded paths returned the same response shape, so this does **not** prove excluded files are deployed. The concern is monitoring/error-taxonomy quality: ordinary missing routes should not look like server faults.

Fixing this belongs to XServer/nginx/Apache error routing and remains a Human Gate.

## Evidence-backed PASS highlights

### OTP

- Six-digit code generated with CSPRNG-backed `random_int`.
- Plaintext code is not stored in the auth table.
- Code MAC is HMAC-SHA256 and bound to the opaque challenge token.
- Correct and incorrect attempts use atomic conditional updates.
- Attempt limit is enforced at update time, including concurrent requests.
- Per-email and per-IP issuance throttles exist.

### Magic Link

- Raw token uses 256-bit randomness.
- Only SHA-256 token hash is persisted in the auth token table.
- Consumption is atomic, expiry-aware, and single-use.
- Frontend verification passes the raw token in a POST body after reading it from the URL fragment, rather than sending it as a normal server query parameter.

### Sessions

- Session and remember tokens are random and stored as hashes.
- Production Web cookie attributes include Secure, HttpOnly, SameSite=Lax, Path=/, and `__Host-` naming/no Domain.
- Server-side logout/revocation exists.
- Persistent-login rows are capped per user with LRU eviction; linked normal sessions are revoked when their persistent credential is revoked.

### Paddle / entitlement

- Signature verification is performed before trusted webhook parsing/DB mutation.
- Client-supplied promo state is marketing input only; it does not grant entitlement.
- Purchase attribution reference is server-created and bound to the authenticated user.
- Product/price matching is server-configured.
- Webhook event claiming and grant creation are idempotent with database constraints/transactions.
- Pending adjustments and status timestamps protect out-of-order refund/chargeback processing.
- Real entitlement reads use the server-resolved current user.

### Injection / XSS / storage

- Reviewed database repositories use PDO prepared statements with native prepares.
- No production command execution with user-controlled values was found.
- No `dangerouslySetInnerHTML` or direct app `innerHTML` assignment was found.
- Production Web session tokens are not written to localStorage/sessionStorage.

### Secrets / logs

- Real Production config is untracked/ignored; examples contain placeholders.
- Security-sensitive entrypoints log fixed tags / exception classes instead of exception messages that may contain email/token data.
- Root Production `api/.htaccess` and `api/config.php` are explicitly outside ordinary application releases.

### GitHub / CI

The active repository ruleset `Protect main` was read through the GitHub API:

- targets the default branch;
- blocks deletion and non-fast-forward updates;
- requires pull requests;
- requires review-thread resolution;
- uses strict required status checks;
- currently requires `verify`, `browser-smoke`, and `pre-live-safety`;
- has no bypass actors.

CodeQL and Dependabot were added during this audit. Dependabot successfully generated update PRs after merge, confirming the configuration is active.

## Production read-only observations

Only bounded, non-destructive probes were used.

- HTTP frontend navigation redirected to HTTPS.
- HTTP API capability navigation redirected to HTTPS.
- The frontend and API lacked the desired response security headers at the time of the scan; issues #345/#350 split application-fixable API headers from frontend/host constraints.
- A nonexistent API path returned 500 rather than 404 (#351).
- No real login email, payment, refund, Paddle Live mutation, Production DB write, DNS change, Production secret change, or backend deployment was performed by this audit.

## NOT VERIFIED

The following are deliberately not labeled PASS:

- live values of Production secrets/configuration;
- whether root Production `api/.htaccess` contains `SetEnv` or rewrite directives;
- HSTS at the actual TLS-terminating layer;
- GitHub secret-scanning / push-protection / private-vulnerability-reporting settings;
- GitHub outside-contributor Actions approval policy;
- contents of Dependabot/secret-scanning alert feeds, which the available connector cannot read;
- a complete current `npm audit` advisory count;
- active security alerting/incident-monitoring practice outside the repository's documented error tags;
- exhaustive ASVS 5.0.0 compliance.

## Human Action

These are the remaining actions that cannot be completed safely through the current automation.

### HA-1 — deploy the reviewed backend source

**Priority:** High operational follow-through; not evidence of an active exploit.

Source fixes in PR #343 and PR #346 do not become active on XServer until the normal backend deployment is performed.

Use `docs/xserver-api-deployment-plan.md`. Preserve the current Production application files for rollback and **do not overwrite or expose**:

- `api/config.php`
- root `api/.htaccess`

No database migration is required for these two security PRs.

After upload, verify the redacted readiness checks and then perform only read-only endpoint/header probes. Do not send a real login email merely to confirm the deploy.

### HA-2 — decide HSTS at the real hosting layer

Inspect the XServer TLS/proxy configuration privately. Do not paste a secret-bearing `.htaccess` into chat. Enable HSTS only where the layer can reliably know that the response is HTTPS.

### HA-3 — frontend response-header strategy (#350)

When worthwhile, evaluate a CDN/hosting layer that can set a tested CSP, frame protection, nosniff, referrer policy, permissions policy, and HSTS for `app.tamamizu.giganihongo.com`. DNS/CDN changes require rollback planning.

### HA-4 — correct unknown-route 500 handling (#351)

Adjust the hosting error route so a nonexistent `/api/*` path returns a non-sensitive 404 rather than 500. Re-test with one known-nonexistent control path.

### HA-5 — define retention before deleting stale DB rows (#348)

Choose/document retention periods for ephemeral auth challenges/tokens and expired sessions, while preserving transaction/grant/refund records required for entitlement, disputes, accounting, tax, or fraud investigation. Any Production cleanup job/write remains a Human Gate.

### HA-6 — verify GitHub security UI settings

In GitHub repository Settings / Security, verify:

- secret scanning;
- push protection;
- private vulnerability reporting if desired;
- outside/fork contributor Actions approval policy.

The active main ruleset itself was verified through the API.

### HA-7 — Codex independent-review automation is optional

PR #294 remains an optional tooling enhancement. It is not required to close this audit because an independent Claude review was executed and the material findings were separately reviewed. Finishing Codex automation requires the appropriate workflow permission and an OpenAI/Codex API secret, so it remains a separate Human/Cost Gate.

## Residual-risk summary

After merged source remediations, the dominant remaining risks are operational rather than known account/payment bypasses:

1. source fixes not yet deployed to the Production PHP backend;
2. host-level/frontend response-header limitations;
3. long-horizon data retention/cleanup;
4. hosting error routing/monitoring quality;
5. unobservable account-level GitHub security toggles.

There is currently no evidence from this audit of a Critical/High authentication bypass, unauthenticated real-user entitlement IDOR, forged Paddle entitlement path, SQL injection, committed Production secret, or client-controlled Full Access grant.
