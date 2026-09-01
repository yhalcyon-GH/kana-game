# Definition of Done

Applies to non-trivial KanaGame changes carried out through the shared [`ai-development-loop.md`](./ai-development-loop.md), whether the coding agent is Claude Code, Codex, or an equivalent manual workflow.

A task is Done from the **Builder** perspective when all of the following are true:

- **Acceptance Criteria satisfied** — every criterion the user gave is met; none silently dropped or reinterpreted.
- **Focused tests pass** — the tests directly covering the changed behavior pass.
- **Full verification passes** — `npm run verify` passes (tests, lint, build, `git diff --check`).
- **Lint pass** — `npm run lint` is clean.
- **Build pass** — `npm run build` (includes `tsc -b` type checking) is clean.
- **`git diff --check` pass** — no trailing whitespace / conflict-marker errors in the diff.
- **Diff self-review pass** — the full `git diff` was read and checked for unintended files, debug code, stale comments, accidental generated files, secrets, unnecessary refactors, and documentation mismatches.
- **No unintended files** — only files relevant to the task are staged/committed.
- **Required docs updated** — if the change affects behavior described in `CLAUDE.md`, `AGENTS.md`, `docs/`, or `Learnings.md`, those were updated (or a stale contradiction was fixed) — not skipped in favor of code-only changes.
- **Reviewable PR created** — against `main`, with Goal, What changed, Acceptance Criteria, Tests/verification, and Risks/notes. Normal completed Builder work opens a **non-Draft PR** so review can continue on that same PR through merge. Use Draft only for a genuinely incomplete/WIP handoff that still needs Builder work before review.
- **Known risks explicitly reported** — anything uncertain, deferred, or flagged for human judgment is stated in the PR/report, not silently omitted.

Builder completion is not merge authorization. Independent review when required, consequential human approval, live exact-HEAD merge checks, and merge remain separate gates.

## When some items don't apply

Not every task exercises every gate. When a step has no meaningful signal for the task at hand, it may be omitted from Done — but only when stated explicitly, with the reason:

- **Binary-only changes** (e.g. regenerated audio/image assets with no source/logic change): `npm run lint` and `npm run build` still run (they're cheap and catch unrelated breakage) but are not evidence *about* the asset itself; note that the asset's correctness was verified by listening/viewing/provenance check instead, and that `git diff --check` is meaningless for binary files.
- **Content-only / documentation-only changes** (no `src/` or `public/` changes): focused tests and `npm run build` may have nothing to exercise; state that no test/build signal applies to this diff rather than silently skipping the line item.
- **Docs-only changes with no code diff**: the "no unintended files" and diff self-review steps still apply — omission is never about skipping self-review, only about steps that have no applicable signal.

Omitting a step without saying why is not allowed; the report must name the step and the reason it doesn't apply to this task.
