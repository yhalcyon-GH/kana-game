# Threat Model v1

Date: 2026-09-21
Applies to repository state through main SHA `608d910c8a6eb1f025ca4b8dbfd4a74fe1c7e384`

## Purpose

This threat model records the assets, actors, trust boundaries, primary abuse cases, controls, and residual risks for Tamamizu's current web/PWA, authentication, and one-time-purchase architecture.

It is a practical threat model for Security & Safety Audit v1, not a claim that every future feature or infrastructure layer is covered.

## System overview

Tamamizu consists of:

- a static React/PWA frontend delivered from GitHub Pages/custom domain;
- an XServer-hosted PHP API;
- a MariaDB database;
- Email OTP and Magic Link authentication;
- short-lived sessions and optional persistent-login state;
- a Paddle one-time-purchase integration;
- GitHub Actions for CI, deploy verification, CodeQL, dependency automation, and optional owner-gated Claude review.

Premium curriculum is still delivered as browser-accessible static/PWA assets. Server entitlement controls the normal application flow but is not DRM for already-public client assets.

## Security assets

Primary assets to protect:

1. account identity and authenticated sessions;
2. OTP / Magic Link / persistent-login credentials;
3. entitlement state and transaction-grant history;
4. Paddle webhook authenticity and purchase attribution;
5. Production DB integrity;
6. Production config/secrets, including Paddle and mail credentials;
7. customer email addresses and other limited auth-adjacent data;
8. CI credentials and paid-service tokens;
9. release integrity and rollback capability;
10. premium-content commercial value.

## Actors

### Legitimate user

Uses the frontend, authenticates, purchases access, and expects account/session/purchase state to remain correctly attributed.

### Malicious browser user / account attacker

Controls their own browser and request payloads. May attempt IDOR, client-state manipulation, CSRF, token replay, credential theft, direct API use, or entitlement bypass.

### Webhook forger / replay attacker

May send arbitrary requests to the webhook endpoint or replay previously observed payloads. Must not be able to forge Paddle authority or create duplicate/incorrect grants.

### Network attacker

May observe or tamper with unprotected traffic. The design assumes HTTPS at the hosting layers and secure cookies for authenticated browser state.

### Malicious or careless code contributor

May attempt to abuse CI tokens, paid review credentials, workflow permissions, dependency updates, or malicious source changes.

### Technical paid-content extractor

Controls their browser/devtools and can inspect static assets shipped to the PWA. This actor is relevant to commercial/DRM risk even when account/payment security is intact.

### Operator

Has legitimate access to GitHub, XServer, Production DB/config, Paddle, and DNS/hosting controls. Operator error during migration/deploy/rollback is an explicit threat class.

## Trust boundaries

### Boundary A — Browser ↔ static frontend

The browser receives fully untrusted/extractable HTML, JS, PWA cache, and static media.

Security consequence: frontend state and hidden routes are never an authorization boundary. Anything shipped as a public asset can ultimately be inspected.

### Boundary B — Browser ↔ XServer API

The API must authenticate the user and derive server-side identity. Client-provided user identifiers cannot be accepted as authority for real accounts.

Controls include secure session handling, Origin/CORS restrictions, server-side authorization, no-store/security headers on JSON API responses, rate limits, and prepared SQL.

### Boundary C — API ↔ MariaDB

The DB is the authority for session state, purchase intent, transaction grants, normalized adjustment history, reconciliation baseline, and quarantine state.

Transactions, uniqueness constraints, per-transaction locks, and explicit replay rules are relied on for correctness under concurrency.

### Boundary D — Auth API ↔ email provider / user's mailbox

OTP and Magic Link requests cross an external delivery channel. The application cannot guarantee mailbox security. Tokens/codes are designed for single use, limited lifetime, and server-side hashed storage.

Magic Link Production login is additionally browser-bound so possession of the link alone is not the complete login condition in the hardened flow.

### Boundary E — Paddle ↔ webhook endpoint

The internet-facing webhook accepts requests without browser authentication. Trust comes only from Paddle signature verification and configured product/price values.

