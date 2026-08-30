# KanaGame Release Audit Design

## Objective

Bring the committed KanaGame repository from `0ff6bbc` to a release-ready state by repeatedly investigating, reproducing, fixing, regression-testing, and re-auditing until no confirmed Critical or High issues remain and a new clean checkout passes install, lint, all tests, TypeScript, and the production build.

## Scope

The audit covers the existing application behavior and the known findings supplied by the user:

- Review and Retry behavior, including frozen pools and independently weak words
- queue construction and session accuracy
- persisted progress and Review decisions derived from localStorage
- romaji placeholder answer handling
- overlapping or superseded audio playback
- repeated Tracing actions
- answer-advance timer cleanup
- PWA upgrades and offline playback for users who only have an older audio cache
- other previously reported Medium findings that can be grounded in repository evidence

Low-severity findings may be fixed only when the change is small, local, and low-risk. Large refactors are reported instead of implemented. Existing game rules, correctness rules, SRS thresholds, unlock behavior, and feedback phrase behavior remain unchanged unless the user explicitly approves a behavior change.

## Workspace Strategy

Development starts from committed HEAD `0ff6bbc` on an isolated branch named `codex/release-audit` in a project-local ignored worktree. The current `main` checkout remains untouched except for any repository-level worktree-ignore setup required before creating the isolated checkout.

The worktree receives a clean dependency installation with `npm ci`, followed by baseline lint, full tests, and production build. A failing baseline is investigated before any product change so pre-existing failures are not confused with regressions.

After the audit branch is complete, a second fresh verification worktree is created from its committed HEAD. Only committed files are present there. That checkout performs `npm ci`, lint, all tests, and the production build. The verification worktree is not removed until its results and clean status are recorded.

## Investigation Model

Every candidate issue follows the same evidence-first loop:

1. Trace the relevant state and control flow from static data, persisted progress, hooks, route components, and shared game-session helpers.
2. Reproduce the reported behavior deterministically with an automated test when feasible.
3. If the report cannot be reproduced, record the evidence and do not change production code.
4. If reproduced, state one root-cause hypothesis and compare the broken path with a working path in the repository.
5. Add the smallest regression test that demonstrates the expected behavior and confirm that it fails for the expected reason.
6. Implement one minimal root-cause fix.
7. Confirm the focused test passes, then run the affected suite and the full suite before committing.
8. Reinspect adjacent retry, empty-state, stale-state, timer, and persistence paths for second-order failures.

Configuration-only PWA changes use the closest deterministic test available: validate the Vite/Workbox configuration and generated service worker, then exercise the upgrade/offline sequence in a local browser when the environment supports it. The generated `dist/` directory remains untracked.

## Work Packages

### 1. Baseline and Finding Inventory

Create the isolated worktree, perform a clean install and baseline checks, locate prior audit notes and relevant recent commits, and build a finding ledger with severity, reproduction status, evidence, and owning files. No production code changes occur in this package.

### 2. Review, Retry, Queue, and Accuracy

Audit Review pool creation and freezing, Retry transitions, due/weak word inclusion, Review badge counts, queue weighting, round accounting, and accuracy calculation. Preserve intentional frozen-pool semantics during a running session while ensuring Retry starts from the correct updated source state.

### 3. Persistence and Answer Checking

Audit Zustand persistence hydration, malformed or stale localStorage data, Review eligibility after hydration, storage migration/default behavior, and romaji placeholders. Placeholder values used to represent context-dependent pronunciation must never become accepted learner answers unless the existing game rule explicitly defines them as valid.

### 4. Interaction Lifecycles

Audit superseded audio requests, fallback behavior, repeated Tracing actions, answer-advance timers, route unmounts, and session resets. Cleanup must prevent obsolete asynchronous work from changing the current round or producing duplicate effects.

### 5. PWA Upgrade and Offline Audio

Audit cache names, strategies, expiration settings, service-worker generation, update behavior, and fallback paths. Reproduce the specific upgrade case where an existing user has only an older cached audio entry and updates while offline. Confirm online users refresh same-URL recordings while offline users can continue playing previously cached audio.

### 6. Residual Audit and Clean Verification

Search for the same bug patterns in neighboring routes and shared helpers, run the complete verification matrix, inspect the final diff and commits, and create the second clean verification worktree. Completion requires zero confirmed Critical and High findings; unresolved Medium and Low items are reported with evidence and impact.

## Testing Strategy

- Pure state and selection logic: focused Vitest unit tests
- Hooks: `renderHook` tests with explicit store setup and cleanup
- Routes and interactions: Testing Library tests using fake timers only where timer behavior is the subject
- Audio: provider contract tests that distinguish current and superseded requests
- PWA: configuration/generated-service-worker assertions plus local-browser upgrade/offline verification where supported
- Regression discipline: every production bug fix begins with a failing test and records the red/green commands
- Global verification: `npm run lint`, `npm test`, and `npm run build`
- Clean verification: `npm ci` before the same checks in a new worktree

## Commit Strategy

Commits are small and issue-focused. A commit contains the failing regression test, minimal fix, and directly related documentation only. Generated audio, images, fonts, and unrelated formatting are excluded. `git add .`, destructive Git operations, rebases, force operations, and pushes are prohibited.

## Completion Evidence

The final report includes:

- confirmed and false-positive findings with severity
- fixed issues and their root causes
- remaining Critical, High, Medium, and Low counts
- regression tests added, including their red/green evidence
- clean-checkout install, lint, test, TypeScript, and production-build results
- browser/PWA/audio verification performed and any environment limitation
- changed files and commits
- residual risks and larger refactors intentionally deferred

The task is not complete after the first fix or after checks pass in the development worktree. It ends only after the residual audit and committed clean-checkout verification meet the stated exit criteria.
