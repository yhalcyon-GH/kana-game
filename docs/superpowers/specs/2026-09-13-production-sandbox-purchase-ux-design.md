# Checkpoint E2 Production Sandbox Purchase UX Design

## Goal

Add a Paddle Sandbox-only purchase flow to the production `/account` page:

`signed-out -> login -> inactive -> purchase intent -> Sandbox Checkout -> processing -> signed transaction.completed webhook -> entitlement polling -> active -> paid curriculum unlock`

Only a server-verified `entitlement.active === true` response may unlock paid
content. Paddle client events never grant access. E1A/E1B entitlement policy,
commercial gates, progression, SRS, mastery, Recommended Path, and persisted
learning data remain unchanged.

## Non-goals and release boundary

- No Paddle Live environment, credential, transaction, price, or fallback.
- No real-money purchase or refund.
- No production deployment or GitHub repository Variable value changes in this PR.
- No pricing calculation in Tamamizu; Paddle Checkout is the price/tax/total source of truth.
- No changes to the existing signed-webhook grant/refund model or production database.

## Sandbox configuration

The existing Paddle config module will expose one pure validator shared by:

- the existing development harness reader, which stays development-only; and
- a production-capable Sandbox Checkout reader used by `/account`.

Configuration is valid only when all three public build values are present and:

- `VITE_PADDLE_ENVIRONMENT` is exactly `sandbox`;
- `VITE_PADDLE_CLIENT_TOKEN` starts with `test_`; and
- `VITE_PADDLE_PRICE_ID` starts with `pri_`.

Missing environment, missing values, `production`/`live`, non-test tokens, and
malformed price identifiers all fail closed. There is no Live default or
fallback. Paddle API keys and webhook secrets are never accepted by frontend
configuration.

The GitHub Pages workflow will pass only these public repository Variables into
the build. Their real values remain unset by this PR. Invalid or absent values
produce a disabled Account CTA and a clear `Sandbox configuration unavailable`
message.

## Production purchase intent

`productionAuthClient` will add a cookie-authenticated purchase-intent request:

- `POST {apiBase}/purchase-intent.php`;
- `credentials: 'include'`;
- no browser-supplied user or product;
- typed `created`, `signed-out`, and `unavailable` results.

The existing endpoint resolves the user from the HttpOnly session cookie and
fixes the product to `full_tamamizu`; no backend change is needed.

The raw `purchase_ref` may exist only inside controller memory and in the
`customData: { purchase_ref }` argument sent to Paddle. It must never appear in
the DOM, URL, localStorage, sessionStorage, IndexedDB, console, analytics, or
application logs. It is cleared on every terminal/invalidating lifecycle event.

## Shared Sandbox Checkout controller

Extract the safe checkout lifecycle from the development Account harness into a
framework-independent controller shared by the harness and production Account
orchestration. The controller owns:

- one cached Paddle initialization promise per mounted controller;
- a synchronous duplicate-open guard;
- the current in-memory purchase reference;
- the transaction id learned from `checkout.loaded`;
- strict correlation of both transaction id and purchase reference;
- close-on-mismatch behavior; and
- close/dispose/invalidation cleanup.

Each production CTA activation creates exactly one purchase intent and opens at
most one checkout with that reference. `customData` contains only
`purchase_ref`. A correlated `checkout.completed` emits a processing signal;
it does not update entitlement. A mismatch, stale event, close, or cancellation
cannot produce a completion signal.

Paddle.js is loaded lazily only after a valid configuration and authenticated
purchase attempt. Initialization always receives `environment: 'sandbox'`.

## Entitlement refresh single source

Server verification and app-state application remain owned by
`EntitlementProvider`. Its shared refresh primitive will:

- execute the existing current-user and entitlement verification path;
- apply only the result belonging to its current request generation;
- return an explicit `applied`, `unavailable`, or `stale` result to its caller; and
- transition to `active` only after a server response explicitly contains
  `active: true`.

