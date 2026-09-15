# Phase H2 — Paddle Sandbox / Live environment separation

Status: code merged (PR #225, plus a rollout-compatibility follow-up fix described below) and deployed as part of the reviewed Production API release `3b9c0a60bcf3b1ec4d95909464d32f5d959ed90f`; the local release-integrity check later confirmed that deployed API code matches that reviewed checkout. This is **not** a statement about Production configuration values: `config.php` was intentionally neither read nor changed, and any remaining configuration assessment/change is a Human Gate. **NO Live credentials are configured in this repository and no Live operation has been performed.** This document describes the architecture, the historical safe deployment sequence, and the exact steps a future, deliberate Live cutover requires — it does not perform any of them.

## What this is and isn't

This is **not** "turning on Live sales." It's the structural groundwork so that a future, deliberate Live cutover has an explicit, fail-closed config surface instead of a single flat, unscoped config that happened to hold Sandbox values. No Live product/price/webhook destination has been created in Paddle, no Live client token or API key exists in this repo or has been requested, and no real payment has been processed as part of this work.

## Frontend/backend environment agreement (closed gap)

The backend `PADDLE_ENVIRONMENT`/`PaddleEnvironmentConfig` split and the frontend `VITE_PADDLE_ENVIRONMENT`/`sandboxConfig.ts` split described below were initially built as two **independent** fail-closed systems, with nothing mechanically checking that they agree with each other before a checkout could open. That left a real failure mode: if a deployment's frontend build were ever configured for `live` while its backend `config.php` was still on `sandbox` (or vice versa), a customer could complete a real Live payment that this backend could never process the matching webhook for (wrong secret, wrong catalog) — charged, but never entitled.

This is now closed with a server-authoritative environment assertion on `POST /api/purchase-intent.php`:

- The frontend (`src/lib/auth/productionAuthClient.ts`'s `createPurchaseIntent()`, and the dev-only `src/lib/auth/authClient.ts` equivalent used by `AccountTestPage.tsx`) sends its own configured `environment` in the request body as a **claim**, never a selector.
- `server/src/Purchase/PurchaseIntentEndpoint.php` (constructed in `server/purchase-intent.php`, after `PaddleEnvironmentConfig::resolve()` has already fixed which server-side config triplet is in effect) compares that claim against the server's own authoritative environment and rejects — **before any `purchase_intents` row is created** — on any disagreement:
  - missing/malformed `environment` in the request body → `400`
  - a validly-shaped but mismatched `environment` → `409`
- The response, on success, echoes the authoritative `environment` back (`{"purchase_ref": "...", "environment": "sandbox"|"live"}`). The frontend re-checks this against its own locally configured value **even on a 200** before ever trusting `purchase_ref` — never assume agreement, always confirm.
- On any rejection or mismatch, `useProductionSandboxPurchase.ts` falls through the exact same path as any other unrecoverable intent failure (the checkout controller's own `prepare()` already fails closed on a falsy result): no checkout opens, no `purchase_ref` is stored, state becomes `unavailable`, and a fresh `start()` is required to retry — never a silent fallback.

Tests: `server/tests/Purchase/PurchaseIntentEndpointTest.php` (SQLite-backed, full behavioral coverage of every server/client environment pairing including the anti-mixing guarantee and zero-row-created-on-rejection), `server/tests/PurchaseIntentEnvironmentWiringTest.php` (source-inspection proof that the entrypoint's fail-closed ordering can't be bypassed), and extended cases in `productionAuthClient.test.ts`, `authClient.test.ts`, `useProductionSandboxPurchase.test.tsx`, and `AccountPage.test.tsx`.

## Backend

### `PADDLE_ENVIRONMENT`

A new required config key (`server/src/Config.php` / `server/config.example.php`), consumed by `server/src/PaddleEnvironmentConfig.php`. Must be the **exact string** `sandbox` or `live` — any other value (unset, empty, `production`, `Sandbox`, a typo) throws, which `paddle-webhook.php` turns into a `500` (Paddle retries) rather than guessing. There is no default.

### Environment-scoped config triplets

Each environment has its own webhook secret + price id + product id, under its own key prefix:

| Sandbox | Live |
|---|---|
| `PADDLE_SANDBOX_WEBHOOK_SECRET` | `PADDLE_LIVE_WEBHOOK_SECRET` |
| `PADDLE_SANDBOX_FULL_TAMAMIZU_PRICE_ID` | `PADDLE_LIVE_FULL_TAMAMIZU_PRICE_ID` |
| `PADDLE_SANDBOX_FULL_TAMAMIZU_PRODUCT_ID` | `PADDLE_LIVE_FULL_TAMAMIZU_PRODUCT_ID` |

`PaddleEnvironmentConfig::resolve()` reads `PADDLE_ENVIRONMENT`, then reads **only** the triplet for that one value — it never looks up the other environment's keys at all, so a config file that happens to have both triplets present (e.g. mid-migration) still can't leak the wrong one into the resolved config. Missing any key for the *selected* environment throws (fail closed) — the other environment's keys being present or absent has no effect either way.

### Superseded keys — safe, overlapping migration (not a rename)

The pre-H2 unscoped keys (`PADDLE_WEBHOOK_SECRET`, `PADDLE_FULL_TAMAMIZU_PRICE_ID`, `PADDLE_FULL_TAMAMIZU_PRODUCT_ID`) are **no longer used to select or resolve any environment** as of this PR — `PaddleEnvironmentConfig::resolve()`, the sole authority for which environment/config this app actually uses, reads `PADDLE_ENVIRONMENT` plus the scoped `PADDLE_SANDBOX_*`/`PADDLE_LIVE_*` triplet **exclusively**, and has never been changed to read these three old keys under any circumstance (see `PaddleEnvironmentConfigTest.php`'s dedicated "old keys coexist but are never used" cases). An implicit "if the old unscoped keys are present, treat them as Sandbox" fallback was considered and rejected — it's exactly the kind of implicit environment inference this phase exists to eliminate.

**`Config::load()` itself, however, does keep these three old keys loadable** (`server/src/Config.php`'s `$keys` array) — this is a **rolling-deploy compatibility layer, not an environment fallback**. An earlier revision of this PR removed the old keys from `Config::load()`'s scan list entirely, which created a real Production incompatibility (found in review, before any Production deploy): `Config.php` and `paddle-webhook.php` have a mutual dependency — the still-running pre-H2 `paddle-webhook.php` reads `PADDLE_WEBHOOK_SECRET`/`PADDLE_FULL_TAMAMIZU_PRICE_ID`/`PADDLE_FULL_TAMAMIZU_PRODUCT_ID` directly, by name, with no knowledge of Phase H2 at all — so during a manual, non-atomic, multi-file Production upload, whichever of the pair landed second would find its counterpart's needed keys gone:

| `Config.php` | `paddle-webhook.php` | Result |
|---|---|---|
| old | old | OK (current Production state) |
| new, **without** this fix | old | **500** — old webhook reads old key names; Config no longer scans for them |
| old | new | **500** — new webhook's `PaddleEnvironmentConfig::resolve()` needs `PADDLE_ENVIRONMENT` etc.; old Config doesn't scan for them |
| new, **with** this fix | old | **OK** — Config still loads the old keys too, so old webhook keeps working |
| new | new | OK (target state) |

With this fix, only the `old Config.php + new paddle-webhook.php` combination can still fail — which the upload order below avoids by uploading `Config.php` and `paddle-webhook.php` back-to-back with no other file (and ideally no pause) in between. The old, pre-H2 `purchase-intent.php` reads no Paddle config key at all, so it is unaffected by `Config.php`'s version either way.

That two-sided design — `Config::load()` loads both key generations; `PaddleEnvironmentConfig` reads only the new ones — is exactly what makes a safe **overlap migration** possible: add the new scoped keys *alongside* the old ones (never deleting or renaming them first), deploy and verify the new backend code while both key sets are present, and only then remove the old keys — so that whichever backend code version happens to be live at any single instant during the rollout, Production's webhook always has a complete, correct config to read. **A rename (delete-and-recreate in one step) is exactly what this sequence avoids.**

**Historical Production migration sequence / remaining configuration assessment:**

The code deployment described above is already complete. Do **not** repeat the upload or infer that the configuration steps below are still pending from this historical document. Before any configuration change, a human must first establish the current Production state without exposing values, take a backup, and obtain the owner's explicit approval; configuration changes, Live credentials, and all Live operations remain Human Gates.

1. **Backup** Production's `server/config.php` before any change.
2. **Add** the new Sandbox-scoped keys **alongside** the existing ones (do not remove or rename the old keys yet):
   - `PADDLE_ENVIRONMENT` = `sandbox`
   - `PADDLE_SANDBOX_WEBHOOK_SECRET` = (copy of the existing `PADDLE_WEBHOOK_SECRET` value)
   - `PADDLE_SANDBOX_FULL_TAMAMIZU_PRICE_ID` = (copy of the existing `PADDLE_FULL_TAMAMIZU_PRICE_ID` value)
   - `PADDLE_SANDBOX_FULL_TAMAMIZU_PRODUCT_ID` = (copy of the existing `PADDLE_FULL_TAMAMIZU_PRODUCT_ID` value)
   - Leave every `PADDLE_LIVE_*` key absent/blank until an actual Live cutover is deliberately planned and reviewed, separately from this migration.
   - The old `PADDLE_WEBHOOK_SECRET` / `PADDLE_FULL_TAMAMIZU_PRICE_ID` / `PADDLE_FULL_TAMAMIZU_PRODUCT_ID` keys **remain in place, unchanged**, at this point. The still-deployed pre-H2 backend code is completely unaffected by this step — it doesn't read the new keys, so their presence is a no-op for it.
3. **Verify the still-deployed pre-H2 backend is unaffected** by the config change (non-destructive smoke only): webhook `GET` → `405`, an unsigned `POST` → `401`, no `500` observed anywhere.
4. **Deploy the H2 backend runtime files, in this order**, to minimize the one unavoidable compatibility window (the `Config.php` ↔ `paddle-webhook.php` pair — see the matrix above):
   1. `server/src/PaddleEnvironmentConfig.php` — new file, not yet referenced by anything live, zero risk to upload first.
   2. `server/src/Purchase/PurchaseIntentEndpoint.php` — new file, same.
   3. `server/src/Config.php` — safe now, *because of this fix*: the still-running old `paddle-webhook.php` keeps working against this new `Config.php`, since it still loads the old unscoped keys too.
   4. `server/paddle-webhook.php` — upload immediately after step 3, back-to-back, no other upload or pause in between, to keep the window as tight as possible even though this fix means it's no longer a *breaking* window.
   5. `server/purchase-intent.php` — safe any time after step 3 (needs `Config.php` already new to resolve `PADDLE_ENVIRONMENT`, and needs steps 1–2 already uploaded).
5. **Verify the H2 backend** the same way, plus its own new surface: webhook `GET` → `405`, unsigned `POST` → `401`, auth/entitlement endpoints respond normally, an unauthenticated `purchase-intent.php` request is rejected, no `500` observed anywhere.
6. **Only after** step 5 confirms the H2 code is genuinely working against the new scoped keys, remove the now-superseded old keys from Production's `config.php`: `PADDLE_WEBHOOK_SECRET`, `PADDLE_FULL_TAMAMIZU_PRICE_ID`, `PADDLE_FULL_TAMAMIZU_PRODUCT_ID`. (Safe to also delete them from `Config::load()`'s `$keys` array in a later, separate cleanup PR once Production has fully cut over and this rolling-deploy compatibility layer is no longer needed anywhere — not done as part of this fix, to keep this change minimal.)
7. **Re-run the same smoke checks** from step 5 once more after the removal, to confirm the H2 code was never actually depending on the old keys still being present.

At every point in this sequence, whichever backend code is actually live has a complete, correct config to read — there is no window where a currently-running webhook handler is missing a key it needs. This is a config-loading/deploy-ordering fix, not an environment-selection change:
- `PaddleEnvironmentConfig` reads `PADDLE_SANDBOX_*`/`PADDLE_LIVE_*` (plus `PADDLE_ENVIRONMENT` to choose between them) **only** — unchanged by this fix, and re-proven by tests that deliberately give the old keys *different* values from the new ones to catch any accidental leak.
- `Config::load()` now loads the old keys too, purely so old, still-deployed *code* that reads them directly keeps working during the overlap window — this is `Config`'s loading behavior, not `PaddleEnvironmentConfig`'s selection logic.
- The overlap (steps 2–6) is a property of the *config file and the upload sequence*, not of either code version's environment-selection logic.

### No DB schema change

Confirmed during the H2 read-only audit: environment separation is entirely server-config-level. `transaction_grants`, `pending_adjustments`, `payment_events`, `entitlements`, `purchase_intents` are all environment-agnostic already (they key on `paddle_transaction_id`/user id, never on which Paddle environment produced them) — no migration was needed or written for this phase.

## Frontend

`src/lib/paddle/sandboxConfig.ts`, `sandboxCheckoutController.ts`, and `src/hooks/useProductionSandboxPurchase.ts` are **generalized in place** (not renamed) to accept `VITE_PADDLE_ENVIRONMENT` = `sandbox` | `live`. This was a deliberate choice: these modules and their ~860 lines of pre-existing E2/E3 regression coverage (duplicate-checkout prevention, confirmation polling at 0/1/2/4/8/15s, stale-response/logout protection, purchase_ref memory-only handling) are the primary safety asset in this codebase; renaming them would touch every import site for no behavioral benefit, and this phase's own instructions explicitly treat renaming as optional and warn against refactor-for-its-own-sake.

- Client-side token prefix is validated per environment: `test_` for sandbox, `live_` for live — per [Paddle's official client-side token docs](https://developer.paddle.com/paddle-js/about/client-side-tokens/): "Client-side tokens always start with `test_` or `live_` to show the environment they're used for."
- Paddle's own JS SDK has no `'live'` environment value — confirmed against the installed `@paddle/paddle-js@1.6.5` package's own type definitions (`Environments = 'production' | 'sandbox'`). The app-level `'live'` value (matching Paddle's own dashboard terminology and this project's config keys) is mapped to the SDK's `'production'` only at the one `initializePaddle()` call site in `sandboxCheckoutController.ts`.
- `validateSandboxConfig()` fails closed on: missing config, an environment value that isn't exactly `sandbox`/`live`, and a token prefix that doesn't match the selected environment. There is no fallback between environments at any layer.

### UI

`AccountPage.tsx` (the real Production purchase page) derives its copy from the resolved config's own `environment` field — never guessed:
- **Sandbox:** "Sandbox test purchase" button, "Preparing Sandbox Checkout…", explicit test-purchase language throughout.
- **Live:** "Buy Full Tamamizu" button, ordinary checkout language, no "Sandbox"/"Test Mode" text anywhere.
- **Invalid/absent config:** generic copy ("Purchase unavailable" / "Buy Full Tamamizu", disabled), since the environment can't be determined — never assumed to be Sandbox by default.

`src/routes/PaddleTestPage.tsx` (the Phase 2 dev-only fixed-Sandbox-user PoC harness, excluded from production builds) was **not** touched — it's explicitly, permanently Sandbox-only by design and unrelated to the real purchase path this phase covers.

## Environment matrix (backend + frontend, as implemented)

| Selected environment | Backend config read | Frontend SDK `environment` | Frontend token prefix required |
|---|---|---|---|
| `sandbox` | `PADDLE_SANDBOX_*` only | `sandbox` | `test_` |
| `live` | `PADDLE_LIVE_*` only | `production` | `live_` |
| missing/unknown | none — throws/fails closed | n/a — config invalid | n/a |

## Tests

- `server/tests/ConfigTest.php`: extended to prove `Config::load()` still reads the old, pre-H2 unscoped Paddle keys (rolling-deploy compatibility), and reads the new H2 scoped keys correctly when both generations are present at once.
- `server/tests/PaddleEnvironmentConfigTest.php` (15 cases): valid resolution for each environment, missing/unknown environment, missing individual keys per environment, the core anti-mixing guarantee — selecting one environment with only the OTHER environment's keys present throws, and selecting one environment with BOTH triplets present resolves to that environment's values only — plus dedicated rolling-deploy-overlap cases: the old unscoped keys coexisting (with deliberately different values) never leak into a `sandbox`- or `live`-resolved result, and a config carrying *only* the old keys (no `PADDLE_ENVIRONMENT`/scoped keys at all) still fails closed rather than implicitly resolving to Sandbox.
- `server/tests/Purchase/PurchaseIntentEndpointTest.php` (8 cases, SQLite-backed): every server/client environment pairing (create on match, `409`/zero-rows on mismatch, `400`/zero-rows on missing/malformed client environment), plus a mismatch never leaking into a later matching request.
- `server/tests/PurchaseIntentEnvironmentWiringTest.php` (4 source-inspection cases): proves the entrypoint's fail-closed ordering — `PaddleEnvironmentConfig::resolve()` runs, and can throw, strictly before `PurchaseIntentEndpoint` is ever constructed.
- `src/lib/paddle/sandboxConfig.test.ts`: extended for dual-environment validation, including mismatched environment/token-prefix pairs failing closed.
- `src/lib/paddle/sandboxCheckoutController.test.ts`: new cases confirming the `live` → `production` SDK mapping and that `sandbox` still maps to `sandbox`.
- `src/hooks/useProductionSandboxPurchase.test.tsx`: new cases for the hook's exposed `environment` field, a live-environment purchase attempt reaching the SDK with the mapped value, and the environment-mismatch fail-closed/recoverable behavior.
- `src/routes/AccountPage.test.tsx`: updated/extended for environment-aware copy (including "no Sandbox/Test Mode text when configured for live"), plus dedicated `409`-mismatch and mismatched-`200`-response UI tests.
- `src/lib/auth/productionAuthClient.test.ts` / `authClient.test.ts`: extended for the new request body and response re-check.

## Security guarantees carried forward from E2/E3, unchanged by this phase

purchase_ref remains memory-only (never in the URL, DOM, `localStorage`/`sessionStorage`/IndexedDB, or logs); `checkout.completed` is only permission to poll server entitlement, never a direct unlock; confirmation polling remains 0/1/2/4/8/15s; retry never creates a new purchase intent; stale async responses and logout are still correctly handled by the existing generation/abort-signal machinery in `sandboxCheckoutController.ts` and `useProductionSandboxPurchase.ts` — none of this logic was changed, only the environment/token/SDK-mapping layer around it.

## Explicitly NOT done in this phase

- No Live Paddle product/price/webhook destination created.
- No Live client token or Live API key exists anywhere in this repo, in Production config, or in any GitHub Repository Variable/Secret.
- No Production deploy, no Production config change, no Production DB change.
- No real payment, refund, or chargeback.
- H3 (actual Live cutover, once a Live catalog exists) is not started.
