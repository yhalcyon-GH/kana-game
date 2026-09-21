# Security & Safety Audit v1

Date: 2026-09-21
Repository baseline reviewed: `77c5240440bb58eba7c73ebf5b44bf94c0001f88`
Final remediation main SHA: `608d910c8a6eb1f025ca4b8dbfd4a74fe1c7e384`

## Executive summary

This document closes the repository-side, AI-completable portion of Tamamizu's first Security & Safety Audit.

The audit was a **targeted ASVS-informed review**, not an OWASP ASVS compliance certification. OWASP ASVS 5.0.0 was used as the primary verification frame, with OWASP WSTG v4.2, OWASP Top 10:2025, and NIST SP 800-218 SSDF 1.1 used as supporting references for testing method, risk taxonomy, and secure-development practice.

At the original audit baseline there were **no Critical or High findings**. One Medium CI/cost-abuse finding and several Low application/operational findings were identified. Follow-up review then found additional security-relevant session/Magic-Link and Paddle reconciliation issues. Those repo-side blockers were fixed through reviewed PRs and durable regression tests.

At final remediation main SHA `608d910c8...`:

- no unresolved Critical, High, or Medium repository-side blocker is known;
- the final Paddle reconciliation PR passed PR Verify, Server Unit Tests, MariaDB Concurrency Verification, CodeQL, Browser Smoke, and Pre-Live Safety at exact reviewed HEAD `02e5131dd0c1ae22650a6f132ae45bbe630472a9`;
- Claude Code's final exact-head review reported no issues;
- Codex's final delta review reported no blocking finding;
- all review threads on PR #370 were resolved before merge.

This does **not** mean the corresponding Production changes are already deployed. Security migrations 0008 and 0009, the matching backend release, and the Paddle reconciliation cutover remain explicit Production Human Gates.

## Scope and method

Issue #341 defined the audit scope:

1. threat model and trust boundaries;
2. Email OTP, Magic Link, sessions, persistent login, logout, and multi-device behavior;
3. CORS / Origin / CSRF handling;
4. authorization, IDOR, and entitlement bypass;
5. Paddle purchase attribution, webhook signature/replay/order/refund behavior;
6. injection, XSS, URL/open-redirect, client storage;
7. exceptional-condition and fail-open/fail-closed behavior;
8. HTTP/cache/browser hardening;
9. secrets and sensitive-data exposure;
10. dependencies and GitHub Actions supply chain;
11. GitHub repository security controls where observable;
12. read-only Production probes;
13. backup, rollback, incident response, and observability.

Evidence was classified as repository/CI evidence, live read-only evidence, or not verified. Dynamic abuse cases were pushed into deterministic tests and real MariaDB CI where possible. No real charge/refund, Paddle Live mutation, Production DB write, secret change, DNS change, or Production backend deploy was performed as part of the audit.

## Final finding inventory

| Area | Severity | Final status | Evidence / remediation |
|---|---|---|---|
| Paid Claude review trigger could be requested from attacker-controlled PR body | Medium | CLOSED | #347 / PR #349 owner-gated paid review and tightened token permissions. |
| Two CI workflows lacked explicit least-privilege permissions | Low | CLOSED | #344 / PR #349; Actions were also full-SHA pinned, Dependabot added, CodeQL added. |
| `sign-out-others.php` cache-control inconsistency and missing baseline API security headers | Low | CLOSED | #345 / PR #346; shared API headers and no-store coverage added. |
| Dev-harness one-time credential retrieval used state-changing GET behavior | Low | CLOSED | #360 / PR #363; retrieval is POST-only. |
| Persistent-session / Magic-Link browser-binding and login-CSRF edge cases | Security hardening | CLOSED | #364 / PR #369; browser binding, persistent-session revocation/account-switch handling, and related regressions added. |
| Paddle same-transaction races, out-of-order events, legacy migration boundary, rollback incompatibility, coarse timestamp ambiguity | Medium | CLOSED | #365 / PR #370; deterministic per-transaction locking, immutable replay baseline, DATETIME(6), cutover reconciliation, rollback guards, durable quarantine, exact replay bookkeeping, and real-MariaDB concurrency coverage. |
| Stale auth / purchase-intent row retention | Low | OPEN RESIDUAL | #348; bounded-rate growth/data-minimization backlog. Production cleanup/schema/cron changes remain a Human Gate. |
| Frontend response security headers on GitHub Pages | Low | OPEN RESIDUAL | #350; live read-only scan found missing browser-security headers. Meaningful fix requires hosting/CDN/DNS change. |
| Missing API paths return 500 instead of normal 404 | Low | OPEN RESIDUAL | #351; operational/error-handling hardening, host configuration Human Gate. |
| Static/PWA premium assets are extractable by a technical client | Accepted commercial residual | OPEN RESIDUAL | #366; not an account/payment/server entitlement bypass. Stronger DRM requires server/CDN delivery redesign. |

Open Dependabot PRs are tracked separately and were not treated as blockers merely because newer major Action versions exist; the audited workflows are SHA-pinned and CodeQL/Dependabot controls are in place.

## Notable PASS evidence

### Authentication and session handling

The reviewed code uses server-derived account identity, random high-entropy session credentials, hashed-at-rest session/token values, atomic single-use token/code consumption, and server-side revocation. OTP and Magic Link flows are enumeration-conscious and rate limited. The final follow-up hardening also binds Production Magic Link login to the requesting browser and closes persistent-session/account-switch revocation gaps.

### CORS, Origin and CSRF defenses

Credentialed browser endpoints use allowlisted Origin handling; state-changing auth endpoints do not rely on permissive CORS. Paddle webhook authentication does not trust browser Origin/CORS at all and is based on Paddle signature verification.

### Authorization and entitlement

