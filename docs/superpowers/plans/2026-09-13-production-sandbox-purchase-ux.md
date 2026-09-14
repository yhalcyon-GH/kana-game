# Checkpoint E2 Production Sandbox Purchase UX Implementation Plan

> **For agentic workers:** use subagent-driven development task by task. Each
> task is implemented with a failing test first, focused green verification,
> commit, and independent scoped review before the next task.

**Goal:** Add the production `/account` Paddle Sandbox purchase experience while preserving server-verified entitlement as the only paid-access authority.

**Architecture:** Share a pure Sandbox validator and framework-independent checkout controller between the dev harness and production Account. Route every entitlement verification, including purchase polling, through an invalidation-safe EntitlementProvider refresh primitive that returns its applied result.

**Spec:** `docs/superpowers/specs/2026-09-13-production-sandbox-purchase-ux-design.md`

## Global constraints

- Paddle Sandbox only; no Live fallback, credential, or transaction.
- Only server-verified `entitlement.active === true` unlocks paid content.
- E1A/E1B policy, gates, progression, SRS, mastery, Recommended Path, and learning storage remain unchanged.
- Raw `purchase_ref` exists only in controller memory and Paddle `customData`.
- No production deploy or GitHub repository Variable value mutation.
- Stale callbacks/responses are invalidated on logout, unmount, pre-completion checkout close, explicit Account cancellation, new attempt, and signed-out transition; a post-completion overlay close is stale and cannot cancel server confirmation.

### Task 1: Production-capable Sandbox config and Pages wiring

**Files:**
- Modify: `src/lib/paddle/sandboxConfig.ts`
- Modify: `src/lib/paddle/sandboxConfig.test.ts`
- Modify: `.github/workflows/deploy.yml`
- Modify: `src/deployWorkflow.test.ts`

- [ ] Add failing tests for production Sandbox validity, missing environment, Live/production, non-test tokens, malformed price ids, and absence of secret build variables.
- [ ] Extract pure validation while preserving the dev-only reader.
- [ ] Add a production-capable reader with no fallback.
- [ ] Wire only the three public Sandbox Variables into the Pages build.
- [ ] Run focused tests and `git diff --check`.

### Task 2: Invalidation-safe Provider refresh and cookie purchase intent

**Files:**
- Modify: `src/components/EntitlementContext.ts`
- Modify: `src/components/EntitlementProvider.tsx`
- Modify: `src/components/EntitlementProvider.test.tsx`
- Modify: `src/lib/auth/productionAuthClient.ts`
- Modify: `src/lib/auth/productionAuthClient.test.ts`

- [ ] Add failing tests for applied/unavailable/stale refresh results, active-only server transition, stale refresh invalidation, logout race, and cookie-auth purchase intent result types.
- [ ] Make the shared Provider verification primitive return its applied/unavailable/stale result and preserve authenticated state during non-disruptive temporary failures.
- [ ] Ensure `markSignedOut()` invalidates every in-flight refresh.
- [ ] Add production `createPurchaseIntent()` using `credentials: include`, no identity/product body, and strict response parsing.
- [ ] Run focused Production Auth and E1A/E1B regression tests.

### Task 3: Shared checkout controller

**Files:**
- Create: `src/lib/paddle/sandboxCheckoutController.ts`
- Create: `src/lib/paddle/sandboxCheckoutController.test.ts`
- Modify: `src/routes/AccountTestPage.tsx`
- Modify: `src/routes/AccountTestPage.test.tsx`

- [ ] Add failing controller tests for initialize-once, duplicate open, exact customData, loaded/completed correlation, close/mismatch, disposal, generation invalidation, and stale old callbacks.
- [ ] Extract the existing safe lifecycle into a framework-independent controller.
- [ ] Keep raw references private to the controller and semantic events identifier-free.
- [ ] Refactor the dev harness to consume the shared controller without making it production-reachable.
- [ ] Run focused controller/harness/production-exclusion tests.

### Task 4: Production Account orchestration, polling, and UI

**Files:**
- Create: `src/hooks/useProductionSandboxPurchase.ts`
- Create: `src/hooks/useProductionSandboxPurchase.test.tsx`
- Modify: `src/routes/AccountPage.tsx`
- Modify: `src/routes/AccountPage.test.tsx` or create focused production Account tests
- Modify only shared types needed by the Provider primitive

- [ ] Add failing tests for all Account states and the full intent/open/completed/poll/active path.
- [ ] Add fake-timer race tests for no double fetch, logout, unmount, close/cancel, new attempt, stale callback, and Retry-without-new-intent.
- [ ] Add DOM/URL/localStorage/sessionStorage/IndexedDB/console exposure tests for raw `purchase_ref`.
- [ ] Implement the bounded `0,1,2,4,8,15s` polling loop exclusively through Provider refresh.
- [ ] Implement Account UI with disabled config, Paddle-source-of-truth pricing copy, and no active-user CTA.
- [ ] Run focused Account, Provider, production auth, and E1B gate tests.

### Task 5: Production bundle, browser, documentation, and final review

**Files:**
- Modify: `browser-smoke/critical-flows.e2e.js` and/or production Account smoke fixtures
- Modify: focused docs whose production behavior changed
- Add a deterministic bundle/workflow inspection test if needed

- [ ] Add a 320px production Account smoke case for inactive/config-unavailable and active states without contacting Paddle or production auth.
- [ ] Build with safe fake public Sandbox values and inspect output for Sandbox-only configuration and absence of API/webhook secret material.
- [ ] Run focused frontend tests and the PHP suite only if backend files changed.
- [ ] Run `npm run verify`, `npm run test:browser-smoke`, and `git diff --check origin/main...HEAD`.
- [ ] Inspect the full diff for policy/gate drift, storage/log leakage, stale async paths, secret exposure, and scope creep.
- [ ] Obtain a fresh-context security review and fix all blocking/important findings.
- [ ] Push and open one normal non-Draft PR; wait for exact-HEAD CI and do not merge.