After signature validation, Paddle event IDs and transaction IDs drive server-side reconciliation.

### Boundary F — GitHub / Actions ↔ repository and credentials

CI executes repository code and selected Actions. Workflow permissions, immutable action SHAs, owner-gating for paid review, branch rules, CodeQL, and required checks reduce supply-chain and cost-abuse risk.

### Boundary G — Operator ↔ Production

DB migrations, backend upload, Paddle Live changes, DNS/hosting, Production secrets, charges/refunds, and certain real-email operations are privileged actions. They are intentionally not automated past the approved Human Gate.

## Primary threats and controls

| Threat | Primary control | Residual / operational concern |
|---|---|---|
| OTP brute force / replay | CSPRNG code, HMAC-at-rest, expiry, attempt cap, atomic single-use consume, rate limiting | Mailbox compromise and distributed abuse remain external risks. |
| Magic Link theft / replay | Random high-entropy token, hash-at-rest, single-use consume, fragment-based transport, browser binding in hardened Production flow | Existing/pre-migration links require coordinated 0008 deployment behavior. |
| Session cookie theft | Secure/HttpOnly/SameSite cookie model, server-side revocation, persistent-session revocation controls | Stolen persistent credential remains important until revoked/expired. |
| CSRF on credentialed state changes | SameSite plus allowlisted Origin checks | Hosting/proxy configuration must preserve expected origin behavior. |
| Cross-origin credential exposure | Exact CORS allowlist; no wildcard credential mode | Production allowlist values remain config-sensitive. |
| IDOR / user impersonation | Server-derived current-user identity; no real entitlement lookup keyed by arbitrary client user id | Legacy/dev PoC surfaces must remain excluded/disabled as documented. |
| Forged Paddle webhook | Signature verification before trusted processing | Correct Production webhook secret/environment configuration remains essential. |
| Duplicate webhook / replay | Unique event claim within DB transaction | Durable state depends on DB integrity/availability. |
| Same-transaction concurrent events | Per-Paddle-transaction row lock and deterministic replay | Requires migration 0009 and matching backend to be deployed together. |
| Out-of-order refund/chargeback lifecycle | Retained normalized history, precise timestamps, deterministic reducer | Pre-0009 history cannot be perfectly reconstructed if payloads were never retained. |
| Pre-0009 stranded claimed adjustment | Guarded read-only inventory + idempotent cutover repair under transaction lock | Production cutover must require zero remaining grant-backed unreconciled rows. |
| Legacy whole-second ordering ambiguity | Legacy/coarse baseline marker; ambiguous entitlement restoration is not automatically trusted | Such states become durable operator-visible quarantine rather than guessed history. |
| Old-backend application-only rollback after 0009 | Materialized-state vs replay-history divergence guard; runbook explicitly forbids this rollback | Operator must use forward fix/compatible build or coordinated DB restore. |
| Deterministic poisoned webhook exhausting retries | Durable non-PII quarantine with fixed 200 outcome for known invariant failures | Quarantine requires operator review; cutover cannot complete with unresolved rows. |
| Accidental entitlement left active under unknown history | Unresolved deterministic block excludes that Paddle transaction only | Conservative exclusion can temporarily deny access for that purchase until resolved; a healthy repurchase still counts. |
| DB/runtime transient failure | Transaction rollback and 500 response for unknown/transient failures | Depends on Paddle retry window and operator monitoring. |
| Partial refund semantic drift | Regression locks pre-0009 approved-partial behavior to no grant status change | Future proportional-access product policy would require an explicit new design. |
| SQL injection | Prepared PDO statements and no request-data SQL concatenation in reviewed paths | Future queries must preserve the invariant. |
| XSS in app rendering | No reviewed raw-HTML sink; text/templates escape relevant values | Future rich content or third-party widgets can change this risk. |
| Secret leakage | Real config gitignored/untracked; fixed-vocabulary/class-only logging | Operator must not upload/display Production config during releases. |
| CI token / paid-review abuse | SHA-pinned Actions, least privilege, owner-gated Claude review, branch rules | Not every org security setting was independently verified. |
| Malicious dependency update | Dependabot visibility, CodeQL, PR checks, branch rules | Major dependency/Action upgrades still need review rather than blind merging. |
| Premium-content extraction | None at DRM level once asset is shipped to browser | Accepted v1 commercial residual (#366); server/CDN delivery is the meaningful future fix. |
| Long-horizon auth-table growth | Existing rate limits and expiry enforcement | Cleanup/TTL is still a Low backlog (#348). |
| Clickjacking/browser-header defense on frontend | HTTPS; no known raw HTML sink | GitHub Pages header limitation remains Low backlog (#350). |
| Host missing-path errors appear as 500 | Application errors are fixed-tagged; known host behavior documented | Improve host-level 404 behavior under Human Gate (#351). |

## Paddle reconciliation security state

The current repository model intentionally treats reconciliation as a security-sensitive state machine rather than as incremental "last event wins" writes.

A transaction has:

- a server-side transaction grant;
- an immutable replay baseline;
- retained normalized post-baseline adjustment history;
- precise event ordering;
- a per-transaction serialization lock;
- optional durable quarantine when a known invariant cannot be safely auto-resolved.

Only event IDs positively replayed after the baseline are stamped reconciled. A skipped pre-baseline row therefore remains visible instead of being silently converted into success.

For deterministic invariant failures, the system records a non-PII reconciliation block and acknowledges the event to avoid a finite-retry poison loop. Unknown/transient failures are not classified this way and remain normal rollback + 500 conditions.

An unresolved deterministic block makes only that Paddle transaction non-entitlement-bearing until operator resolution. This deliberately favors "do not grant access from unproven purchase history" while preserving a separate healthy repurchase.

## Deployment and rollback threats

The new session and Paddle security models are not fully active until Production migration/deployment.

Security cutover constraints:

- migration 0008 must precede the matching Magic-Link/browser-binding backend;
- migration 0009 must precede the matching reconciliation backend;
- dev-only migration 0007 remains intentionally absent from Production;
- pre-cutover read-only inventory must be performed;
- post-deploy guarded reconciliation must be explicitly approved;
- final cutover must have zero grant-backed unreconciled transactions and zero unresolved reconciliation blocks;
- Production `api/config.php` and root `api/.htaccess` must not be overwritten;
- once 0009-aware webhook processing begins, a pre-0009 application-files-only rollback is unsafe and prohibited.

These are operational security requirements, not optional release polish.

## Residual risks accepted or deferred

### Low retention/data-minimization backlog — #348

Expired/revoked auth artifacts and expired purchase intents are correctly rejected but not automatically purged on a documented schedule.

### Frontend response headers — #350

The GitHub Pages frontend lacks several desirable browser-security response headers. A real fix requires hosting/CDN/header control and must be tested against PWA/Paddle behavior.

### Missing-route 500 — #351

XServer currently returns 500 for definitely nonexistent API paths. This harms monitoring semantics and exceptional-condition clarity but is not evidence of authorization bypass.

### Static premium asset extraction — #366

Because premium lesson assets are public static/PWA resources, a technical user can retrieve them outside the ordinary UI. This is accepted for the current low-priced one-time product. It should be revisited if content value/piracy risk rises.

## Incident / operator signals

Operators should treat these as material signals:

- repeated `paddle-webhook: stage=...` 500s;
- repeated invalid signatures;
- any `outcome=quarantined`;
- any unresolved `paddle_reconciliation_blocks` row;
- any non-zero grant-backed unreconciled transaction count during cutover;
- auth mailer-unconfigured tags in Production;
- failure of release-integrity or required CI checks.

No quarantine block should be manually marked resolved without reviewing/correcting the corresponding transaction history under the Production DB Human Gate.

## Verification boundary

This threat model describes the reviewed repository architecture and the documented Production cutover.

It does not claim that migrations 0008/0009 or the matching backend are already deployed, that Paddle Live has been mutated/test-charged, or that all GitHub organization-level security settings were independently verified.

The final Human Gate remains the point where reviewed code becomes Production state.