Real account and entitlement paths do not accept a client-selected real-user identifier as the source of authority. Entitlement derives from server-side transaction-grant state.

PR #370 additionally makes ambiguous deterministic Paddle reconciliation states conservative: an unresolved block excludes only the affected Paddle transaction from entitlement-bearing queries while a separate healthy repurchase remains valid.

### Paddle webhook integrity and ordering

The final design includes:

- signature verification before trusted payload use;
- DB-backed event idempotency;
- per-Paddle-transaction serialization;
- retained normalized adjustment history;
- microsecond event ordering with stable event-ID tie-breaking;
- an immutable replay baseline for legacy grants;
- fail-closed handling of ambiguous legacy/coarse same-second entitlement restoration;
- a guarded, idempotent one-time cutover reconciliation path for pre-existing stranded adjustments;
- detection of application-only rollback/history divergence;
- durable non-PII quarantine for known deterministic reconciliation invariants;
- separate handling of unknown/transient failures as 500/retry conditions;
- exact event-level reconciliation bookkeeping so pre-baseline skipped rows cannot be silently marked reconciled;
- cutover completion gates requiring zero grant-backed unreconciled transactions and zero unresolved reconciliation blocks.

### Injection, XSS, secrets, and client storage

The audit found prepared PDO queries in the reviewed repositories, no material production command-injection path, no direct `dangerouslySetInnerHTML` / `innerHTML` sink in the frontend, and no committed Production secrets. Real `server/config.php` remains untracked. Browser session credentials are not persisted in localStorage/sessionStorage; only non-sensitive app/game progress is persisted client-side.

### Logging and observability

Production-facing entrypoints log fixed tags and exception classes rather than raw payloads, customer identifiers, token values, or exception messages. Paddle deterministic reconciliation quarantine has a fixed `quarantined` operational outcome and a durable non-PII block table for operator follow-up.

The Production XServer error log was read-only reviewed during launch preparation and the user-area retention setting was set to nine weeks. This is operational evidence, not a claim of comprehensive SIEM/alerting.

## GitHub repository controls observed

At audit completion the active default-branch ruleset `Protect main` was directly observable through the GitHub API:

- enforcement: active;
- default branch covered;
- deletion protection;
- non-fast-forward protection;
- pull request required;
- review-thread resolution required;
- extra approval for unattributed changes required;
- no bypass actors; current user cannot bypass;
- strict required-status-check policy;
- required checks include `verify`, `browser-smoke`, and `pre-live-safety`.

Repository CI also ran CodeQL and server/MariaDB security regressions on the final reconciliation PR.

The audit did **not** independently verify every GitHub organization/repository security setting such as secret-scanning/push-protection state or all external contributor approval policies. Those remain outside the evidence claimed here.

## Production verification boundary

The following are true repository/operations facts at audit close:

- migration 0006 had already been applied and verified in Production;
- migration 0007 is intentionally dev-only and not a Production migration;
- migrations 0008 and 0009 are **not yet applied** in Production;
- the matching #364/#365 security backend release has **not yet been deployed** as part of this audit close;
- the guarded Paddle cutover apply has **not yet been executed** in Production;
- no real charge, refund, or Paddle Live mutation was performed;
- Production `api/config.php` and root `api/.htaccess` are host-owned/untracked and must not be overwritten by an ordinary release.

Therefore this audit closes the reviewed repository implementation, tests, and deployment procedure; it does not assert that the new security model is already live on Production.

## Required Production Human Gate

The reviewed security cutover must move schema and backend together. The documented order is:

1. take a fresh Production DB backup and preserve the current API application files for rollback;
2. stage only the reviewed cutover CLI under the HTTP-denied `ops/` directory and run its read-only `--check`;
3. apply migration 0008, then migration 0009;
4. deploy the matching reviewed backend while preserving Production `api/config.php` and root `api/.htaccess`;
5. run the explicitly human-approved idempotent reconciliation apply;
6. run `--check` again and require:
   - `grantBackedUnreconciledTransactions=0`;
   - `unresolvedReconciliationBlocks=0`;
7. perform the documented post-deploy read-only/header/auth checks.

Once a 0009-aware backend has processed webhooks, **application-files-only rollback to the pre-0009 backend is prohibited**. Recovery must use a forward fix/reconciliation-compatible build, or a coordinated pre-cutover DB restore plus controlled webhook recovery.

Any Production DB migration/write, backend deployment, Paddle Live change, real email action requiring approval, DNS/hosting change, Production secret/config change, charge, or refund remains a Human Gate.

## Residual risk

The remaining known items are deliberately separated from launch-blocking security defects:

- **#348 — retention cleanup:** expired ephemeral auth/purchase-intent rows can accumulate over a long horizon. Access control and expiry checks are intact; this is storage/privacy hygiene.
- **#350 — frontend headers:** GitHub Pages does not currently emit the desired frontend security headers. A meaningful correction requires a hosting/CDN decision rather than meta-tag theater.
- **#351 — missing-path 500:** unknown API routes currently produce 500 rather than 404 on the host. This weakens operational signal quality, not account/payment authorization.
- **#366 — static premium assets:** a technically capable user can inspect/download assets shipped to the browser. This is an accepted v1 commercial/DRM limitation, not a server entitlement bypass.

## Final audit disposition

For the repository state through main SHA `608d910c8a6eb1f025ca4b8dbfd4a74fe1c7e384`, the AI-completable Security & Safety Audit v1 work is complete.

No unresolved Critical, High, or Medium repository-side blocker remains in the reviewed scope. The remaining work is either Low/accepted residual risk or an explicitly gated Production cutover/hosting operation.

Closing #341 should therefore mean **audit implementation and evidence complete**, not **Production security deployment complete**.
