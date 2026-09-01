# KanaGame Release Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the committed KanaGame branch to release-ready status with zero confirmed Critical/High defects and clean-checkout evidence for install, lint, tests, TypeScript, production build, PWA/offline audio, Review/Retry, persistence, accuracy, audio, timers, and Tracing.

**Architecture:** Work on an isolated `codex/release-audit` worktree created from the plan-bearing `main` HEAD. Treat every reported issue as a candidate until a deterministic reproduction establishes it; add a failing regression test before each production fix, make the smallest root-cause change, rerun focused and global checks, and record false positives without changing behavior. Keep session lifecycle fixes in hooks, persistence hardening in the Zustand store boundary, answer parsing in the pure answer-checking module, and PWA policy in the Vite/Workbox configuration.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 4, Testing Library, Zustand 5 persist middleware, Oxlint, vite-plugin-pwa/Workbox, PowerShell, Git worktrees.

**Spec:** `docs/superpowers/specs/2026-08-21-kana-game-release-audit-design.md`

## Global Constraints

- Read `AGENTS.md` and the design spec before executing the first task.
- Do not change game rules, answer-correctness policy, SRS thresholds, unlock thresholds, or feedback phrases except for the confirmed placeholder parsing defect described in Task 6.
- Do not regenerate or modify audio, fonts, images, or generated Japanese content.
- Do not use `git add .`, `git add -A`, stash, rebase, amend, force operations, destructive Git commands, or push.
- Stage only the paths named in each task and run `git diff --cached --check`, `git diff --cached --stat`, and `git diff --cached --name-status` before every commit.
- If a candidate test passes on the unmodified baseline, record it as not reproduced or already fixed; do not force a production change merely to create a commit.
- Every confirmed production defect follows RED test, minimal GREEN fix, focused regression, full test suite, lint, build, and adjacent-path reinspection.
- The deliberate lack of generated stroke paths for multi-glyph yōon IDs is not changed; `AGENTS.md` documents why generating those paths would mislabel first-glyph data.
- Completion requires a second fresh worktree created from committed audit HEAD, `npm ci`, `npm run lint`, `npm test`, `npm run build`, and clean `git status`.

---

## File Map

**Created during execution**

- `docs/release-audit/2026-08-21-findings.md` — evidence ledger with severity, reproduction, root cause, disposition, test, and commit.
- `src/hooks/useGameSession.test.ts` — queue, retry, mistake-review denominator, and finish-accounting contract.
- `src/hooks/useDelayedAction.ts` — one pending delayed callback with unmount cleanup.
- `src/hooks/useDelayedAction.test.ts` — cancellation, replacement, and unmount regression coverage.
- `src/routes/games/TracingPage.test.tsx` — repeated-advance route regression.
- `vite.config.test.ts` — Workbox audio cache upgrade/refresh configuration contract.
- `src/deployWorkflow.test.ts` — deployment workflow quality-gate contract.

**Modified only when the corresponding candidate is reproduced**

- `.gitignore` — ignore the project-local `.worktrees/` directory before creating it.
- `src/hooks/useFrozenWordPool.ts` and `src/hooks/useFrozenWordPool.test.ts` — freeze within one session attempt and refresh on Retry.
- `src/hooks/useGameSession.ts` — only if focused accounting tests expose a queue/retry/accuracy defect.
- `src/routes/games/KanaTypingPage.tsx`, `ListeningPage.tsx`, `WordBuilderPage.tsx` and their tests — share a session-attempt key with the frozen pool and queue.
- `src/hooks/useCurriculum.ts`, `src/hooks/useCurriculum.test.ts`, `src/routes/PracticeHubPage.tsx` — count independently weak words in Review status and use an item-neutral label.
- `src/store/progressStore.ts`, `src/store/progressStore.test.ts` — normalize partial/current-version persisted state at the hydration boundary.
- `src/lib/answerChecking.ts`, `src/lib/answerChecking.test.ts` — align context-dependent placeholder IDs with canonical romaji without accepting `-` or deleting gemination/long vowels.
- `src/audio/staticFileProvider.ts`, `src/audio/staticFileProvider.test.ts` — only if superseded static playback still rejects and triggers fallback.
- `src/routes/games/KanaQuizPage.tsx`, `KanaTypingPage.tsx`, `ListeningPage.tsx` — use the delayed-action cleanup hook.
- `src/routes/games/TracingPage.tsx` — ignore a second Next action before the first transition commits.
- `vite.config.ts` — export/test the runtime cache policy and change it only if the legacy-cache reproduction fails.
- `.github/workflows/deploy.yml` — run lint and tests before the production build/deploy.

---

### Task 1: Isolated Workspace, Baseline, and Finding Ledger

**Files:**
- Read: `AGENTS.md`
- Read: `docs/superpowers/specs/2026-08-21-kana-game-release-audit-design.md`
- Modify: `.gitignore`
- Create: `docs/release-audit/2026-08-21-findings.md`

**Interfaces:**
- Consumes: clean `main` containing this plan and the approved spec.
- Produces: isolated `.worktrees/release-audit` on `codex/release-audit`, a clean dependency baseline, and an evidence ledger used by every later task.

- [ ] **Step 1: Confirm the source checkout and existing worktrees**

Run from `C:\Users\halcy\projects\kana-game`:

```powershell
Get-Content -Raw AGENTS.md
Get-Content -Raw docs/superpowers/specs/2026-08-21-kana-game-release-audit-design.md
git status --short --branch
git worktree list --porcelain
git log --oneline --decorate -8
```

Expected: `main` is clean. The old external `kana-game-codex-release` worktree may remain at `2b0ae9a`; it is not the execution target.

- [ ] **Step 2: Make project-local worktrees safely ignorable**

Run:

```powershell
git check-ignore -q .worktrees
```

If the command is nonzero, use `apply_patch` to append this exact entry to `.gitignore`:

```gitignore

# Local isolated Git worktrees used for release/debug sessions
/.worktrees/
```

Then run:

```powershell
git add .gitignore
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git commit -m "chore: ignore local audit worktrees"
git check-ignore -q .worktrees
```

Expected: the final ignore check exits 0. If it was already ignored, do not edit or commit `.gitignore`.

- [ ] **Step 3: Create the isolated audit worktree**

Run:

```powershell
git worktree add .worktrees/release-audit -b codex/release-audit main
Set-Location .worktrees/release-audit
git status --short --branch
```

