# ADR 0001: Cross-site auth transport for Tamamizu's frontend/API split

**Status:** Decided (Phase 3B). Production Web uses Option C, refined
below: a `giganihongo.com` frontend subdomain plus a host-only session
cookie on the API host. Options A/B remain documented as the
alternatives considered and rejected for this phase.

## Context

Tamamizu's frontend is deployed to GitHub Pages and its API (Phase 2's
Paddle webhook/entitlement endpoints, and Phase 3A's new auth
endpoints) is deployed to Xserver. These were different, unrelated
origins — a genuinely cross-site setup — until this decision.

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
of the cross-site cookie restrictions apply to a bearer header. Rejected
for Production Web specifically because there is no storage location for
a persistent bearer token that isn't JS-readable (localStorage/
sessionStorage/IndexedDB are all readable by any script on the page,
including a successful XSS payload) — an `HttpOnly` cookie is the only
browser-native way to hold a credential a same-origin/same-site script
cannot read at all. Bearer remains the correct model for **non-browser
transports** (native/Android, and the existing dev harness) — see
"What is NOT decided here" below.

### Option B — `SameSite=None; Secure` cookie

Familiar browser-managed model, `HttpOnly` would make it XSS-immune,
but is exactly the pattern most exposed to Safari ITP and the general
industry direction against third-party cookies for a cross-site
PWA-capable app. Rejected: unnecessary now that Option C removes the
cross-site relationship entirely, and `SameSite=None` cookies carry
CSRF and ITP-eviction risk that a same-site cookie does not.

### Option C — Frontend on a `giganihongo.com` subdomain (chosen)

Move the GitHub Pages custom domain from its current GitHub-provided
host to **`app.tamamizu.giganihongo.com`**, keeping the API at its
existing **`tamamizu.giganihongo.com`**. Both hosts share the
registrable domain `giganihongo.com`, which makes this **same-site**
(per the [HTML living standard's definition](https://html.spec.whatwg.org/multipage/browsers.html#same-site),
same registrable domain + same scheme), even though the two hosts are
still a **different origin** (different hostname) — same-site is what
governs `SameSite=Lax` cookie delivery, not same-origin. This ADR
deliberately does not conflate the two:

- **Same-origin** would require identical scheme+host+port. It is not
  achieved here and is not needed: the API and frontend remain
  separately deployed, separately hostable services.
- **Same-site** is achieved: both hosts end in `giganihongo.com`, so a
  `SameSite=Lax` cookie set by the API host is sent on top-level
  navigations and simple cross-site requests from the frontend host,
  without needing `SameSite=None`.
- **CORS is still required.** Same-site does not imply same-origin;
  the browser still enforces the Same-Origin Policy for
  `fetch`/`XHR`, so the API must still return correct
  `Access-Control-Allow-Origin`/`-Credentials` headers for the exact
  frontend origin (see the CORS/CSRF design in Phase 3B's PR).

This preserves every existing piece of infrastructure:

- GitHub Pages hosting and its current auto-deploy workflow are kept
  as-is — only the *custom domain* attached to the existing Pages site
  changes, not the deployment mechanism.
- The API keeps its current Xserver host, path (`/api/`), and every
  existing Sandbox/dev-only endpoint and behavior.
- No migration of static hosting to Xserver, and no new hosting
  provider.

And it directly solves the credential-storage problem: since the
frontend and API are now same-site, the API can set a `Secure;
HttpOnly; SameSite=Lax` session cookie **scoped to its own host only**
(no `Domain` attribute — see "Host-only, not domain-wide" below), which
the browser attaches automatically on `fetch(..., credentials:
'include')` calls from the frontend, and which no frontend JavaScript
can ever read, write, or exfiltrate.

## Host-only, not domain-wide

The session cookie is set **without** a `Domain` attribute, making it
**host-only**: attached only to requests to the exact API host
(`tamamizu.giganihongo.com`), never to `app.tamamizu.giganihongo.com`,
never to `giganihongo.com` itself, and never to any other current or
future subdomain under `giganihongo.com`. Explicitly rejected:
setting `Domain=.giganihongo.com` to make the cookie visible across all
subdomains. That would turn every current and future subdomain of
`giganihongo.com` into a party that can trigger authenticated requests
carrying this cookie, and would make the cookie's blast radius grow
every time an unrelated subdomain is added — a session-fixation/scope
surface this decision does not need to accept for zero benefit (the API
host is the only host that ever needs to read this cookie).

The cookie name uses the `__Host-` prefix
(`__Host-tamamizu_session`), which is a browser-enforced guarantee of
exactly this: the `__Host-` prefix is rejected by the browser unless
the cookie has no `Domain` attribute, has `Path=/`, and is set over
`Secure` — turning "no Domain attribute" from a convention this code
must remember into something the browser itself refuses to violate.

## Recommendation (superseded)

The prior draft's non-binding recommendation of Option A (bearer,
browser-held) is superseded for the Production Web transport
specifically, now that Option C removes the cross-site cookie problems
Option A was chosen to avoid. Option A remains the correct choice for
transports that are not a browser page — see below.

## What is NOT decided here

This ADR decides the **Production Web browser transport only**. It
does not change:

- The backend's underlying session model (hash-at-rest tokens,
  revocable, explicit expiry) — unchanged, transport-agnostic, and now
  shared by both credential shapes below.
- **Bearer tokens remain the transport for non-Production-Web
  callers**: the existing dev-only harness (`/account-test`,
  `InMemorySessionTransport`) and any future native/Android client.
  Phase 3B's credential resolver accepts *either* an `Authorization:
  Bearer` header or the production session cookie, never assumes which
  one a given deployment uses, and treats the two being present
  simultaneously with different session identities as an ambiguous,
  rejected credential rather than silently preferring one.
- Google Play Billing, Paddle Live, real-money purchases, or curriculum
  locking — all remain out of scope, unaffected by this transport
  decision.

## Provisional session expiry: 24 hours (unchanged)

`SESSION_EXPIRY_HOURS` remains **24 hours** in this phase. The original
provisional-24h rationale (no refresh/rotation system yet to bound a
longer-lived credential's exposure) still applies even though Production
Web now has a persistent (cookie-backed) session across reloads, which
is a materially different risk profile than the in-memory-only bearer
token this value was first chosen alongside. This ADR deliberately does
**not** extend the expiry as a side effect of adding cookie transport —
that is a separate decision this phase does not make, to be revisited
once there is real production usage data (actual re-login friction at
24h) to weigh against the now-real exposure window a stolen/replayed
session cookie would have. Extending it without that data would be
guessing at a security/UX tradeoff this phase has no evidence for.

## Consequences

- The `/account-test` dev harness's bearer-in-memory behavior is
  unchanged and continues to "log out" on every page reload — this ADR
  does not touch it.
- A production login flow now exists this ADR is a prerequisite for.
- Should a future need arise to share the session across multiple
  `giganihongo.com` subdomains (e.g. an additional app under a sibling
  subdomain), that is a **new** decision, not an automatic consequence
  of this one — see "Host-only, not domain-wide" above.
