# Tamamizu Security & Safety Audit v1 — Threat Model

**Audit baseline:** `77c5240440bb58eba7c73ebf5b44bf94c0001f88`  
**Audit date:** 2026-09-20  
**Primary verification frame:** OWASP ASVS 5.0.0  
**Supporting methods:** OWASP WSTG 4.2, OWASP Top 10:2025, NIST SP 800-218 SSDF 1.1

This document models the shipped system before remediation. It is not a claim of ASVS certification.

## 1. System / trust boundaries

```text
Learner browser / installed PWA
  |
  | HTTPS static app/assets
  v
GitHub Pages + custom frontend domain
https://app.tamamizu.giganihongo.com
  |
  | credentialed HTTPS fetch (HttpOnly cookies)
  v
XServer PHP API
https://tamamizu.giganihongo.com/api
  |                         |
  | PDO / native prepares   | HTTPS email API
  v                         v
MariaDB                   Resend
  ^
  |
  | signed HTTPS webhook
Paddle Live

Development / delivery plane:
Developer -> GitHub -> GitHub Actions -> GitHub Pages
```

The frontend and API are distinct origins but the same site. CORS is therefore a security boundary for browser API reads; it is **not** treated as a CSRF boundary for requests that can be sent cross-origin without reading the response.

## 2. Security-sensitive assets

### High-value credentials / secrets
- Production DB credentials.
- Paddle Live webhook secret.
- Resend API key.
- Rate-limit HMAC pepper.
- Email OTP HMAC pepper.
- Raw normal-session and persistent-session credentials.
- Raw Magic Link tokens and Email OTP challenge/code pairs.
- Local SSH private key used for bounded Production read-only checks.

### Authorization / commercial state
- Full Tamamizu entitlement state.
- Paddle transaction/grant/refund/chargeback attribution.
- Single-use purchase-intent correlation values.
- Persistent-session revocation state.

### Personal / operational data
- Account email addresses and internal user ids.
- Purchase identifiers/status needed for entitlement/refund handling.
- Security/operational logs.
- Learning progress and settings in browser local storage.

## 3. Adversaries considered

1. **Unauthenticated internet attacker** — probes public API endpoints, sends malformed/replayed requests, attempts login/email abuse, and tries to forge Paddle events.
2. **Malicious or compromised website** — runs JavaScript in another origin and attempts CSRF/login-CSRF/email-send abuse against the API.
3. **Malicious authenticated buyer** — tries to read another account, forge entitlement, create excessive server state, or bypass the paywall.
4. **Client-side tamperer** — modifies JavaScript/runtime state, calls static routes/assets directly, or inspects the public bundle/source repository.
5. **Supply-chain attacker** — compromises an npm dependency, GitHub Action tag, third-party analytics script, or CI integration.
6. **Accidental operator/configuration error** — mixes Paddle environments, exposes dev endpoints, weakens CORS, commits secrets, or deploys the wrong server tree.
7. **External-service failure / event disorder** — delayed, duplicated, stale, missing, or reordered Paddle/email/network events.
8. **Compromised browser/device** — can use whatever credentials that device legitimately holds; HttpOnly is expected to reduce script access, not protect against a fully compromised device.

## 4. Primary abuse cases

### Authentication
- Spam a victim with OTP/Magic Link emails.
- Exhaust a victim's email-level request quota or invalidate their latest OTP.
- Brute-force a six-digit code or race concurrent guesses.
- Reuse an expired/already-consumed Magic Link or OTP challenge.
- Plant an attacker session into a victim browser (login CSRF).
- Steal/replay a normal or persistent session.
- Use conflicting Bearer + cookie credentials to confuse endpoint identity.
- Retain access after logout/sign-out-other-browsers.

### Authorization / paid access
- Supply another user's id/product id to an entitlement API.
- Forge/guess a purchase reference.
- Reuse one purchase intent for multiple transactions.
- Forge Paddle webhook payloads or replay genuine events.
- Exploit duplicate/out-of-order refund/chargeback events.
- Mix Sandbox and Live configuration.
- Make a failed promo fall back to full price unexpectedly.
- Tamper with the client-side commercial gate to display bundled paid content.

### Injection / browser
- SQL injection through request fields or Paddle payload fields.
- XSS/HTML injection through route/query/data values.
- Open redirect or unsafe external link.
- Malicious service-worker/cache behavior.
- Third-party script compromise or unreviewed script host.

### Availability / resource abuse
- High-volume auth requests/email sends.
- Unbounded creation of purchase intents/session/challenge history.
- Repeated malformed/missing API paths generating 5xx/log noise.
- Slow/duplicate Paddle webhook processing.

### Supply chain / delivery
- Mutable GitHub Action tag changes upstream after review.
- Over-permissioned GITHUB_TOKEN.
- Vulnerable npm/transitive package introduced.
- Secret accidentally committed or exposed in a frontend build.
- Public pull request triggering privileged/costly AI workflows.

## 5. Existing security invariants to preserve

- Browser never supplies the user id used to create an entitlement-bearing purchase intent.
- `purchase_ref` is random, single-use, time-limited, stored only as a hash by Tamamizu, and is separate from public promo data.
- Entitlement is granted/revoked only from a signature-verified Paddle webhook path.
- Paddle events are idempotent and stale/out-of-order status changes cannot overwrite newer grant state.
- Raw session, persistent-session, Magic Link, and OTP challenge tokens are not stored in plaintext in Production tables.
- Production Web session credentials are in Secure + HttpOnly + SameSite=Lax + host-only `__Host-` cookies.
- Exact-origin CORS allowlisting is used; no wildcard credentialed CORS.
- Production source release excludes dev-only HTTP endpoints, tests, SQL and the legacy fixed-Sandbox-user entitlement endpoint.
- Production runtime contains no direct AI-provider dependency/endpoint.
- Error logging avoids request payloads, email addresses, raw auth/payment tokens and secret values.
- Main is protected by an active GitHub ruleset with strict required `verify`, `browser-smoke`, and `pre-live-safety` checks and no bypass actor.

## 6. Explicit limitations / non-goals

- A static client application cannot make client-bundled course material secret from a technically capable user. Tamamizu's current commercial gate controls ordinary product access/UX; it is not DRM. Strong server-enforced confidentiality for paid lesson data would require a different content-delivery architecture.
- The audit does not attempt destructive Production exploitation, brute force, real charges/refunds, secret extraction, database mutation, or high-volume scanning.
- Third-party provider internals (Paddle, Resend, GitHub Pages, browser speech recognition) are treated as external trust dependencies; the audit checks Tamamizu's integration boundaries, not those providers' internal systems.