Expected: branch `codex/release-audit`, clean status, and HEAD includes the approved spec and this plan.

- [ ] **Step 4: Install only lockfile-resolved dependencies and run baseline gates**

Run:

```powershell
npm ci
npm run lint
npm test
npm run build
git status --short --branch
```

Expected: install exits 0 without changing tracked files; lint exits 0; all baseline tests pass; `npm run build` completes both `tsc -b` and `vite build`; only ignored `dist/` and dependency artifacts may exist.

- [ ] **Step 5: Create the finding ledger with grounded initial candidates**

Create `docs/release-audit/2026-08-21-findings.md` with this exact structure:

```markdown
# KanaGame Release Audit Findings — 2026-08-21

| ID | Candidate | Initial severity | Reproduction | Disposition | Evidence / test | Commit |
|---|---|---:|---|---|---|---|
| RA-01 | Review Play Again reuses the previous frozen word pool | Medium | Unverified | Open | `useFrozenWordPool` is keyed only by row id | — |
| RA-02 | Review count excludes independently weak words | Medium | Unverified | Open | `reviewCount` currently uses only `weakCharacterIds.length` | — |
| RA-03 | Queue or finish accounting can report incorrect accuracy | Medium | Unverified | Open | Audit `useGameSession` and summary denominators | — |
| RA-04 | Partial/current-version localStorage can break Review state | Medium | Unverified | Open | Persist merge/migration lacks hydration coverage | — |
| RA-05 | Placeholder romaji IDs can create noncanonical accepted answers | Medium | Unverified | Open | Audit っ/ッ/ー alignment in `romajiVariants` | — |
| RA-06 | Superseded TTS can start Web Speech over current static audio | Medium | Unverified | Open | Regression-test request replacement | — |
| RA-07 | Repeated Tracing Next skips a round | Medium | Unverified | Open | `advance` can run twice before rerender | — |
| RA-08 | Correct-answer timers survive unmount/navigation | Low | Unverified | Open | Three pages use bare `setTimeout` | — |
| RA-09 | PWA update loses legacy cached audio offline | High | Unverified | Open | Validate `kana-game-media` upgrade behavior | — |
| RA-10 | Deploy workflow omits lint and tests | Medium | Confirmed by inspection | Open | `.github/workflows/deploy.yml` runs only build | — |
| RA-11 | Yōon tracing needs generated multi-glyph stroke paths | Medium | Not reproduced | Intentional constraint | `AGENTS.md` forbids first-codepoint generation for multi-glyph IDs | — |
| RA-12 | Reset action has no production UI entry | Low | Not reproduced | Product decision | No progress-loss or release-blocking path established | — |
```

- [ ] **Step 6: Commit the audit ledger**

Run:

```powershell
git add docs/release-audit/2026-08-21-findings.md
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: start release audit finding ledger"
```

---

### Task 2: Review Retry Snapshot Refresh

**Files:**
- Modify: `src/hooks/useFrozenWordPool.ts`
- Modify: `src/hooks/useFrozenWordPool.test.ts`
- Modify: `src/routes/games/KanaTypingPage.tsx`
- Modify: `src/routes/games/KanaTypingPage.test.tsx`
- Modify: `src/routes/games/ListeningPage.tsx`
- Modify: `src/routes/games/ListeningPage.test.tsx`
- Modify: `src/routes/games/WordBuilderPage.tsx`
- Modify: `src/routes/games/WordBuilderPage.test.tsx`
- Modify: `docs/release-audit/2026-08-21-findings.md`

**Interfaces:**
- Consumes: `useFrozenWordPool(sessionKey: string | undefined, words: AnchorWord[])` and `useGameSession`'s existing `sessionKey` restart boundary.
- Produces: a page-owned `sessionAttempt: number`; combined key ``${rowId}:${sessionAttempt}`` freezes both word resolution and the queue for one run, while Retry increments the attempt and captures current Review words. Mistake Review continues to use the just-finished snapshot.

- [ ] **Step 1: Add the failing hook regression**

Append to `src/hooks/useFrozenWordPool.test.ts`:

```tsx
it('captures the current live Review words when a new attempt starts for the same row', () => {
  const { result, rerender } = renderHook(
    ({ attempt, words }: { attempt: number; words: AnchorWord[] }) =>
      useFrozenWordPool(`review:${attempt}`, words),
    { initialProps: { attempt: 0, words: [word('a-ai'), word('a-ie')] } },
  )

  rerender({ attempt: 0, words: [word('a-ie')] })
  expect(result.current.wordIds).toEqual(['a-ai', 'a-ie'])

  rerender({ attempt: 1, words: [word('a-ie')] })
  expect(result.current.wordIds).toEqual(['a-ie'])
  expect(result.current.wordsById['a-ai']).toBeUndefined()
})
```

- [ ] **Step 2: Run the hook test and verify the test describes the intended boundary**

Run:

```powershell
npx vitest run src/hooks/useFrozenWordPool.test.ts
```

Expected on the current implementation: the new test passes because a changed key already refreshes. This establishes that the missing behavior is page wiring, not the snapshot hook itself; do not modify `useFrozenWordPool.ts` unless this test fails.

- [ ] **Step 3: Add a failing route-level Retry test**

In `KanaTypingPage.test.tsx`, add this helper. It answers `love` correctly so that word leaves the live weak pool, answers `house` incorrectly so it stays weak, and finishes all six frozen rounds:

```tsx
function finishVisibleTypingSessionKeepingHouseWeak(container: HTMLElement) {
  for (let round = 0; round < 6; round++) {
    const meaning = container.querySelector('.text-lg.font-semibold')!.textContent!.trim()
    const input = container.querySelector('input') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: meaning === 'love' ? 'ai' : 'wrong' } })
      fireEvent.submit(container.querySelector('form')!)
    })
    if (meaning === 'love') {
      act(() => vi.advanceTimersByTime(2000))
    } else {
      const next = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Next'))!
      act(() => fireEvent.click(next))
    }
  }
}
```

Then add:

```tsx
it('Play Again captures the Review pool that is current after the completed attempt', () => {
  vi.useFakeTimers()
  const { container, getByRole } = renderReviewTyping()

  finishVisibleTypingSessionKeepingHouseWeak(container)
  expect(getByRole('button', { name: /play again/i })).toBeInTheDocument()

  act(() => {
    fireEvent.click(getByRole('button', { name: /play again/i }))
  })

  expect(container.querySelector('p.text-sm')?.textContent).toMatch('Round 1 / 3')
})
```

