# AI Development Loop (v1)

How a normal KanaGame task should flow when working with Claude Code, so a user only needs to supply a Goal and Acceptance Criteria instead of a long implementation prompt each time.

```
User
  → Goal + Acceptance Criteria
  → /kana-task
      → Explore
      → Plan
      → Implement
      → Focused tests
      → npm run verify
      → Diff review
      → Fix (if needed)
      → Commit / Push / PR
  → GitHub Actions (lint + test + build on PR / deploy on merge to main)
  → Claude Code Review (automated PR review, .github/workflows/claude-code-review.yml)
  → Human/ChatGPT merge gate
  → Learnings (Learnings.md / CLAUDE.md, when the task produced a reusable lesson)
```

The Skill definition lives at [`.claude/skills/kana-task/SKILL.md`](../.claude/skills/kana-task/SKILL.md). The completion bar it targets is [`definition-of-done.md`](./definition-of-done.md).

`/kana-task` never merges to `main` itself. It stops at "PR opened" and leaves the merge decision to a human or a separate review/merge gate.

## Promotion rules

Recurring signal should move up the stack rather than being re-solved by hand each time:

| Recurring signal | Promote to |
| --- | --- |
| Repeated bug | A regression test |
| Repeated AI judgment error | `CLAUDE.md` rule (or a focused doc it points to) |
| Repeated workflow | A Skill (like `/kana-task`) |
| Deterministic safety check | A hook or CI step |
| Project-level reusable lesson | `Learnings.md` (promote to `CLAUDE.md` once it's stable, see `.claude/rules/learnings.md`) |

## Hooks: not yet, but tracked

This v1 loop deliberately does not add Claude Code hooks. The Skill + `npm run verify` + CI combination is meant to stabilize the loop first; hooks are an enforcement layer to add later once the loop's actual failure modes are known, and should be scoped to whichever of the candidates below are clearly warranted at that time — not added speculatively.

Candidate future hooks:

- Block direct commits to `main`.
- Detect likely secrets in staged changes before commit.
- Block destructive git commands (e.g. `push --force` to `main`, `reset --hard` without confirmation) outside explicit user request.
- Pause before paid/external audio generation (TTS costs money and produces git-visible files — see `CLAUDE.md` product-behavior guardrails).
- Guard commercial/licensed asset usage (see the `audit:commercial` idea below).

Before adding any of these, check Claude Code's current hook spec (hook events, matcher syntax, permission model) rather than assuming this document's description of it — hooks are a fast-moving surface and this doc is not the source of truth for their API.

## Future: commercial audit script

Not built in this v1 pass. Recorded here as a future task:

```
npm run audit:commercial
```

Candidate checks:

- Leftover KanjiVG data (replacement is tracked separately as a Gate 0 task — do not touch stroke data as a side effect of this loop work).
- CC BY-SA-derived stroke data still present.
- Required third-party license files/attributions present.
- Prohibited or unexpected dependency/asset licenses.
- Secrets accidentally checked in.
- Asset provenance gaps (audio/image assets without a recorded source).
