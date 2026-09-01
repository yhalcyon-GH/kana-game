---
name: kana-task
description: Run a standard non-trivial KanaGame development task end-to-end — Explore, Plan when useful, Implement, Verify, Inspect, Fix, Commit, Push, PR — from a Goal and Acceptance Criteria, without requiring a long implementation prompt each time.
---

Standard Builder loop for non-trivial KanaGame work. Input is a Goal and Acceptance Criteria (from the user, or an issue). Output is a **reviewable PR** against `main` that meets [`docs/definition-of-done.md`](../../../docs/definition-of-done.md). Overall context: [`docs/ai-development-loop.md`](../../../docs/ai-development-loop.md).

Never merge to `main`. This Skill stops at "PR opened"; review-depth assignment, independent review, human approval when required, live merge-gate checks, and merge are separate gates. Normal completed work opens one **non-Draft** PR and keeps using that same PR through review/fixes/merge. Use Draft only for a genuinely incomplete/WIP handoff.

## 1. Preflight

Before anything else:

- Refresh/fetch `origin` so `origin/main` is current.
- Confirm the repository is `kana-game` (check remote / directory, not by assumption).
- Read `git status` fully.
- Confirm current branch and whether it's `main`.
- Confirm current `origin/main` HEAD, and whether the current branch is behind/ahead/diverged.
- If a task branch/PR already exists, confirm its actual HEAD and that it is the exact task being resumed.
- Read relevant `CLAUDE.md` rules for the area being touched.
- Read relevant `Learnings.md` entries (per `.claude/rules/learnings.md` — evidence, not rigid rules).
- Read the current code and tests in the area being touched.

**Agent/environment handoff is not implicit state transfer.** If this task came from Codex, another worktree, another machine, or an old Claude session, treat the checkout and branch as potentially stale until the checks above prove otherwise.

**Never commit directly to `main`.** Every new task needs a fresh, dedicated branch created from current `origin/main` — unless the current branch is already explicitly the dedicated branch for this exact task (e.g. resuming a task whose branch/PR already exists). If on `main`, or on any other branch not already dedicated to this task, create a new branch off `origin/main` before making any change.

**Never discard uncommitted changes you didn't create this session.** If `git status` shows uncommitted changes and it's not obvious they belong to the current task, stop and ask, or preserve them safely before switching branches — don't silently drop or overwrite them.

## 2. Explore

Read the relevant code and tests before changing anything. Do not guess at existing architecture — find and read it. Use `useCurriculum()`, `src/data/`, `src/store/progressStore.ts` and the other boundaries documented in `CLAUDE.md` as your map; if a change would cross one of those boundaries, that's a signal to read further before proceeding.

Use the source-of-truth order from `docs/ai-development-loop.md`:

1. Explicit current user decision.
2. Accepted current Goal / Acceptance Criteria and any approved product/decision specification.
3. Current tests/code as evidence of implemented behavior.
4. Newer repository evidence (recent commits, recent PRs).
5. Older narrative/historical docs.

If you find a stale doc that materially conflicts with the accepted current behavior or specification, fix it as part of the task when relevant — but keep that fix scoped and don't turn it into an unrelated documentation cleanup pass.

## 3. Plan

Make explicit internally:

- Goal
- Scope
- Non-goals
- Acceptance Criteria (verbatim from the user where possible)
- Files likely affected
- Tests needed
- Risks

Planning depth should match task complexity. If the intended diff is obvious and bounded, do not stop for a formal plan ceremony. Use a more explicit plan before implementation when the approach is uncertain, multiple concerns are coupled, the architecture is unfamiliar, or the resulting change would otherwise be hard to review.

**Stop and ask the user before proceeding** if any of these apply:

- A significant ambiguity would change product behavior.
- The task requires a destructive operation (deleting data, force-push, history rewrite).
- The task requires paid external API usage (e.g. TTS/audio generation costs money and produces git-visible files — see `CLAUDE.md`).
- The task requires a secret or API key that isn't already configured.
- The task requires an irreversible data migration.
- The task requires a *new, unresolved* legal/licensing judgment. If the Goal/Acceptance Criteria already provide an approved licensing decision/source and no new legal ambiguity appears during Explore, proceed while preserving required notices/provenance.
- The scope is expanding well beyond what the Goal/Acceptance Criteria describe.