The setup keeps `a-ie` weak while correct answers clear `a-ai`, so the new attempt must contain one live Review word and therefore three rounds, not the old six-round snapshot.

- [ ] **Step 4: Run the route regression and verify RED**

Run:

```powershell
npx vitest run src/routes/games/KanaTypingPage.test.tsx
```

Expected: FAIL because `onRetry={startSession}` rebuilds from the frozen `review` snapshot and remains six rounds.

- [ ] **Step 5: Wire a shared session-attempt key into all word games**

In each of Kana Typing, Listening, and Word Builder, add:

```tsx
const [sessionAttempt, setSessionAttempt] = useState(0)
const sessionKey = `${rowId ?? ''}:${sessionAttempt}`
const { wordIds, wordsById } = useFrozenWordPool(sessionKey, scopeWords)
```

Pass `sessionKey` to `useGameSession` and replace the summary Retry callback:

```tsx
onRetry={() => setSessionAttempt((attempt) => attempt + 1)}
```

Keep `onReviewMistakes={() => startMistakeReview(mistakeIds)}` unchanged so mistake IDs still resolve against the completed attempt's frozen word objects.

- [ ] **Step 6: Run focused regressions**

Run:

```powershell
npx vitest run src/hooks/useFrozenWordPool.test.ts src/routes/games/KanaTypingPage.test.tsx src/routes/games/ListeningPage.test.tsx src/routes/games/WordBuilderPage.test.tsx
```

Expected: all tests pass, including the existing “live pool shrinks mid-session without skipping” tests.

- [ ] **Step 7: Update ledger and commit**

Mark RA-01 reproduced/fixed with its test and root cause. Then run:

```powershell
git add src/hooks/useFrozenWordPool.test.ts src/routes/games/KanaTypingPage.tsx src/routes/games/KanaTypingPage.test.tsx src/routes/games/ListeningPage.tsx src/routes/games/ListeningPage.test.tsx src/routes/games/WordBuilderPage.tsx src/routes/games/WordBuilderPage.test.tsx docs/release-audit/2026-08-21-findings.md
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(review): refresh word pool on replay"
```

Do not stage `src/hooks/useFrozenWordPool.ts` if the hook needed no implementation change.

---

### Task 3: Review Count Includes Independently Weak Words

**Files:**
- Modify: `src/hooks/useCurriculum.ts`
- Modify: `src/hooks/useCurriculum.test.ts`
- Modify: `src/routes/PracticeHubPage.tsx`
- Modify: `docs/release-audit/2026-08-21-findings.md`

**Interfaces:**
- Consumes: `weakCharacterIds: string[]` and `weakWords: AnchorWord[]`.
- Produces: `reviewCharacterCount`, `reviewWordCount`, and `reviewCount = reviewCharacterCount + reviewWordCount`; the badge remains a single total while prose uses “items”.

- [ ] **Step 1: Add failing count assertions**

Extend the existing independently weak word test:

```tsx
expect(result.current.reviewCharacterCount).toBe(0)
expect(result.current.reviewWordCount).toBe(1)
expect(result.current.reviewCount).toBe(1)
```

Add a mixed case:

```tsx
it('counts weak characters and independently weak words as separate Review items', () => {
  useProgressStore.getState().markRowTaught('a-row')
  useProgressStore.getState().adjustCharacterReviewScore('a', 5)
  useProgressStore.getState().adjustWordReviewScore('a-ie', 5)
  const { result } = renderHook(() => useCurriculum())
  expect(result.current.reviewCharacterCount).toBe(1)
  expect(result.current.reviewWordCount).toBe(1)
  expect(result.current.reviewCount).toBe(2)
})
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run src/hooks/useCurriculum.test.ts
```

Expected: FAIL because the two detailed count properties do not exist and `reviewCount` excludes the word.

- [ ] **Step 3: Implement explicit count semantics**

Before the hook return in `useCurriculum.ts`, add:

```tsx
const reviewCharacterCount = weakCharacterIds.length
const reviewWordCount = weakWords.length
const reviewCount = reviewCharacterCount + reviewWordCount
```

Return all three properties. Replace the Review hub sentence that says “characters need review” with:

```tsx
`${reviewCount} item${reviewCount === 1 ? '' : 's'} need review`
```

Do not change the NavBar badge rendering; it already consumes `reviewCount`.

- [ ] **Step 4: Run focused and app routing tests**

Run:

```powershell
npx vitest run src/hooks/useCurriculum.test.ts src/App.test.tsx
```

Expected: PASS with the updated item-neutral copy assertions in `App.test.tsx` if an existing assertion references the old noun.

- [ ] **Step 5: Update ledger and commit**

```powershell
git add src/hooks/useCurriculum.ts src/hooks/useCurriculum.test.ts src/routes/PracticeHubPage.tsx src/App.test.tsx docs/release-audit/2026-08-21-findings.md
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(review): count independently weak words"
```

Omit `src/App.test.tsx` from staging if no copy assertion needed modification.

---

### Task 4: Session Queue and Accuracy Contract

**Files:**
- Create: `src/hooks/useGameSession.test.ts`
- Modify: `src/hooks/useGameSession.ts` only if a test fails
- Modify: `docs/release-audit/2026-08-21-findings.md`

**Interfaces:**
- Consumes: `useGameSession({ ids, weight, onFinish, resetSession, rounds, sessionKey })`.
- Produces: evidence that normal retry rebuilds from current IDs, mistake review uses its own queue length as denominator, `onFinish` fires once, and rapid `advance()` cannot inflate the denominator or finish callback.

- [ ] **Step 1: Add deterministic hook tests**

Create `src/hooks/useGameSession.test.ts` with `Math.random` stubbed to `0`, stable callbacks, and these cases:

