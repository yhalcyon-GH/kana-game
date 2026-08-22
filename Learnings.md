# Learnings.md

This file is the shared improvement memory for work on **kana-game** across ChatGPT, Claude Code, and human review.

It is not a second `CLAUDE.md`.

- `CLAUDE.md` = the current, trusted description of the repository and its design constraints.
- `Learnings.md` = reusable lessons discovered while planning, implementing, debugging, testing, and reviewing work.
- When a learning becomes stable repository truth, promote it into `CLAUDE.md` (or the relevant docs/tests) and mark the learning as promoted.

## Operating loop

For every non-trivial task:

1. **Read before acting**
   - Read `CLAUDE.md`.
   - Read the relevant parts of `Learnings.md`.
   - Inspect the actual code/tests before assuming the docs are still correct.

2. **Plan using prior learnings**
   - Apply any relevant active rules below.
   - If a prior learning conflicts with the current code or explicit user instruction, the current code/user instruction wins; record the conflict.

3. **Implement narrowly**
   - Prefer the smallest change that satisfies the requested behavior.
   - Preserve existing invariants unless the task explicitly changes them.
   - Add or update tests for regressions that are likely to recur.

4. **Verify**
   - Run the relevant focused tests first.
   - Before considering implementation complete, run the repository's authoritative checks from `CLAUDE.md` when practical.
   - Review the diff for accidental scope expansion.

5. **Review and learn**
   - Ask: what did we discover that would save time or prevent a mistake next time?
   - Add only reusable findings to this file.
   - Do **not** log routine task history, temporary debugging notes, or facts already documented elsewhere.

6. **Promote stable knowledge**
   - If a learning is repeatedly confirmed or represents a durable architectural rule, move the canonical statement into `CLAUDE.md`, code comments, tests, or focused documentation.
   - Keep a short pointer here and mark it `Promoted`.

## Rules for adding learnings

A learning belongs here when at least one of these is true:

- it explains a bug pattern that could recur;
- it reveals a non-obvious architectural dependency or invariant;
- it records a user/product decision that future implementations might accidentally undo;
- it improves the development/review workflow in a reusable way;
- it corrects an earlier assumption held by ChatGPT or Claude Code.

Do not add:

- a chronological diary of commits;
- one-off command output;
- temporary hypotheses that were disproved;
- duplicated material already clear in `CLAUDE.md`;
- vague advice such as "test carefully" without a concrete trigger or rule.

## Active learnings

Keep this section short. These are the highest-value rules that should influence current work immediately.

<!-- Example format:
### L-001 — Short descriptive title
- **Status:** Active
- **Scope:** curriculum / games / audio / testing / workflow / etc.
- **Trigger:** When this lesson matters.
- **Learning:** The reusable insight.
- **Action:** What future agents should do differently.
- **Evidence:** PR, issue, test, file, or incident that established it.
- **Added:** YYYY-MM-DD
-->

_No active learnings have been recorded yet. Add them only when discovered through real work._

## Improvement queue

Potential changes to the development process go here until validated. Items in this section are hypotheses, not rules.

<!-- Example:
### Q-001 — Automatically require Learnings review in PRs
- **Hypothesis:** A PR checklist asking whether a reusable learning was discovered will improve retention without creating excessive documentation.
- **Validation:** Try for 5–10 PRs and evaluate whether entries are useful rather than noisy.
-->

- Add a lightweight PR review step: **"Did this task produce a reusable learning?"**
- Periodically prune or promote entries so this file stays concise.

## Promoted / retired learnings

Move old entries here when they have become canonical elsewhere or are no longer applicable.

<!-- Example:
### L-000 — Example
- **Status:** Promoted
- **Canonical location:** `CLAUDE.md` → Data model
- **Reason:** Confirmed across multiple changes and now part of repository architecture.
-->
