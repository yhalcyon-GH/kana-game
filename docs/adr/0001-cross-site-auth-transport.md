# ADR 0001: Cross-site auth transport for Tamamizu's frontend/API split

**Status:** Decision deferred (human checkpoint). This ADR frames the
options; it does not choose one.

## Context

Tamamizu's frontend is deployed to GitHub Pages and its API (Phase 2's
Paddle webhook/entitlement endpoints, and Phase 3A's new auth
endpoints) is deployed to Xserver. These are different origins — a
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

### Option A — Bearer token, browser-held

No cookies. Works identically across Safari/iOS/Chrome/PWA, since none
of the cross-site cookie restrictions apply to a bearer header. Open
sub-question: where a production bearer token should live across
reloads (in-memory with a refresh-token dance, or an XSS-hardened
storage strategy) is separate from "bearer vs. cookie" and is also not
decided here.

### Option B — `SameSite=None; Secure` cookie

Familiar browser-managed model, `HttpOnly` would make it XSS-immune,
but is exactly the pattern most exposed to Safari ITP and the general
industry direction against third-party cookies for a cross-site
PWA-capable app.

### Option C — Migrate the frontend to a same-site (sub)domain

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
explicit expiry — transport-agnostic) and `SessionTransport`, a
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
a production browser transport is chosen** — a persistent transport
(Option A with durable storage, or Option B/C) will need its own
explicit session-lifetime decision, informed by that transport's actual
theft/exposure risk profile, not simply inherited from this provisional
default.

## Consequences of deferring

PR C's `/account-test` harness holds its bearer token in memory only,
meaning the harness "logs out" on every page reload. No production
login flow exists yet; this ADR's resolution is a prerequisite for
building one.
