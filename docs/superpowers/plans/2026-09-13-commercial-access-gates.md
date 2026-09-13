# Checkpoint E1B Commercial Access Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the E1A commercial policy across all curriculum UI and routes while preserving every progression and persisted-data calculation.

**Architecture:** Add a shared entitlement-aware route/UI gate and a separate commercial overlay for Review/Saved. Keep `useCurriculum()` and stores unchanged; every access decision delegates to `commercialAccess.ts` using canonical data relationships.

**Tech Stack:** React 19, React Router, TypeScript, Zustand, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-13-commercial-access-gates-design.md`

## Global Constraints

- Hiragana remains accessible for signed-out, loading, inactive, unavailable, and active states.
- Paid content is accessible only for active entitlement; unknown targets fail closed.
- `commercialAccess.ts` is the only free/paid policy source.
- Do not change `useCurriculum()` progression, Recommended Path, mastery, SRS, or persisted data.
- Review/Saved source categories come only from canonical row/category data; unresolved items fail closed.
- Do not add checkout, purchase intent, pricing, or Paddle UI.

---

### Task 1: Shared access decisions and gate UI

**Files:**
- Modify: `src/lib/commercialAccess.ts`
- Create: `src/lib/commercialContentSource.ts`
- Create: `src/components/CommercialAccessGate.tsx`
- Test: `src/lib/commercialAccess.test.ts`
- Test: `src/lib/commercialContentSource.test.ts`
- Test: `src/components/CommercialAccessGate.test.tsx`

**Interfaces:**
- Produces: canonical character/word source-category resolvers and a gate accepting a `CommercialAccessTarget` plus children.

- [ ] Write tests proving Hiragana remains visible in loading/unavailable, paid targets map to all locked states, Retry calls entitlement refresh, and unresolved item sources are denied.
- [ ] Run `npx vitest run src/lib/commercialAccess.test.ts src/lib/commercialContentSource.test.ts src/components/CommercialAccessGate.test.tsx` and confirm the new tests fail because the resolvers/gate do not exist.
- [ ] Implement canonical source resolution and the shared gate with Account/Sign-in/Retry actions.
- [ ] Re-run the focused command and confirm it passes.

### Task 2: Direct-route protection

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.commercialAccess.test.tsx`

**Interfaces:**
- Consumes: `CommercialAccessGate` and existing typed policy targets.

- [ ] Add route integration tests for all listed row activities, Practice Hub, both checkpoint modes, all assessments, active access, all denied states, free Hiragana, and unknown parameters.
- [ ] Run `npx vitest run src/App.commercialAccess.test.tsx` and confirm paid routes currently render or redirect without the commercial gate.
- [ ] Wrap route elements through small parameter adapters that only construct policy targets.
- [ ] Re-run the route tests and existing `src/App.test.tsx` / `src/App.productionAuth.test.tsx`.

### Task 3: Home, Continue, category, and Account navigation

**Files:**
- Modify: `src/routes/HomePage.tsx`
- Modify: `src/routes/CategoryRowsPage.tsx`
- Modify: `src/components/RowMap.tsx`
- Modify: `src/components/NavBar.tsx`
- Test: corresponding existing component/page tests and `src/App.commercialAccess.test.tsx`

**Interfaces:**
- Consumes: policy helpers and shared locked-state presentation.

- [ ] Add tests proving paid cards stay visible but locked, Recommended target identity is unchanged, Continue preserves its target while denying navigation, active restores links, and Account is visible at 320px.
- [ ] Run the focused UI tests and confirm the locked behavior is absent.
- [ ] Add presentation-only access overlays; do not alter Recommended or progress selectors.
- [ ] Re-run the focused UI tests.

### Task 4: Review and Saved filtering without mutation

**Files:**
- Create: `src/hooks/useCommercialCurriculum.ts`
- Modify: Review game consumers, `src/routes/ReviewMistakesPage.tsx`, `src/routes/SavedPage.tsx`, `src/components/NavBar.tsx`, and `src/components/PracticeSummary.tsx`
- Test: `src/hooks/useCommercialCurriculum.test.ts`, Saved/Review integration tests, and affected game tests.

**Interfaces:**
- Produces: access-filtered Review IDs/words/counts and review-scope pool functions while delegating all non-review scopes unchanged.

- [ ] Add tests with retained Hiragana, paid, and unresolved Review/Saved data for inactive then active entitlement.
- [ ] Run focused tests and confirm paid items currently remain visible/playable.
- [ ] Implement filtering at consumer boundaries using canonical source resolvers; never write either store.
- [ ] Re-run focused Review/Saved/game tests and assert store snapshots remain byte-for-byte equivalent.

### Task 5: Full verification and PR

**Files:**
- Modify only docs whose behavior descriptions became stale.

- [ ] Run all focused commercial-access tests.
- [ ] Run `npm run verify`, `npm run test:browser-smoke`, and `git diff --check`.
- [ ] Inspect Home, locked UI, category cards, Review, Saved, and Account navigation at 320px in a real browser.
- [ ] Read the complete diff for policy duplication, progression changes, storage writes, secrets, and scope drift.
- [ ] Obtain a fresh-context whole-branch review and fix every blocking finding.
- [ ] Commit, push, open one non-Draft PR, and wait for Exact-HEAD CI; do not merge.