```tsx
it('reports the completed queue length once', () => {
  const onFinish = vi.fn()
  const { result } = renderHook(() =>
    useGameSession({
      ids: ['a', 'i'],
      weight: () => 0,
      onFinish,
      resetSession: vi.fn(),
      rounds: 2,
      sessionKey: 'a-row',
    }),
  )

  act(() => result.current.setCorrectCount(1))
  act(() => result.current.advance())
  act(() => result.current.advance())

  expect(onFinish).toHaveBeenCalledTimes(1)
  expect(onFinish).toHaveBeenCalledWith(1, 2)
})

it('uses the mistake queue length for the retry accuracy denominator', () => {
  const onFinish = vi.fn()
  const { result } = renderHook(() =>
    useGameSession({
      ids: ['a', 'i', 'u'],
      weight: () => 0,
      onFinish,
      resetSession: vi.fn(),
      rounds: 3,
      sessionKey: 'a-row',
    }),
  )

  act(() => result.current.startMistakeReview(['i']))
  act(() => result.current.setCorrectCount(1))
  act(() => result.current.advance())

  expect(onFinish).toHaveBeenLastCalledWith(1, 1)
})
```

Add this separate same-key/current-ID case:

```tsx
it('keeps a running queue stable but uses current ids for explicit replay', () => {
  const callbacks = { weight: () => 0, onFinish: vi.fn(), resetSession: vi.fn() }
  const { result, rerender } = renderHook(
    ({ ids }: { ids: string[] }) =>
      useGameSession({ ids, ...callbacks, rounds: 2, sessionKey: 'review' }),
    { initialProps: { ids: ['a', 'i'] } },
  )
  expect(result.current.queue).toEqual(expect.arrayContaining(['a', 'i']))

  rerender({ ids: ['u'] })
  expect(result.current.queue).toEqual(expect.arrayContaining(['a', 'i']))

  act(() => result.current.startSession())
  expect(result.current.queue).toEqual(['u'])
})
```

- [ ] **Step 2: Run and classify**

Run:

```powershell
npx vitest run src/hooks/useGameSession.test.ts src/lib/practiceSelection.test.ts
```

If all tests pass, classify RA-03 as not reproduced and keep production code unchanged. If a test fails, capture the exact callback/queue state in the ledger before editing.

- [ ] **Step 3: Apply only a reproduced accounting fix**

For a duplicate-finish failure, guard the finish transition rather than changing summary math:

```tsx
const finishReportedRef = useRef(false)

// Reset to false in startSession and startMistakeReview.
useEffect(() => {
  if (!finished || queue.length === 0 || finishReportedRef.current) return
  finishReportedRef.current = true
  onFinish(correctCount, queue.length)
}, [finished, queue.length, correctCount, onFinish])
```

For a stale retry-ID failure, include `weight`, `resetSession`, and `rounds` in `startSession` dependencies and keep the outer mount/restart effect gated by `sessionKey`; do not make live ID changes restart the running session.

- [ ] **Step 4: Run focused and full tests**

```powershell
npx vitest run src/hooks/useGameSession.test.ts src/lib/practiceSelection.test.ts src/routes/games/KanaTypingPage.test.tsx src/routes/games/ListeningPage.test.tsx src/routes/games/WordBuilderPage.test.tsx
npm test
```

- [ ] **Step 5: Update ledger and commit tests with any confirmed fix**

```powershell
git add src/hooks/useGameSession.test.ts docs/release-audit/2026-08-21-findings.md
git add src/hooks/useGameSession.ts
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git commit -m "test(session): lock queue and accuracy accounting"
```

Do not run the second `git add` if production code was unchanged. If production code changed, use commit message `fix(session): make finish accounting idempotent`.

---

### Task 5: Persisted Progress Normalization

**Files:**
- Modify: `src/store/progressStore.ts`
- Modify: `src/store/progressStore.test.ts`
- Modify: `docs/release-audit/2026-08-21-findings.md`

**Interfaces:**
- Consumes: Zustand persist `merge(persistedState: unknown, currentState: ProgressState)` and existing version-5 migration.
- Produces: exported `mergePersistedProgress(persistedState: unknown, currentState: ProgressState): ProgressState`, which preserves current actions/defaults and normalizes stored character/word records and settings.

- [ ] **Step 1: Add failing pure merge tests**

Add tests that pass current-version partial data through `mergePersistedProgress`:

```tsx
it('backfills missing v5 maps and reviewScore values during hydration', () => {
  const current = useProgressStore.getState()
  const merged = mergePersistedProgress(
    {
      characters: {
        a: { box: 1, totalSeen: 2, totalCorrect: 1, lastSeen: 123 },
      },
      taughtRowIds: ['a-row'],
    },
    current,
  )

  expect(merged.characters.a.reviewScore).toBe(0)
  expect(merged.words).toEqual({})
  expect(merged.unlockedRowIds).toEqual(['a-row'])
  expect(typeof merged.recordResult).toBe('function')
})

it('normalizes invalid review scores before future arithmetic', () => {
  const current = useProgressStore.getState()
  const merged = mergePersistedProgress(
    { characters: { a: { box: 0, totalSeen: 0, totalCorrect: 0, lastSeen: 0, reviewScore: Number.NaN } } },
    current,
  )
  expect(merged.characters.a.reviewScore).toBe(0)
})
```

Add a persisted-hydration test using the exact storage envelope:

```tsx
localStorage.setItem(
  'kana-game-progress',
  JSON.stringify({ version: 5, state: { characters: {}, taughtRowIds: ['a-row'] } }),
)
await useProgressStore.persist.rehydrate()
expect(useProgressStore.getState().words).toEqual({})
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx vitest run src/store/progressStore.test.ts
```

Expected: FAIL because no merge normalizer exists and current-version partial state can replace default maps.

- [ ] **Step 3: Implement the hydration boundary**

Add record and finite-number guards, then implement:

```tsx
export function mergePersistedProgress(persistedState: unknown, currentState: ProgressState): ProgressState {
  const persisted = isRecord(persistedState) ? persistedState : {}
  const rawCharacters = isRecord(persisted.characters) ? persisted.characters : {}
  const rawWords = isRecord(persisted.words) ? persisted.words : {}

  const characters = Object.fromEntries(
    Object.entries(rawCharacters).map(([id, value]) => {
      const candidate = isRecord(value) ? value : {}
      return [
        id,
        {
          box: finiteOr(candidate.box, 0),
          totalSeen: finiteOr(candidate.totalSeen, 0),
          totalCorrect: finiteOr(candidate.totalCorrect, 0),
          lastSeen: finiteOr(candidate.lastSeen, 0),
          reviewScore: clampReviewScore(finiteOr(candidate.reviewScore, 0)),
        },
      ]
    }),
  )
  const words = Object.fromEntries(
    Object.entries(rawWords).map(([id, value]) => [
      id,
      { reviewScore: clampReviewScore(finiteOr(isRecord(value) ? value.reviewScore : 0, 0)) },
    ]),
  )

  return {
    ...currentState,
    characters,
    words,
    unlockedRowIds: stringArrayOr(persisted.unlockedRowIds, currentState.unlockedRowIds),
    taughtRowIds: stringArrayOr(persisted.taughtRowIds, currentState.taughtRowIds),
    audioEnabled: booleanOr(persisted.audioEnabled, currentState.audioEnabled),
    audioVolume: finiteOr(persisted.audioVolume, currentState.audioVolume),
    audioSpeed: finiteOr(persisted.audioSpeed, currentState.audioSpeed),
    showRomaji: booleanOr(persisted.showRomaji, currentState.showRomaji),
    mascotVoiceEnabled: booleanOr(persisted.mascotVoiceEnabled, currentState.mascotVoiceEnabled),
    mascotVoiceVolume: finiteOr(persisted.mascotVoiceVolume, currentState.mascotVoiceVolume),
  }
}
```

Define these helpers immediately above it:

```tsx
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : fallback
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
```

Add `merge: mergePersistedProgress` beside `migrate` in the persist options. Keep version `5` and the v4→v5 migration intact.

- [ ] **Step 4: Run persistence and Review tests**

```powershell
npx vitest run src/store/progressStore.test.ts src/hooks/useCurriculum.test.ts
npm test
```

Expected: PASS; hydration preserves actions, maps always exist, and Review uses finite scores.

- [ ] **Step 5: Update ledger and commit**

```powershell
git add src/store/progressStore.ts src/store/progressStore.test.ts docs/release-audit/2026-08-21-findings.md
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(progress): normalize persisted review state"
```

---

### Task 6: Context-Dependent Romaji Placeholders

**Files:**
- Modify: `src/lib/answerChecking.ts`
- Modify: `src/lib/answerChecking.test.ts`
- Modify: `docs/release-audit/2026-08-21-findings.md`

**Interfaces:**
- Consumes: canonical `word.romaji`, ordered `word.characterIds`, per-character canonical romaji, and `ROMAJI_ALTERNATES`.
- Produces: alternate variants that preserve the canonical substring represented by っ/ッ/ー while allowing alternates on real kana; `-`, deleted gemination, and deleted long vowels are never accepted.

- [ ] **Step 1: Add failing placeholder tests using real word shapes**

Append:

```tsx
it('does not accept placeholder or deleted gemination for sokuon words', () => {
  const otto = { kana: 'おっと', romaji: 'otto', characterIds: ['o', 'sokuon', 'to'] }
  expect(isAnswerCorrect('otto', otto)).toBe(true)
  expect(isAnswerCorrect('o-to', otto)).toBe(false)
  expect(isAnswerCorrect('oto', otto)).toBe(false)

  const macchi = {
    kana: 'マッチ',
    romaji: 'macchi',
    characterIds: ['katakana-ma', 'katakana-sokuon', 'katakana-chi'],
  }
  expect(isAnswerCorrect('matti', macchi)).toBe(true)
  expect(isAnswerCorrect('mati', macchi)).toBe(false)
})

it('does not accept placeholder or deleted vowel length for chōon words', () => {
  const keeki = {
    kana: 'ケーキ',
    romaji: 'keeki',
    characterIds: ['katakana-ke', 'katakana-chouon', 'katakana-ki'],
  }
  expect(isAnswerCorrect('keeki', keeki)).toBe(true)
  expect(isAnswerCorrect('ke-ki', keeki)).toBe(false)
  expect(isAnswerCorrect('keki', keeki)).toBe(false)
})
```

- [ ] **Step 2: Verify RED and capture exact false accepts**

Run:

```powershell
npx vitest run src/lib/answerChecking.test.ts
```

Expected: at least `oto` or another deleted-placeholder spelling is incorrectly accepted by the current length walker. Record the exact failing assertion under RA-05.

- [ ] **Step 3: Segment canonical romaji before expanding alternates**

Replace the placeholder-blind walk with a helper that determines each ID's canonical slice. For a `romaji === '-'` ID, preserve the substring between the previous concrete character and the next concrete character; for a trailing placeholder, preserve the token remainder. Then expand `ROMAJI_ALTERNATES` only for concrete IDs.

The core placeholder branch must be:

```tsx
if (base === '-') {
  const nextConcreteId = characterIds.slice(index + 1).find((candidateId) => CHARACTERS_BY_ID[candidateId]?.romaji !== '-')
  const nextBase = nextConcreteId ? CHARACTERS_BY_ID[nextConcreteId]?.romaji ?? '' : ''
  const boundary = nextBase ? token.indexOf(nextBase, consumedLength) : token.length
  if (boundary < consumedLength) return null
  return { canonical: token.slice(consumedLength, boundary), consumedLength: boundary }
}
```

Reject variant generation for a token when alignment returns `null`; exact canonical romaji remains accepted by the early equality check. Preserve the existing multi-token `mizu wo nomu` and Kunrei-shiki tests.

- [ ] **Step 4: Run all answer-related tests**

```powershell
npx vitest run src/lib/answerChecking.test.ts src/routes/games/KanaTypingPage.test.tsx src/lib/answerCloseness.test.ts src/lib/kanaToRomaji.test.ts
npm test
```

- [ ] **Step 5: Update ledger and commit**

```powershell
git add src/lib/answerChecking.ts src/lib/answerChecking.test.ts docs/release-audit/2026-08-21-findings.md
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(answers): preserve contextual romaji markers"
```

---

### Task 7: Superseded Audio and Fallback Concurrency

**Files:**
- Modify: `src/audio/staticFileProvider.test.ts`
- Modify: `src/audio/staticFileProvider.ts` only if reproduced
- Modify: `docs/release-audit/2026-08-21-findings.md`

**Interfaces:**
- Consumes: `StaticFileProvider.speak(request, options): Promise<void>` and its monotonic request ID.
- Produces: a superseded request resolves quietly and cannot cause fallback; the current request retains normal failure behavior.

- [ ] **Step 1: Add deferred-play request replacement tests**

Use a small `deferred<T>()` helper and add:

