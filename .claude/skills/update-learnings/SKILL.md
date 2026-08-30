---
name: update-learnings
description: Review the current KanaGame session and update Learnings.md only with new reusable project-level lessons.
---

Review the work completed in the current session and the relevant existing entries in `Learnings.md`.

Identify only new, reusable KanaGame learnings that would improve a future decision, implementation, debugging session, test, or review. Consider:
- patterns that worked,
- mistakes or failure modes to avoid,
- non-obvious KanaGame domain knowledge,
- unresolved questions worth revisiting.

Before adding anything:
1. Check whether the insight is already documented in `CLAUDE.md`, a focused doc, code comment, test, Auto Memory, or `Learnings.md`.
2. Do not duplicate stable repository truth merely to make this file longer.
3. Do not record routine commands, temporary hypotheses, one-off debugging output, or a chronological session summary.

When updating `Learnings.md`:
- One item = one insight.
- Add the current date to every new item.
- Keep the wording concise and actionable.
- Put raw observations only in `Patterns That Work`, `Mistakes to Avoid`, `Domain Knowledge`, or `Open Questions`.
- Do not add directly to `Consolidated Principles` unless repeated observations or strong evidence already support a durable principle.
- If a new observation contradicts an old entry, update or retire the old entry rather than preserving both as if both were current.

If the session produced no genuinely reusable learning, make no change and say so.