Startup refresh, focus refresh, Account Retry, purchase confirmation polling,
and login follow-up use this same primitive. Purchase polling must not call
`entitlement-me.php` independently and then call Provider refresh for a second
fetch. Each polling attempt invokes the Provider primitive exactly once and
uses its returned result. An `inactive` result continues polling; an `active`
result ends polling and unlocks through the state already applied by that same
request.

The provider will support non-disruptive polling refreshes that preserve the
current authenticated presentation while verification is in flight and when a
poll is temporarily unavailable. The caller receives `unavailable` and may
continue its bounded schedule; ordinary startup/manual/focus behavior keeps its
established state semantics.

## Bounded polling and Account orchestration

After a strictly correlated completion, Account enters `Processing purchase…`
and calls the shared Provider refresh primitive at delays:

`0s, 1s, 2s, 4s, 8s, 15s`

This is bounded to about 30 seconds. `active` ends processing. Repeated
`inactive` or temporary `unavailable` results end at
`Still confirming your purchase` with a Retry action. Timeout does not claim
payment failure. Retry restarts only entitlement confirmation for the existing
completed attempt; it never creates another purchase intent. Reload/account
revisit discards client orchestration state and restores entitlement from the
server through normal Provider startup refresh.

## Stale async invalidation

Provider refreshes and purchase orchestration each use a monotonically
increasing generation and, where useful, an AbortController. Results and Paddle
callbacks apply only when their captured generation still matches.

The current attempt is invalidated on:

- logout;
- component unmount;
- checkout close/cancel;
- start of a new purchase attempt; and
- any transition of the authenticated session to signed-out.

Invalidation closes an open checkout, cancels/wakes pending polling waits,
clears raw correlation values, and prevents late callbacks or responses from
changing UI or entitlement. In particular, an in-flight polling response may
not restore `active` after logout, and an old checkout callback may not affect a
new attempt.

Provider `markSignedOut()` invalidates all earlier Provider refresh generations
before applying signed-out. A stale Provider response is returned as stale and
cannot mutate state.

## Account states

- `loading`: existing session check presentation.
- `signed-out`: `Sign in`.
- `inactive`: `Full Tamamizu`, Sandbox test purchase CTA, and Paddle-as-price-source copy.
- `preparing/open`: CTA disabled; duplicate intent/open prohibited.
- `processing`: `Processing purchase…`; no purchase CTA.
- `still-confirming`: `Still confirming your purchase` plus Retry confirmation.
- `active`: `Full Tamamizu: Active`; purchase CTA absent.
- `unavailable`: `Couldn’t verify access` plus Retry.
- invalid/missing Sandbox config: disabled CTA plus `Sandbox configuration unavailable`.

Logout closes/invalidates checkout and polling before clearing Provider state.
Paid access remains governed solely by the unchanged E1B gates consuming
Provider `active` state.

## Security and regression tests

Tests must prove:

- missing environment, Live/production environment, non-test token, and invalid price fail closed;
- unauthenticated users cannot create a purchase intent;
- production intent requests use cookie credentials and no user/product body;
- one intent/open per attempt and Paddle initialization once per controller;
- loaded/completed correlation mismatch closes and never signals success;
- `checkout.completed` alone never unlocks;
- only Provider verification returning server `active: true` unlocks;
- polling an active response performs no second fetch;
- logout during in-flight polling cannot later restore active;
- unmount prevents polling/callback state updates;
- old callbacks cannot affect a new attempt;
- Retry confirmation creates no purchase intent;
- raw `purchase_ref` appears only in Paddle `customData`, never any client-visible surface;
- active users have no purchase CTA and logout clears client entitlement;
- E1B commercial gates and local-development no-production-fetch behavior remain green.

Verification also includes the existing PHP suite only if backend files change,
full `npm run verify`, browser smoke, commit-range `git diff --check`, a
production bundle inspection, 320px browser coverage, fresh-context security
review, and exact-HEAD CI.
