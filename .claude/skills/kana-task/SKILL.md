---
name: kana-task
description: Run a standard non-trivial KanaGame development task end-to-end — Explore, Plan, Implement, Verify, Inspect, Fix, Commit, Push, Draft PR — from a Goal and Acceptance Criteria, without requiring a long implementation prompt each time.
---

Standard loop for non-trivial KanaGame work. Input is a Goal and Acceptance Criteria (from the user, or an issue). Output is a **Draft PR** against `main` that meets [`docs/definition-of-done.md`](../../../docs/definition-of-done.md). Overall context: [`docs/ai-development-loop.md`](../../../docs/ai-development-loop.md).

Never merge to `main`. This Skill stops at "Draft PR opened"; review, Ready-for-Review transition, AI review, and merge are separate gates.

## 1. Preflight

Before anything else, confirm:

- The repository is `kana-game` (check remote / directory, not by assumption).
- `git status` — read it fully.
- Current branch and whether it's `main`.
- `origin/main` HEAD, and whether the current branch is behind/ahead/diverged.
- Relevant `CLAUDE.md` rules for the area being touched.
- Relevant `Learnings.md` entries (per `.claude/rules/learnings.md` — evidence, not rigid rules).
- The current code and tests in the area being touched.

**Never commit directly to `main`.** Every task needs a fresh, dedicated branch created from current `origin/main` — unless the current branch is already explicitly the dedicated branch for this exact task (e.g. resuming a task whose branch/PR already exists). If on `main`, or on any other branch not already dedicated to this task (an unrelated feature branch, a leftover branch from earlier work), create a new branch off `origin/main` before making any change — don't continue a new task on top of unrelated branch history.

**Never discard uncommitted changes you didn't create this session.** If `git status` shows uncommitted changes and it's not obvious they belong to the current task, stop and ask, or preserve them (e.g. `git stash push -u` with a clear message) before switching branches — don't silently drop or overwrite them.

## 2. Explore

Read the relevant code and tests before changing anything. Do not guess at existing architecture — find and read it. Use `useCurriculum()`, `src/data/`, `src/store/progressStore.ts` and the other boundaries documented in `CLAUDE.md` as your map; if a change would cross one of those boundaries, that's a signal to read further before proceeding.

When narrative docs (`docs/*.md`, `CLAUDE.md` prose) conflict with what the code/tests actually do, resolve in this order:

1. Explicit current user instruction.
2. Current tests/code.
3. Newer repository evidence (recent commits, recent PRs).
4. Narrative docs.

If you find a stale doc that materially conflicts with current code (e.g. a doc claims a feature was removed but it's clearly implemented and tested), fix the stale doc as part of the task rather than perpetuating it — but keep that fix scoped and don't turn it into an unrelated documentation cleanup pass.

## 3. Plan

Before writing code, make explicit (internally — no need to present a long plan back to the user for routine tasks):

- Goal
- Scope
- Non-goals
- Acceptance Criteria (verbatim from the user where possible)
- Files likely affected
- Tests needed
- Risks

**Stop and ask the user before proceeding** if any of these apply:

- A significant ambiguity would change product behavior.
- The task requires a destructive operation (deleting data, force-push, history rewrite).
- The task requires paid external API usage (e.g. TTS/audio generation costs money and produces git-visible files — see `CLAUDE.md`).
- The task requires a secret or API key that isn't already configured.
- The task requires an irreversible data migration.
- The task requires a *new, unresolved* legal/licensing judgment. If the Goal/Acceptance Criteria already provide an approved licensing decision/source and no new legal ambiguity appears during Explore, proceed — while preserving required license notices, attribution, and provenance requirements — instead of stopping.
- The scope is expanding well beyond what the Goal/Acceptance Criteria describe.

Otherwise, proceed without demanding a lengthy plan confirmation from the user.

## 4. Implement

Prefer the smallest change that satisfies the Acceptance Criteria. Do not silently change any of, per the v1 safety guardrails (CLAUDE.md's guardrail list plus additions specific to this Skill):

- Game rules.
- Answer-correctness behavior.
- SRS/review/unlock thresholds.
- Feedback/reaction behavior.
- Deliberately removed curriculum content.
- Curriculum structure.
- Paid/external audio.
- Licensing/provenance of assets.
- Monetization behavior.

Only touch these when an Acceptance Criterion explicitly calls for it.

## 5. Focused Verify

Run the tests directly covering the changed behavior first (fast feedback), e.g. `npx vitest run <path>` for the relevant file(s).

## 6. Full Verify

Before considering the task complete, run:

```bash
npm run verify
```

(Runs `npm test && npm run lint && npm run build && git diff --check`.)

If it fails:

- Investigate the actual cause — don't guess.
- If the failure stems from this task's change, fix it.
- If you suspect it's unrelated/pre-existing/flaky, gather evidence (e.g. reproduce on `main` before your change) before treating it as unrelated.
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

## 8. Fix if needed

Address anything found in Inspect.

## 9. Re-verify

Re-run focused tests and `npm run verify` after any fix from step 8.

## 10. Commit

Commit only the files relevant to this task. Use a clear message describing why, not just what.

## 11. Push

Push the branch (never `main`) to `origin`.

## 12. Open Draft PR

Open the PR against `main` as **Draft**, not Ready for Review. Draft is the normal state while ChatGPT/human review and bundled follow-up fixes are still possible; it prevents expensive AI review from running on every push.

PR body must include at minimum:

- **Goal**
- **What changed**
- **Acceptance Criteria** (and whether each is met)
- **Tests / verification** (what was run, results)
- **Risks / notes** (anything uncertain, deferred, or worth human attention)

Do not mark it Ready and do not merge. Leave those transitions to the review/merge gate described in `docs/ai-development-loop.md`.

## 13. Final report

Report back to the user with at least:

1. Branch name
2. HEAD SHA
3. Changed files
4. Test/verify results (pass/fail, counts where available)
5. Lint result
6. Build result
7. `git diff --check` result
8. Any stale docs/CLAUDE.md rules fixed, and why
9. Unresolved concerns / open risks
10. Draft PR URL

If any Definition of Done item was intentionally skipped, name it and say why (see "When some items don't apply" in `docs/definition-of-done.md`) — never skip silently.
