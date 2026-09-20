# Tamamizu Security Threat Model v1

**Date:** 2026-09-20  
**Audit parent:** GitHub Issue #341  
**Original audit baseline:** `77c5240440bb58eba7c73ebf5b44bf94c0001f88`  
**Source state when this draft was created:** `85ced65b65a508b3094ab7e49fafec65209c3928`

This document describes the security model of **Tamamizu: Hiragana & Katakana**. It is a threat model, not a claim of OWASP ASVS certification.

## 1. System and trust boundaries

```text
Learner browser / installed PWA
        |
        | HTTPS
        v
GitHub Pages static frontend
app.tamamizu.giganihongo.com
        |
        | cross-origin HTTPS + exact-origin CORS
        | HttpOnly session / remember cookies in Production Web
        v
XServer PHP API
tamamizu.giganihongo.com/api
   |                |                 |
   | PDO            | HTTPS           | HTTPS webhook
   v                v                 v
MariaDB          Resend             Paddle
accounts,        OTP/email          checkout,
sessions,                           payments,
entitlements                        refunds
        ^
        |
GitHub repository / Actions / Pages deploy
```

The following boundaries are security-relevant:

| Boundary | Untrusted side | Trusted side / decision point | Primary controls |
| --- | --- | --- | --- |
| Browser → static frontend | browser state, URL parameters | bundled application code | React escaping, no direct HTML injection sinks found, PWA update prompt |
| Browser → API | request body, headers, Origin, cookies | PHP entrypoints | exact-origin CORS, Origin checks on cookie/state-changing paths, input validation, prepared SQL |
| Authentication email → API | OTP / magic-link bearer secret | auth repositories | short expiry, single-use atomic consume, attempt/rate limits, hashed/HMAC storage |
| Session cookies → account | stolen/replayed cookie | session resolver | Secure/HttpOnly/SameSite=Lax/`__Host-`, server-side expiry/revocation, ambiguous-credential rejection |
| API → MariaDB | application queries | repositories | PDO native prepared statements, transactions, uniqueness constraints |
| Paddle → webhook | arbitrary internet POST | signature verifier | signature verification before parsing/DB access, idempotent event claiming, server-side product matching |
| Browser → Paddle Checkout | client-visible checkout data | Paddle + signed webhook result | client never grants entitlement; purchase attribution uses server-created `purchase_ref` |
| XServer → Resend | email destination/content | mail provider | server-only API credential; OTP/magic-link secret not logged |
| GitHub PR → CI | PR body/code/dependencies | Actions workflows | main ruleset, required checks, full-SHA Action pins, owner-gated paid Claude review, CodeQL, Dependabot |
| Dev harness → auth test secrets | development browser | dev-only endpoints | excluded from Production release, `DEV_HARNESS_ENABLED` defaults closed, no-store; POST-only hardening tracked in #360 |

## 2. Security assets

Highest-value assets are:

- Paddle webhook secret, database credentials, Resend credential, and any Production-only configuration.
- Raw session tokens, persistent-login tokens, OTP codes, magic-link tokens, and purchase attribution references.
- User identity data, especially normalized email addresses.
- Entitlement state, Paddle transaction/grant/refund reconciliation state, and purchase history needed to prevent double grants or incorrect unlocks.
- Repository write authority, GitHub Actions credentials, deploy authority, and paid AI credentials.
- Application availability and integrity.
- Local learner progress. This is lower sensitivity than account/payment credentials but should not be destroyed by ordinary updates.

## 3. Threat actors and capabilities

The model assumes attacks may come from:

- an unauthenticated internet user able to send arbitrary HTTP requests;
- a malicious website able to cause a learner's browser to make cross-site requests;
- an attacker who obtains one client credential but not another;
- a customer attempting to unlock Full Access without a completed valid Paddle transaction;
- replayed, duplicated, delayed, forged, or out-of-order webhook events;
- a malicious or compromised dependency / GitHub Action;
- an untrusted pull-request author attempting to obtain write authority or consume paid CI resources;
- accidental maintainer/AI mistakes, including environment mismatch, unsafe deployment, secret exposure, or destructive Production writes.

The threat model does **not** assume a fully compromised learner device, GitHub owner account, XServer account, Paddle account, Resend account, or database administrator can be contained by application code alone.

## 4. Core security invariants

The following invariants must remain true:

1. **Entitlement is server-authoritative.** URL parameters, promo codes, frontend state, checkout callbacks, or local storage never grant Full Access.
2. **Identity is server-derived.** Real account/entitlement endpoints do not accept a client-selected user id as authorization.
3. **Paddle events are authenticated before trust.** A webhook body is not parsed into trusted business state until signature verification succeeds.
4. **One-time credentials are actually one-time.** Magic links, OTP challenges, purchase intents, and webhook claims use atomic conditional updates / uniqueness constraints rather than vulnerable read-then-write checks.
5. **Credential disagreement fails closed.** Bearer and cookie credentials that disagree are not silently resolved through another credential source.
6. **Production Web session secrets stay outside JavaScript.** Session and remember credentials use HttpOnly cookies; dev/native Bearer transport does not persist tokens in Web Storage.
7. **Cross-site browser authority is explicit.** Credentialed CORS never uses `*`; state-changing cookie paths validate Origin in addition to SameSite protections.
8. **Secrets do not enter repository history or normal logs.** Production configuration is untracked; exception messages that may contain secrets/PII are not logged.
9. **Ordinary releases do not overwrite host-owned secret/config files.** In particular, Production `api/config.php` and root `api/.htaccess` are outside the normal release set.
10. **AI/CI cannot spend money or mutate Production implicitly.** Real charges/refunds, Paddle Live mutations, Production DB writes, Production secrets/DNS/backend deploys remain Human Gates.
11. **Third-party CI code is immutable at execution time.** External Actions are pinned to full commit SHAs; update discovery is delegated to Dependabot.

## 5. Principal abuse cases and controls

### Account takeover / OTP guessing

Controls include CSPRNG OTP generation, HMAC-protected OTP storage bound to the opaque challenge, short expiry, per-challenge attempt caps, per-email and per-IP request rate limits, atomic single-use consumption, and server-side sessions. Magic-link tokens use 256-bit randomness and are stored only as hashes.

Residual risk: compromise of the user's email account defeats email-based possession authentication.

### Login CSRF / cross-origin state mutation

Cookie-mode verification rejects non-allowlisted Origin before consuming the login credential. Logout, sign-out-others, and purchase-intent paths also Origin-check cookie or remember-cookie requests. SameSite=Lax is defense-in-depth rather than the sole control.

Public email-request endpoints reject a **present** non-allowlisted Origin before processing the email request; rate limits remain in place for direct/no-Origin clients.

### Session theft / persistent-login theft

Cookies are host-only, Secure, HttpOnly, SameSite=Lax, and server-revocable. Persistent sessions have a bounded per-user active count and LRU eviction.

Residual risk: persistent tokens are not rotated on every refresh. A stolen valid remember cookie can remain useful until expiry/revocation. This is a documented design trade-off rather than a demonstrated bypass.

### IDOR / unauthorized entitlement lookup

Real entitlement reads derive the user from the validated session. The legacy fixed-user Sandbox PoC is excluded from the Production release. Purchase intent creation binds a random reference to the authenticated user server-side.

### Fake purchase / webhook forgery / replay

Paddle webhook signature verification precedes body trust. Product/price expectations are checked against server config. Event claiming and grant creation use database uniqueness and transactions. Purchase intents are one-time and expire. Duplicate and concurrent deliveries are no-ops after the first valid claim.

### Refund / chargeback reordering

Refund/adjustment handling uses pending adjustments and timestamp/status ordering so a late or duplicate event cannot incorrectly restore access or double-apply a lifecycle transition.

### XSS / credential exfiltration

The audit found no `dangerouslySetInnerHTML` or direct application `innerHTML` assignment in the frontend. Production Web auth credentials are HttpOnly, reducing the impact of a frontend script bug on session-token disclosure. API responses emit restrictive browser hardening headers in source after #346; activation on Production requires the normal backend deployment Human Gate.

Residual risk: GitHub Pages does not currently provide the desired custom response headers for the static frontend; tracked in #350.

### Supply-chain compromise

External GitHub Actions are pinned to full SHAs. Dependabot tracks npm and Actions updates. CodeQL analyzes JavaScript/TypeScript. PR Verify uses lockfile-based `npm ci`. The paid Claude review path requires a repository-owner event and exact opt-in marker.

Residual risk: PHP is not covered by CodeQL in this repository and still relies on tests/manual review. GitHub secret-scanning/push-protection settings were not readable through the available integration and require UI verification.

### Resource exhaustion / long-lived data

Authentication request rates are bounded by IP/email throttles. However, expired/settled authentication rows and some expired purchase intents are not yet routinely pruned. This is a long-horizon operational/privacy risk tracked in #348, not an immediate authentication bypass.

## 6. Production-only assumptions and Human Gates

Application code cannot safely prove or change the following without human-controlled Production access:

- actual XServer secret/config values and whether root `api/.htaccess` contains host-specific `SetEnv`/rewrite directives;
- HSTS at the TLS-terminating hosting layer;
- Production backend upload/rollback;
- DNS/CDN changes needed for frontend response-header control;
- Production database cleanup/cron changes;
- Paddle Live configuration or real monetary transactions;
- secret-scanning/push-protection/fork-workflow approval settings not exposed by the available GitHub integration.

These are treated as explicit operational gates, not silently assumed PASS.

## 7. Change triggers

Re-run or amend this threat model when any of these changes:

- a new auth method, social login, password flow, or account-recovery path;
- a new payment provider, subscription model, Paddle customer-portal integration, or server-side Paddle API key;
- a new Production database writer or background job;
- moving frontend/API hosting, adding a CDN/WAF, or changing cookie/domain topology;
- introducing user-generated HTML/content, file uploads, or a new external analytics/feedback provider;
- changing entitlement rules, promo authority, webhook event types, or refund semantics;
- granting autonomous agents broader repository, workflow, Production, or paid-service permissions.
