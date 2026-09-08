# Phase 3A PR C — dev-only end-to-end auth/purchase harness

Provides a development-only browser path proving, end to end, against a
real deployed backend: Magic Link → session → current user → purchase
intent → Paddle Sandbox checkout → signed webhook → entitlement —
**without choosing the final production session transport.** Builds on
PR B ([`docs/paddle-auth-phase3a-pr-b.md`](paddle-auth-phase3a-pr-b.md))
and PR A ([`docs/paddle-auth-phase3a-pr-a.md`](paddle-auth-phase3a-pr-a.md)).

## Scope

**In this PR:** `/account-test` and `/verify` frontend routes
(development-only), the dev-only Magic Link retrieval mechanism
(`dev_harness_magic_links` table, `DevHarnessMailer`,
`server/dev-only/last-magic-link.php`), production-build exclusion
tests.

**This is not a production decision.** The production browser session
transport remains deferred — see
[`docs/adr/0001-cross-site-auth-transport.md`](adr/0001-cross-site-auth-transport.md).
This PR's session token lives in-memory only
(`InMemorySessionTransport`) and is lost on every page reload, which is
acceptable for a manual dev harness but says nothing about the eventual
production behavior.

## New frontend routes (development-only)

| Route | Purpose |
|---|---|
| `/account-test` | The harness UI: request a test Magic Link, retrieve it (dev-only), see the authenticated user, create a purchase intent, check server-verified entitlement, log out. |
| `/verify` | Reads the raw magic-link token from the URL query (inside the hash — see below), strips it from history, POSTs it to `verify.php`, stores the returned session token in memory. |

Both routes use the exact same compile-time exclusion pattern already
proven for `/paddle-test`: `import.meta.env.DEV` gates both the dynamic
`import()` and the route registration in `src/App.tsx`, so a production
build contains no reference to either module at all — not merely a
route that 404s. Neither route is linked from navigation. See
`src/App.accountTest.test.tsx`.

## Magic-link token transport

The production-shaped transport (built in PR A, exercised here):
`<frontend-base>/#/verify?token=<raw>`. Because this app uses
`HashRouter`, everything after `#` — including the `?token=` query
string — lives entirely in the URL fragment, which a browser never
sends to any HTTP server. `VerifyPage`:

1. Reads `token` from the route's query params.
2. **Synchronously**, before the async verify call, strips the token
   from the visible URL/history via `history.replaceState()`.
3. POSTs the token to `verify.php` in the request body (never a query
   string).
4. Stores the returned session token only in `InMemorySessionTransport`
   — never `localStorage`/`sessionStorage`, never back into a URL.

See `src/routes/VerifyPage.test.tsx` for tests proving each of these
properties individually, including that the history strip happens
before the network call resolves.

## Dev-only Magic Link retrieval

`FakeMailer` cannot bridge separate PHP-FPM/CGI requests (no shared
memory), and this phase sends no real email. The dev-only mechanism:

- **`dev_harness_magic_links`** (additive migration,
  `server/sql/migrations/0003_dev_harness_magic_links.sql`) — the
  **only** table in this codebase that intentionally stores a raw
  (unhashed) magic-link URL. Scoped narrowly: gated on
  `DEV_HARNESS_ENABLED`, consumed (deleted) on successful read, never
  read by any production code path.
- **`DevHarnessMailer`** (`server/src/DevOnly/DevHarnessMailer.php`) —
  implements `Mailer`; `request-link.php` substitutes it for its usual
  inline no-op `Mailer` **only** when `DEV_HARNESS_ENABLED` is the
  exact string `'true'`.
- **`server/dev-only/last-magic-link.php`** — `GET ?email=<normalized>`,
  refuses every request with `403` when the harness is disabled (the
  default), matching an exact normalized-email lookup, never a list of
  all pending links.

`DEV_HARNESS_ENABLED` defaults to unset/false — proven by
`server/tests/ConfigTest.php`'s explicit self-check. `server/dev-only/`
must be excluded from the production Xserver deployment manifest (see
Phase 2's own `server/tests/`/`server/sql/` exclusion precedent in
`docs/paddle-webhook-poc.md`); the config flag is the second,
independent layer of protection in case that exclusion is ever missed.

## `/account-test` flow

1. Enter an email, request a test Magic Link.
2. Retrieve the dev-only link (requires `DEV_HARNESS_ENABLED` on the
   server) and follow it.
3. `/verify` completes, session stored in memory, back to
   `/account-test`.
4. Shows the authenticated user (`GET /api/auth/me.php`).
5. Create a purchase intent (`POST /api/purchase-intent.php`) — the
   returned `purchase_ref` is the only identifier meant to reach Paddle
   customData for the real-user path.
6. Complete the existing Paddle Sandbox checkout on `/paddle-test`
   using that `purchase_ref` (manual step — the two dev routes are not
   wired together automatically in this PR).
7. Check entitlement (`GET /api/entitlement-me.php`) — always the
   server-verified state; a client-side `checkout.completed` event is
   never treated as entitlement, matching Phase 1/2's existing
   diagnostic-only framing.
8. Log out; confirm authenticated actions are no longer available.

## Production-exclusion proof

- `/account-test` and `/verify` absent from a production build (no
  dynamic import reference at all — `src/App.accountTest.test.tsx`).
- `server/dev-only/last-magic-link.php` returns the same generic `403`
  whenever `DEV_HARNESS_ENABLED` is not exactly `'true'`.
- `DEV_HARNESS_ENABLED` defaults to null/false with no config value set
  (`server/tests/ConfigTest.php`).
- No `localStorage`/`sessionStorage` writes anywhere in the harness
  (`VerifyPage.test.tsx`, `sessionTransport.test.ts`).
- No raw session token or `purchase_ref` ever placed in a URL.
- Paddle `customData` carries `purchase_ref` only — no
  `internal_user_id` field anywhere in the harness UI or its tests.
- Entitlement is read only from `entitlement-me.php`; never inferred
  from a client-side Paddle event.

## Tests

`php server/tests/run-tests.php` (backend dev-harness pieces) and
`npm test` (frontend). Run `npm run verify` for the full candidate.

## Deployment status

**Not deployed.** No XServer deployment, no schema execution, no real
Paddle Sandbox interaction happens in this PR.
