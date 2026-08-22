---
name: consolidate-learnings
description: Curate KanaGame Learnings.md by removing stale items, merging duplicates, resolving questions, and synthesizing durable principles.
---

Review the entire `Learnings.md` as a knowledge-maintenance pass, not as a session summary.

Perform these steps:
1. Remove obsolete, disproved, or no-longer-useful raw observations.
2. Merge duplicate or substantially overlapping items.
3. Shorten verbose entries without losing the actionable insight.
4. Resolve or remove `Open Questions` when later evidence now answers them.
5. Identify patterns repeated across multiple observations or supported by strong evidence.
6. Promote only sufficiently supported, durable lessons into `Consolidated Principles`.
7. Once a principle or invariant is better represented canonically in `CLAUDE.md`, a focused doc, code comment, or regression test, prefer that canonical location and avoid redundant wording here.
8. Re-evaluate existing `Consolidated Principles`; revise, demote, or remove any that newer evidence weakens.

Rules:
- Preserve the distinction between raw observations and synthesized principles.
- One item = one insight.
- Do not invent a principle merely to reduce item count.
- Prefer fewer, stronger entries over exhaustive history.
- Current user instructions, current code/tests, and newer evidence override older learnings.
- The final file should be shorter or more useful than before the pass.

Run this periodically when it is useful, and especially when the raw sections become repetitive or approach roughly 80–100 items. Do not consolidate merely because a calendar interval elapsed if there is little to clean up.
