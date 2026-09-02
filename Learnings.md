# Learnings

Shared, version-controlled improvement memory for **kana-game**.

This file is intentionally curated. Claude Code's Auto Memory may capture local working notes automatically; this file keeps only project learnings worth sharing across sessions, tools, machines, and reviewers.

## Rules

- Keep raw observations separate from synthesized principles.
- One item = one insight.
- Every item includes a date.
- Add only knowledge that can improve a future KanaGame decision, implementation, debug session, or review.
- Do not store routine task history, temporary debugging output, facts already clear in `CLAUDE.md`, or duplicated items.
- Current user instructions, current code/tests, and new evidence override old learnings.
- When a learning becomes stable repository truth, promote the canonical version to `CLAUDE.md`, a focused doc, code comment, or regression test instead of duplicating it here forever.

The first four sections are **raw observations**. `Consolidated Principles` contains only principles synthesized from repeated observations or strong evidence.

## Patterns That Work

- 2026-09-02 — A compact canonical final snapshot is safer for autonomous work than asking a Builder to infer intent from a long Issue with superseding comments.
- 2026-09-02 — Check executor filesystem reach before assigning local-asset work; route unreachable paths to the local Builder explicitly.
- 2026-09-02 — Cross-cutting migrations require downstream handoffs to refresh their runtime contract; historical extensions and paths are stale until verified.
- 2026-09-02 — Offline handoffs should name the already-merged baseline, pending assets/fallbacks, verification, and stop conditions.
- 2026-09-02 — Describing a shared shell once with an explicit variant-delta matrix reduces duplicated logic and review burden.

- 2026-08-22 — When debugging a reproducible regression, first establish the failing behavior, add or identify a regression test, make the smallest correction, then run focused and broader verification.
- 2026-08-22 — For stateful review sessions, keep the session queue and the data used to resolve that queue from a consistent session snapshot when live progress updates can remove items mid-session.

## Mistakes to Avoid

- 2026-08-22 — Do not combine a fixed Review queue with a resolver derived from a live weakness pool that changes after each answer; queued IDs can become unresolvable and break session progression.
- 2026-08-22 — Do not reuse a completed Review snapshot for Play Again when the intended behavior is to reflect newly updated progress; distinguish replay-from-current-state from mistake-review-of-the-completed-session.
- 2026-08-22 — Do not mix delayed progression via `setTimeout` with an immediate `advance()` path unless the pending timer is explicitly cancelled; double advancement can skip unanswered items or corrupt score denominators.
- 2026-08-22 — Do not assume persisted Zustand state is safe under a shallow merge after schema changes; test rehydration with realistic older or partial persisted data so new required defaults cannot disappear.

## Domain Knowledge

- 2026-08-22 — Review eligibility can arise from word-level weakness even when there is no character-level weakness; Review counts and queues must account for both layers consistently.

## Open Questions

- 2026-08-22 — Does maintaining this checked-in `Learnings.md` alongside Claude Code Auto Memory improve implementation/review quality enough to justify the extra curation? Evaluate after real use and simplify or remove it if not.

## Consolidated Principles

_No project-specific principle has been promoted yet. Promote only after repeated observations or strong evidence._