Otherwise, proceed without demanding plan confirmation from the user.

## 4. Implement

Prefer the smallest change that satisfies the Acceptance Criteria. Do not silently change any of, per the project guardrails:

- Game rules.
- Answer-correctness behavior.
- SRS/review/unlock thresholds.
- Feedback/reaction behavior.
- Deliberately removed curriculum content.
- Curriculum structure.
- Paid/external audio.
- Licensing/provenance of assets.
- Monetization behavior.

Only touch these when an Acceptance Criterion explicitly calls for it or the user has already approved the decision.

## 5. Focused Verify

Run the tests directly covering the changed behavior first (fast feedback), e.g. `npx vitest run <path>` for the relevant file(s).

For UI changes, use available visual/browser verification when it would materially catch problems that jsdom/unit tests cannot.

For SVG `clipPath`/mask/transform/viewBox/geometry changes, browser verification must explicitly inspect complete geometry visibility, clipping/alignment, and the actual animated/replayed state at representative desktop and mobile widths. Merely confirming that the page renders is not enough for geometry that can be silently clipped or shifted by browser coordinate semantics.

If the same reusable visual primitive has just produced a real-device-only failure, do one bounded real-device smoke check before broad rollout of that primitive/data family. This is a targeted regression gate for a demonstrated failure mode, not a requirement to test every ordinary UI change on a physical device.

## 6. Full Verify

Before considering the task complete, run:

```bash
npm run verify
```

(Runs the repository's full test/lint/build/diff checks, including any fail-fast generated-data gates configured in `package.json`.)

If it fails:

- Investigate the actual cause — don't guess.
- If the failure stems from this task's change, fix it.
- If you suspect it's unrelated/pre-existing/flaky, gather evidence before treating it as unrelated.
- Never report success while `npm run verify` is failing.

## 7. Inspect Diff

Read the full `git diff` yourself. Check for:

- Unintended files (stray scratch files, accidental generated output, files from someone else's uncommitted work).
- Debug code (console.log, commented-out blocks, temporary flags).
- Stale comments that no longer match the code.
- Accidentally-committed generated/build artifacts.
- Secrets or credentials.
- Unnecessary refactors beyond the task's scope.
- Any Acceptance Criterion not actually reflected in the diff.
- Regression risk in adjacent behavior.
- Documentation that now mismatches the new behavior.
- Any weakening/removal/skipping of tests, CI, lint, or safety checks without explicit justification.

## 8. Fix if needed

Address anything found in Inspect.

## 9. Re-verify

Re-run focused tests and `npm run verify` after any fix from step 8.

## 10. Commit

Commit only the files relevant to this task. Use a clear message describing why, not just what.

## 11. Push

Push the branch (never `main`) to `origin`.

## 12. Open one reviewable PR

For a completed Builder candidate, open a **normal non-Draft PR** against `main`. This is the default handoff. ChatGPT/human review, follow-up pushes, deterministic PR Verify, optional independent review, and merge should stay on this same PR instead of creating a Draft → Ready → replacement loop.

Use a Draft PR only when the task is genuinely incomplete/WIP and the handoff explicitly needs more Builder work before normal review. Do not use Draft merely as routine ceremony.

PR body must include at minimum:

- **Goal**
- **What changed**
- **Acceptance Criteria** (and whether each is met)
- **Tests / verification** (what was run, results)
- **Risks / notes** (anything uncertain, deferred, or worth human attention)

Do not add the Claude model-review opt-in yourself unless the user/ChatGPT review gate explicitly assigns Claude as the independent reviewer. When explicitly assigned, the gate adds the exact dedicated line to the existing PR. Do not merge.

## 13. Final report

Report back to the user with at least:

1. Branch name
2. Task-start `origin/main` SHA
3. HEAD SHA
4. Changed files
5. Test/verify results (pass/fail, counts where available)
6. Lint result
7. Build result
8. `git diff --check` result
9. Any stale docs/CLAUDE.md rules fixed, and why
10. Unresolved concerns / open risks
11. PR URL and whether it is normal reviewable or intentionally Draft/WIP

If any Definition of Done item was intentionally skipped, name it and say why — never skip silently.