```tsx
it('quietly resolves an old play rejection after a newer request supersedes it', async () => {
  const first = deferred<void>()
  const second = deferred<void>()
  playSpy.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
  const provider = new StaticFileProvider()

  const oldRequest = provider.speak({ key: 'characters/a', text: 'あ' }, { volume: 1, rate: 1 })
  const currentRequest = provider.speak({ key: 'characters/i', text: 'い' }, { volume: 1, rate: 1 })
  first.reject(new DOMException('superseded', 'AbortError'))

  await expect(oldRequest).resolves.toBeUndefined()
  second.resolve()
  await expect(currentRequest).resolves.toBeUndefined()
})

it('still rejects when the current request fails', async () => {
  playSpy.mockRejectedValueOnce(new Error('decode failed'))
  const provider = new StaticFileProvider()
  await expect(provider.speak({ key: 'characters/a', text: 'あ' }, { volume: 1, rate: 1 })).rejects.toThrow('decode failed')
})
```

- [ ] **Step 2: Run and classify**

```powershell
npx vitest run src/audio/staticFileProvider.test.ts src/audio/webSpeechProvider.test.ts
```

If both pass on the baseline, mark RA-06 already fixed by `31f5878` and commit regression tests only. If the superseded request rejects, verify the request ID at the failing callback before editing.

- [ ] **Step 3: Apply only a reproduced provider fix**

Keep the monotonic request check at every asynchronous rejection boundary:

```tsx
const settleFailure = (error: unknown, resolve: () => void, reject: (reason?: unknown) => void) => {
  if (id !== this.requestId) resolve()
  else reject(error)
}
```

Use it for both `audioEl.onerror` and `play().catch`. Do not add a second audio element and do not call Web Speech from the static provider.

- [ ] **Step 4: Run audio and route regressions**

```powershell
npx vitest run src/audio/staticFileProvider.test.ts src/audio/webSpeechProvider.test.ts src/routes/games/KanaTypingPage.test.tsx src/routes/games/ListeningPage.test.tsx
```

- [ ] **Step 5: Update ledger and commit**

```powershell
git add src/audio/staticFileProvider.test.ts docs/release-audit/2026-08-21-findings.md
git add src/audio/staticFileProvider.ts
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git commit -m "test(audio): cover superseded playback"
```

Omit the production file from staging when the existing guard passes. Use `fix(audio): isolate superseded playback failures` if production code changes.

---

### Task 8: Delayed Answer Cleanup and Repeated Tracing Advance

**Files:**
- Create: `src/hooks/useDelayedAction.ts`
- Create: `src/hooks/useDelayedAction.test.ts`
- Modify: `src/routes/games/KanaQuizPage.tsx`
- Modify: `src/routes/games/KanaTypingPage.tsx`
- Modify: `src/routes/games/ListeningPage.tsx`
- Create: `src/routes/games/TracingPage.test.tsx`
- Modify: `src/routes/games/TracingPage.tsx`
- Modify: `docs/release-audit/2026-08-21-findings.md`

**Interfaces:**
- Produces: `useDelayedAction(): { schedule(action: () => void, delayMs: number): void; cancel(): void }` with at most one timer and unmount cleanup.
- Produces: a Tracing transition lock cleared by `startSession` and after committed phase/round changes.

- [ ] **Step 1: Write delayed-action tests first**

Create `src/hooks/useDelayedAction.test.ts`:

```tsx
it('cancels a scheduled action on unmount', () => {
  vi.useFakeTimers()
  const action = vi.fn()
  const { result, unmount } = renderHook(() => useDelayedAction())
  act(() => result.current.schedule(action, 2000))
  unmount()
  act(() => vi.advanceTimersByTime(2000))
  expect(action).not.toHaveBeenCalled()
})

it('replaces an older scheduled action', () => {
  vi.useFakeTimers()
  const oldAction = vi.fn()
  const currentAction = vi.fn()
  const { result } = renderHook(() => useDelayedAction())
  act(() => {
    result.current.schedule(oldAction, 2000)
    result.current.schedule(currentAction, 2000)
  })
  act(() => vi.advanceTimersByTime(2000))
  expect(oldAction).not.toHaveBeenCalled()
  expect(currentAction).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Verify RED**

```powershell
npx vitest run src/hooks/useDelayedAction.test.ts
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the minimal cleanup hook**

Create `src/hooks/useDelayedAction.ts`:

```tsx
import { useCallback, useEffect, useRef } from 'react'

export function useDelayedAction() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = useCallback(() => {
    if (timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])
  const schedule = useCallback(
    (action: () => void, delayMs: number) => {
      cancel()
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        action()
      }, delayMs)
    },
    [cancel],
  )
  useEffect(() => cancel, [cancel])
  return { schedule, cancel }
}
```

- [ ] **Step 4: Replace bare answer timers**

In Kana Quiz, Kana Typing, and Listening:

```tsx
const { schedule: scheduleAdvance } = useDelayedAction()
```

Replace only `setTimeout(advance, 2000)` with:

```tsx
scheduleAdvance(advance, 2000)
```

Do not alter Word Builder; its existing effect returns `clearTimeout(timer)`.

- [ ] **Step 5: Write the Tracing repeated-click regression**

Create a route test that marks `a-row` taught, stubs canvas `getContext`, renders `/practice/hiragana/a-row/tracing`, and adds:

```tsx
it('advances only one round when Next is clicked twice before rerender', () => {
  const { getByRole, getByText } = renderTracing()
  expect(getByText(/Round 1 \/ 5/)).toBeInTheDocument()
  act(() => {
    fireEvent.click(getByRole('button', { name: 'Next' }))
    fireEvent.click(getByRole('button', { name: 'Next' }))
  })
  expect(getByText(/Round 2 \/ 5/)).toBeInTheDocument()
})
```

- [ ] **Step 6: Verify Tracing RED**

```powershell
npx vitest run src/routes/games/TracingPage.test.tsx
```

Expected: FAIL with Round 3 because two functional updates are queued from the same rendered callback.

- [ ] **Step 7: Guard one committed Tracing transition**

Add `advanceLockedRef` and reset it in `startSession`. Clear it after a committed phase/round change:

```tsx
const advanceLockedRef = useRef(false)

useEffect(() => {
  advanceLockedRef.current = false
}, [phase, roundIndex])

const advance = useCallback(() => {
  if (advanceLockedRef.current) return
  advanceLockedRef.current = true
  // existing transition branches remain unchanged
}, [roundIndex, queue.length, phase, wordIds])
```

Set `advanceLockedRef.current = false` at the start of `startSession` so PracticeSummary Retry is immediately usable.

- [ ] **Step 8: Run lifecycle regressions and full suite**

```powershell
npx vitest run src/hooks/useDelayedAction.test.ts src/routes/games/TracingPage.test.tsx src/routes/games/KanaTypingPage.test.tsx src/routes/games/ListeningPage.test.tsx src/routes/games/WordBuilderPage.test.tsx src/App.test.tsx
npm test
```

- [ ] **Step 9: Update ledger and commit**

```powershell
git add src/hooks/useDelayedAction.ts src/hooks/useDelayedAction.test.ts src/routes/games/KanaQuizPage.tsx src/routes/games/KanaTypingPage.tsx src/routes/games/ListeningPage.tsx src/routes/games/TracingPage.tsx src/routes/games/TracingPage.test.tsx docs/release-audit/2026-08-21-findings.md
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git commit -m "fix(games): clean up delayed and repeated advances"
```

---

### Task 9: PWA Legacy Audio Upgrade and Online Refresh

**Files:**
- Create: `vite.config.test.ts`
- Modify: `vite.config.ts` only if reproduced
- Modify: `docs/release-audit/2026-08-21-findings.md`

**Interfaces:**
- Consumes: Workbox runtime caching entries.
- Produces: exported `PWA_RUNTIME_CACHING`; `/audio/` uses `NetworkFirst`, the legacy `kana-game-media` cache, a finite network timeout, cacheable 0/200 responses, and the same expiration budget as other media.

- [ ] **Step 1: Export the current policy without changing behavior**

Move the current `runtimeCaching` array to this exported constant in `vite.config.ts`:

```tsx
export const PWA_RUNTIME_CACHING = [
  {
    urlPattern: ({ url }: { url: URL }) => /\/audio\//.test(url.pathname),
    handler: 'NetworkFirst' as const,
    options: {
      cacheName: 'kana-game-media',
      networkTimeoutSeconds: 4,
      expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 180 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
  {
    urlPattern: ({ url }: { url: URL }) => /\/(word-icons|mascot|icons)\//.test(url.pathname),
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'kana-game-media',
      expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 180 },
      cacheableResponse: { statuses: [0, 200] },
    },
  },
]
```

Set `workbox.runtimeCaching: PWA_RUNTIME_CACHING`.

- [ ] **Step 2: Add configuration regression tests**

Create `vite.config.test.ts`:

```tsx
import { describe, expect, it } from 'vitest'
import { PWA_RUNTIME_CACHING } from './vite.config'

const audioRoute = PWA_RUNTIME_CACHING.find((entry) => {
  const pattern = entry.urlPattern
  return typeof pattern === 'function' && pattern({ url: new URL('https://example.test/kana-game/audio/example.wav') } as never)
})

describe('PWA audio runtime cache', () => {
  it('reuses the legacy media cache and refreshes online before falling back offline', () => {
    expect(audioRoute?.handler).toBe('NetworkFirst')
    expect(audioRoute?.options?.cacheName).toBe('kana-game-media')
    expect(audioRoute?.options?.networkTimeoutSeconds).toBe(4)
    expect(audioRoute?.options?.cacheableResponse?.statuses).toEqual([0, 200])
  })
})
```

- [ ] **Step 3: Run the configuration test**

```powershell
npx vitest run vite.config.test.ts
```

Expected on current main: PASS. This proves the previously confirmed High was addressed by `f9f52d9`; it does not by itself prove generated service-worker behavior.

- [ ] **Step 4: Build and inspect the generated service worker**

```powershell
npm run build
rg -n "kana-game-media|NetworkFirst|networkTimeoutSeconds" dist/sw.js dist/workbox-*.js
git status --short --branch
```

Expected: build passes; generated service-worker code contains the legacy cache name and a NetworkFirst route for audio. `dist/` remains ignored.

- [ ] **Step 5: Exercise the legacy-cache offline sequence in a local browser**

Before browser control, read and follow `browser:control-in-app-browser`. Start a local production preview:

```powershell
npm run preview -- --host 127.0.0.1
```

In a clean browser profile for the preview origin:

1. Register the built service worker by loading `/kana-game/` online.
2. Insert the response for `/kana-game/audio/example.wav` into Cache Storage cache `kana-game-media` and verify no newer audio cache contains it.
3. Activate/update the current service worker.
4. Switch the browser context offline before requesting that URL.
5. Fetch `/kana-game/audio/example.wav` and assert status 200 with the legacy cached bytes.
6. Restore online mode, serve different bytes at the same URL, fetch again, and assert the response/cache changes to the new bytes.

Record exact browser evidence in RA-09. If browser offline controls are unavailable, record the limitation and use a Workbox-level request-handler test rather than claiming browser verification.

- [ ] **Step 6: Change policy only if the sequence fails**

If offline legacy lookup fails, preserve `cacheName: 'kana-game-media'` and fix only the route match/order or Workbox cleanup option causing deletion. If online refresh fails, preserve `NetworkFirst`; do not revert to 180-day `CacheFirst` for same-URL audio.

Rerun:

```powershell
npx vitest run vite.config.test.ts
npm run build
```

- [ ] **Step 7: Update ledger and commit**

```powershell
git add vite.config.ts vite.config.test.ts docs/release-audit/2026-08-21-findings.md
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git commit -m "test(pwa): lock legacy audio cache upgrade"
```

If the policy required a code change, use `fix(pwa): preserve legacy audio through updates`.

---

### Task 10: Deployment Quality Gates

**Files:**
- Create: `src/deployWorkflow.test.ts`
- Modify: `.github/workflows/deploy.yml`
- Modify: `docs/release-audit/2026-08-21-findings.md`

**Interfaces:**
- Consumes: the GitHub Pages build job after `npm ci`.
- Produces: ordered `npm run lint`, `npm test`, then `npm run build` gates before artifact upload.

- [ ] **Step 1: Add a failing workflow contract test**

Create `src/deployWorkflow.test.ts`:

```tsx
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('GitHub Pages deployment workflow', () => {
  it('runs lint, tests, and the TypeScript production build before upload', () => {
    const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
    const lint = workflow.indexOf('- run: npm run lint')
    const test = workflow.indexOf('- run: npm test')
    const build = workflow.indexOf('- run: npm run build')
    const upload = workflow.indexOf('actions/upload-pages-artifact@')
    expect(lint).toBeGreaterThan(-1)
    expect(test).toBeGreaterThan(lint)
    expect(build).toBeGreaterThan(test)
    expect(upload).toBeGreaterThan(build)
  })
})
```

- [ ] **Step 2: Verify RED**

```powershell
npx vitest run src/deployWorkflow.test.ts
```

Expected: FAIL because lint and test steps are absent.

- [ ] **Step 3: Add the missing CI gates**

In the build job, immediately after `npm ci`, use this order:

```yaml
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

- [ ] **Step 4: Run the workflow contract and local equivalents**

```powershell
npx vitest run src/deployWorkflow.test.ts
npm run lint
npm test
npm run build
```

- [ ] **Step 5: Update ledger and commit**

```powershell
git add .github/workflows/deploy.yml src/deployWorkflow.test.ts docs/release-audit/2026-08-21-findings.md
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git commit -m "ci: gate deployment on lint and tests"
```

---

### Task 11: Residual Audit and Regression Sweep

**Files:**
- Modify: `docs/release-audit/2026-08-21-findings.md`
- Modify/Create: only focused production/test files for newly reproduced Critical/High defects.

**Interfaces:**
- Consumes: all prior commits and the complete finding ledger.
- Produces: zero open confirmed Critical/High findings and evidence-backed Medium/Low dispositions.

- [ ] **Step 1: Search adjacent lifecycle and persistence patterns**

Run:

```powershell
rg -n "setTimeout\(|setInterval\(|addEventListener\(|new Audio\(|speechSynthesis|localStorage|persist\(" src vite.config.ts
rg -n "startSession|startMistakeReview|onRetry|sessionKey|reviewCount|weakWords|weakCharacterIds" src
rg -n "romaji.*'-'|romaji: '-'|characterIds" src/data src/lib
rg -n "runtimeCaching|cacheName|cleanupOutdatedCaches|skipWaiting|clientsClaim" vite.config.ts src public
rg -n "setRoundIndex|setFinished|advance" src/routes/games src/hooks
```

For each newly suspicious path, add a row to the ledger before deciding whether it is a defect.

- [ ] **Step 2: Inspect every final production diff for second-order regressions**

Run:

```powershell
git diff main...HEAD -- src vite.config.ts .github/workflows/deploy.yml
git diff --check main...HEAD
git log --oneline --decorate main..HEAD
```

Check explicitly that running sessions remain frozen, mistake review still resolves completed-attempt IDs, Review fallback is nonempty, persistence actions survive merge, canonical romaji remains accepted, only one delayed action is pending, and PWA images retain their existing CacheFirst rule.

- [ ] **Step 3: Run the complete development-worktree matrix**

```powershell
npm run lint
npm test
npm run build
git status --short --branch
```

Expected: all pass and status is clean. If a gate fails, reproduce it with the narrowest command, add a regression test when it is a code defect, fix minimally, rerun the focused command, then rerun this full matrix.

- [ ] **Step 4: Close or explicitly retain every ledger item**

No row may remain `Open` or `Unverified`. Each row must be one of:

- Confirmed / Fixed
- Not reproduced / No code change
- Already fixed / Regression test added
- Intentional constraint / No code change
- Deferred Medium or Low / exact impact and reason

Confirmed Critical and High counts must both be zero before Task 12.

- [ ] **Step 5: Commit the final ledger state**

```powershell
git add docs/release-audit/2026-08-21-findings.md
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: finalize release audit findings"
```

---

### Task 12: Second Clean Worktree Verification and Release Report

**Files:**
- Read: committed audit branch only.
- Modify: no repository files unless verification reproduces a defect.

**Interfaces:**
- Consumes: clean committed `codex/release-audit` HEAD with zero confirmed Critical/High findings.
- Produces: clean-checkout install/lint/test/typecheck/build evidence and the user's requested final report.

- [ ] **Step 1: Verify audit worktree HEAD and create a second fresh checkout**

From the main repository directory, resolve explicit paths and run:

```powershell
git -C .worktrees/release-audit status --short --branch
git -C .worktrees/release-audit rev-parse HEAD
git worktree add --detach .worktrees/release-verification codex/release-audit
git -C .worktrees/release-verification status --short --branch
```

Expected: both worktrees point to the same commit; verification checkout is detached and clean.

- [ ] **Step 2: Install and run every gate from committed files only**

```powershell
Set-Location .worktrees/release-verification
npm ci
npm run lint
npm test
npm run build
git status --short --branch
```

Record exit codes, test file/test counts, and build completion. `npm run build` is both the TypeScript typecheck (`tsc -b`) and production Vite build.

- [ ] **Step 3: Handle a clean-verification failure without masking it**

If any command fails, return to `.worktrees/release-audit`, reproduce the same failure there, add the smallest regression/fix commit, rerun Task 11's full matrix, then remove only the explicit verification worktree through `git worktree remove .worktrees/release-verification`, recreate it from the new committed HEAD, and repeat Step 2. Do not claim release readiness from the development worktree alone.

- [ ] **Step 4: Confirm final commit range and changed paths**

```powershell
git -C .worktrees/release-audit log --oneline main..codex/release-audit
git -C .worktrees/release-audit diff --name-status main...codex/release-audit
git -C .worktrees/release-audit status --short --branch
git -C .worktrees/release-verification status --short --branch
```

- [ ] **Step 5: Produce the final report only after all evidence is present**

Report exactly these sections in Japanese:

1. 修正した問題
2. 残った問題
3. Critical / High / Medium / Low件数
4. 追加したテスト
5. clean checkout検証結果（`npm ci`, lint, tests, TypeScript, production build, status）
6. PWA / offline audio / browser検証結果
7. 変更ファイル
8. 作成コミットと取り込み候補範囲
9. 残存リスク

State `RELEASE_READY=YES` only when confirmed Critical = 0, confirmed High = 0, both worktrees are clean, every clean-verification command passes, and no major progression blocker remains in Review / Retry / queue / accuracy / localStorage / PWA / audio. Otherwise state `RELEASE_READY=NO` and name the exact failed exit condition.
