# Definition of Done

Applies to non-trivial KanaGame changes carried out through the shared [`ai-development-loop.md`](./ai-development-loop.md), whether the coding agent is Claude Code, Codex, or an equivalent manual workflow.

A task is Done from the **Builder** perspective when all of the following are true:

- **Acceptance Criteria satisfied** — every criterion the user gave is met; none silently dropped or reinterpreted.
- **Focused tests pass** — the tests directly covering the changed behavior pass.
- **Required non-unit verification completed** — browser/visual/device/source/provenance checks required by the task or the changed surface were performed. If a required tool/check is unavailable, the Builder must report the gap explicitly and leave it for the reviewer/orchestrator to close or explicitly waive; it is not silently counted as done.
- **Full verification passes on the final candidate** — the latest full `npm run verify` rerun is clean. If an earlier failure is believed to be flaky/pre-existing/unrelated, gather evidence first, record it if useful, then obtain a clean final full rerun before handoff.
- **Lint pass** — `npm run lint` is clean.
- **Build pass** — `npm run build` (includes `tsc -b` type checking) is clean.
- **`git diff --check` pass** — no trailing whitespace / conflict-marker errors in the diff.
- **Diff self-review pass** — the full `git diff` was read and checked for unintended files, debug code, stale comments, accidental generated files, secrets, unnecessary refactors, weakened checks, and documentation mismatches.
- **No unintended files** — only files relevant to the task are staged/committed.
- **Required docs updated** — if the change affects behavior described in `CLAUDE.md`, `AGENTS.md`, `docs/`, or `Learnings.md`, those were updated (or a stale contradiction was fixed) rather than skipped in favor of code-only changes.
- **Reviewable PR created** — against `main`, with Goal, What changed, Acceptance Criteria, Tests/verification, and Risks/notes. Normal completed Builder work opens a **non-Draft PR** so review can continue on that same PR through merge. Use Draft only for a genuinely incomplete/WIP handoff that still needs Builder work before review.
- **Known risks explicitly reported** — anything uncertain, deferred, flaky, or unavailable for verification is stated in the PR/report, not silently omitted.

Builder completion is not merge authorization. Independent review when required, consequential human approval, live exact-HEAD merge checks, and merge remain separate gates.

## Evidence expectations by change type

Use the evidence pattern from `ai-development-loop.md` rather than applying one test style to every task:

- **Large data/corpus migration:** inventory-wide deterministic invariants for completeness/mapping plus bounded representative sampling/visual verification where needed; exhaustive manual review is not required when the invariant proves the property better.
- **Browser-sensitive geometry:** real-browser verification is required for `clipPath`/mask/transform/viewBox/geometry behavior that jsdom cannot faithfully prove.
- **Generated-data freshness:** canonical output stays canonical; platform-only representation normalization is acceptable only when the mismatch was measured/proven and content-tamper tests remain strict.
- **Staged replacement/removal:** before deleting a fallback/data/license path, the replacement's current coverage and required smoke evidence must already be established.

## When some items don't apply

Not every task exercises every gate. When a step has no meaningful signal for the task, it may be omitted from Done — but only when stated explicitly, with the reason:

- **Binary-only changes** (e.g. regenerated audio/image assets with no source/logic change): `npm run lint` and `npm run build` still run when practical (they're cheap and catch unrelated breakage) but are not evidence *about* the asset itself; note that the asset's correctness was verified by listening/viewing/provenance check instead, and that `git diff --check` is meaningless for binary files.
- **Content-only / documentation-only changes** (no `src/` or `public/` behavior changes): focused tests or browser checks may have no useful signal; state that explicitly rather than manufacturing a test.
- **Docs-only changes with no code diff**: the no-unintended-files and diff self-review steps still apply. A lightweight verification path is acceptable when full runtime verification has no relationship to the diff, but the omission and reason must be reported.

Omitting a step without saying why is not allowed; the report must name the step and the reason it doesn't apply to this task.
