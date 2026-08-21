# Preserve Existing Working-Tree Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every intentional existing change in reviewable commits and leave `main` clean and freshly verified without regenerating or discarding user assets.

**Architecture:** Treat the current working tree as the source of truth. Group files by provenance and behavior, inspect every staged set before committing it, then validate the committed aggregate with lint, Vitest, TypeScript, and the production Vite build.

**Tech Stack:** Git, React 19, TypeScript 6, Vite 8, Vitest 4, Oxlint, static WAV/MP3/WOFF2 assets.

**Spec:** User request in the Codex task dated 2026-08-21.

## Global Constraints

- Preserve all existing bytes unless a verification failure has a clear, minimal fix.
- Never use `git add .`, `git add -A`, destructive Git operations, stash, rebase, amend, force operations, or push.
- Do not regenerate audio, fonts, images, or call paid APIs.
- Stage only named paths and inspect `git diff --cached --check`, `--stat`, and `--name-status` before every commit.
- Stop only for secrets, unclassifiable files, or a change-loss risk.

---

### Task 1: Preserve repository operating guidance

**Files:**
- Create: `AGENTS.md`
- Create: `docs/superpowers/plans/2026-08-21-preserve-working-tree-changes.md`

- [ ] **Step 1: Scan both documents for secrets and machine-specific credentials**

Run: `rg -n -i "api[_-]?key|secret|token|password|authorization|bearer|sk-[A-Za-z0-9_-]{10,}" AGENTS.md docs/superpowers/plans/2026-08-21-preserve-working-tree-changes.md`

Expected: only the documented redacted `sk_...` example, if matched.

- [ ] **Step 2: Stage and inspect the documents**

Run: `git add -- AGENTS.md docs/superpowers/plans/2026-08-21-preserve-working-tree-changes.md`, followed by the three required cached-diff checks.

- [ ] **Step 3: Commit**

Run: `git commit -m "docs: add repository agent guidance"`

### Task 2: Preserve the replacement kana character voice set

**Files:**
- Modify: `public/audio/characters/*.wav` (104 tracked clips)
- Create: `design/audio/characters_AI_man/*.zip` (three provenance archives)

- [ ] **Step 1: Verify formats and source-to-output coverage**

Confirm all modified clips have RIFF/WAVE signatures, all archives have ZIP signatures, and the archive manifests cover the same 104 romanized ids as the modified clips, allowing documented `di`→`dji` and `du`→`dzu` output naming.

- [ ] **Step 2: Stage and inspect the voice set**

Run: `git add -- public/audio/characters design/audio/characters_AI_man`, followed by the three required cached-diff checks and an expected count of 107 staged files.

- [ ] **Step 3: Commit**

Run: `git commit -m "chore(audio): replace kana character voice set"`

### Task 3: Preserve the feedback voice v3 batch

**Files:**
- Modify: `design/audio/character-voice/README.md`
- Create: `design/audio/character-voice/feedback-voices-v3/`
- Modify: ten corresponding `public/audio/feedback/*.wav` files

- [ ] **Step 1: Verify format, manifest, and shipped-id coverage**

Confirm the twelve MP3 sources are ID3-tagged MP3 files, the ten shipped WAV ids are listed by the v3 documentation, and the two extra source-only lines remain provenance-only.

- [ ] **Step 2: Stage and inspect the feedback batch**

Run: `git add -- design/audio/character-voice/README.md design/audio/character-voice/feedback-voices-v3 public/audio/feedback`, followed by the three required cached-diff checks.

- [ ] **Step 3: Commit**

Run: `git commit -m "chore(audio): refresh feedback voice recordings"`

### Task 4: Preserve the verified えいが pronunciation and accent correction

**Files:**
- Modify: `public/audio/words/chouon-e-eiga.wav`
- Modify: `scripts/buildAccentData.mjs`
- Modify: `src/data/accents.ts`

- [ ] **Step 1: Run focused data/rendering tests**

Run: `npm test -- src/data/curriculum.test.ts src/components/WordCard.test.tsx`

Expected: all selected tests pass.

- [ ] **Step 2: Stage and inspect the correction**

Run: `git add -- public/audio/words/chouon-e-eiga.wav scripts/buildAccentData.mjs src/data/accents.ts`, followed by the three required cached-diff checks.

- [ ] **Step 3: Commit**

Run: `git commit -m "fix(audio): correct eiga pronunciation and accent"`

### Task 5: Preserve the kana font subset refresh

**Files:**
- Modify: `src/assets/fonts/klee-one-hiragana-400.woff2`
- Modify: `src/assets/fonts/klee-one-hiragana-600.woff2`

- [ ] **Step 1: Verify both files are WOFF2 assets**

Expected: both files start with the `wOF2` signature and have non-zero sizes.

- [ ] **Step 2: Stage and inspect the font assets**

Run: `git add -- src/assets/fonts/klee-one-hiragana-400.woff2 src/assets/fonts/klee-one-hiragana-600.woff2`, followed by the three required cached-diff checks.

- [ ] **Step 3: Commit**

Run: `git commit -m "chore(font): refresh kana font subsets"`

### Task 6: Preserve the superseded-audio playback fix

**Files:**
- Modify: `src/audio/staticFileProvider.ts`
- Test: `src/audio/staticFileProvider.test.ts`

- [ ] **Step 1: Run the provider unit tests**

Run: `npm test -- src/audio/staticFileProvider.test.ts`

Expected: all provider tests pass.

- [ ] **Step 2: Stage and inspect the implementation**

Run: `git add -- src/audio/staticFileProvider.ts`, followed by the three required cached-diff checks.

- [ ] **Step 3: Commit**

Run: `git commit -m "fix(audio): ignore failures from superseded playback"`

### Task 7: Preserve offline-safe PWA audio updates

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Stage and inspect the cache-policy change**

Run: `git add -- vite.config.ts`, followed by the three required cached-diff checks.

- [ ] **Step 2: Commit**

Run: `git commit -m "fix(pwa): preserve cached audio across updates"`

### Task 8: Preserve UI wording and review-card styling

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/RowMap.tsx`
- Modify: `src/routes/HomePage.tsx`
- Modify: `src/routes/PracticeHubPage.tsx`

- [ ] **Step 1: Run the routing/UI regression suite**

Run: `npm test -- src/App.test.tsx`

Expected: all routing/UI tests pass.

- [ ] **Step 2: Stage and inspect the UI changes**

Run: `git add -- src/App.tsx src/components/RowMap.tsx src/routes/HomePage.tsx src/routes/PracticeHubPage.tsx`, followed by the three required cached-diff checks.

- [ ] **Step 3: Commit**

Run: `git commit -m "style(ui): clarify lesson labels and review styling"`

### Task 9: Verify the committed aggregate and clean state

**Files:**
- Verify only; no expected modifications.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: exit code 0 with no errors.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: all test files and tests pass.

- [ ] **Step 3: Run TypeScript and the production build**

Run: `npm run build`

Expected: TypeScript and Vite both exit 0.

- [ ] **Step 4: Confirm committed history and clean status**

Run: `git log --oneline -8` and `git status --short --branch`.

Expected: eight new focused commits and no working-tree entries.
