# AI Development Loop (v1.1)

How a normal KanaGame task should flow with a coding agent such as Claude Code or Codex, so the user only needs to supply a Goal and Acceptance Criteria instead of a long implementation prompt each time.

```text
User
  → Goal + Acceptance Criteria
  → Coding-agent adapter
      → Claude Code: CLAUDE.md + /kana-task
      → Codex: AGENTS.md
  → Explore
  → Plan
  → Implement
  → Focused tests
  → npm run verify
  → Diff self-review
  → Commit / Push
  → Draft PR
      → PR Verify runs on Draft and later pushes
      → ChatGPT/human diff review
      → Bundle fixes while still Draft
  → Ready for Review
      → AI review once, when configured and available
  → ChatGPT merge gate
  → Merge
  → Learnings / durable system improvement when warranted
```

The shared completion bar is [`definition-of-done.md`](./definition-of-done.md). The project-independent principles are in [`global-ai-development-charter.md`](./global-ai-development-charter.md).

## Why Draft is the default

AI review is expensive relative to deterministic CI. Normal iteration therefore happens in Draft:

- `PR Verify` may run repeatedly because it is deterministic and cheap relative to model review.
- Pushes to a Draft PR do **not** automatically trigger Claude Code Review.
- ChatGPT/human review should consolidate findings so follow-up fixes can be bundled.
- Marking the PR **Ready for Review** requests the AI review pass for the merge candidate.

If a Ready PR needs material fixes after AI review, prefer converting it back to Draft before pushing fixes. After the fixes pass verification and ChatGPT review again, mark it Ready only when another AI review is actually warranted.

## Agent adapters

The workflow is shared; only the agent-specific entry point should differ.

- **Claude Code:** `CLAUDE.md` plus [`.claude/skills/kana-task/SKILL.md`](../.claude/skills/kana-task/SKILL.md) implement the coding loop as `/kana-task` and stop at a Draft PR.
- **Codex:** root [`AGENTS.md`](../AGENTS.md) tells Codex to follow the same loop directly and stop at a Draft PR.

Do not maintain two independent copies of the shared workflow. Add a separate agent-specific Skill/rule only when repeated evidence shows that the agent or harness genuinely needs different mechanics.

## AI review policy

`.github/workflows/claude-code-review.yml` is intentionally triggered by `ready_for_review`, not every `synchronize` push. This keeps model review concentrated on a merge candidate instead of spending usage during iteration.

Binary-only changes may skip model review when the workflow determines there is no reviewable text diff.

AI review findings are real findings: if the review runs and opens actionable threads, resolve them before merge. A failed AI-review workflow must not be treated as harmless until its cause is understood.

## Merge gate

Before merge, the human/ChatGPT gate must verify the **current** PR state, not rely on an earlier snapshot:

- actual PR HEAD is unchanged from the reviewed candidate;
- PR Verify for that exact HEAD succeeded;
- unresolved review threads = 0;
- `mergeable=true` and `draft=false`;
- current `main` is known and the PR is not stale/conflicted in a way that changes the review judgment;
- the full relevant diff has been reviewed;
- any successful AI-review findings have been addressed.

When merging through automation/API, use the expected PR HEAD SHA when supported so the merge fails if the branch moved after the gate check.

### AI-review-unavailable fallback

AI review is a useful independent review layer, but it must not become a single point of failure. It may be replaced by the fallback gate when the review cannot run because of an external/model-infrastructure condition such as quota/usage exhaustion, provider/service failure, authentication failure, or action infrastructure failure.

Fallback requires all of the following:

- the failure has been identified as AI-review availability/infrastructure, not a code or deterministic-CI failure;
- PR Verify for the exact HEAD is green;
- ChatGPT has reviewed the full diff for the exact HEAD;
- unresolved review threads = 0;
- `mergeable=true` and `draft=false`;
- current `main` and stale/conflict status have been checked;
- the PR HEAD is fixed with `expected_head_sha` (or equivalent) at merge time.

Do **not** use this fallback to bypass a failing test/build/lint/diff check, an unresolved review finding, an unknown workflow failure, or a known code defect.

## Promotion rules

Recurring signal should move up the stack rather than being re-solved by hand each time:

| Recurring signal | Promote to |
| --- | --- |
| Repeated bug | A regression test |
| Repeated cross-agent judgment error | A shared project rule or focused reference doc |
| Repeated agent-specific judgment error | That agent's thin adapter/instructions |
| Repeated workflow | The shared workflow first; an agent-specific Skill only if needed |
| Deterministic safety check | A script, hook, or CI step |
| Project-level reusable lesson | `Learnings.md`, then a stable shared rule when evidence justifies promotion |

## Hooks: not yet, but tracked

This v1.1 loop deliberately does not add more agent hooks. The workflow + `npm run verify` + CI combination should stabilize first; hooks are an enforcement layer to add only after actual failure modes justify them.

Candidate future hooks:

- Block direct commits to `main`.
- Detect likely secrets in staged changes before commit.
- Block destructive git commands (e.g. `push --force` to `main`, `reset --hard` without confirmation) outside explicit user request.
- Pause before paid/external audio generation.
- Guard commercial/licensed asset usage (see the `audit:commercial` idea below).

Before adding an agent-specific hook, check that agent's current official hook/configuration specification rather than assuming another agent's mechanism applies.

## Future: commercial audit script

Not built in this v1.1 pass. Recorded here as a future task:

```text
npm run audit:commercial
```

Candidate checks:

- Leftover KanjiVG data.
- CC BY-SA-derived stroke data still present.
- Required third-party license files/attributions present.
- Prohibited or unexpected dependency/asset licenses.
- Secrets accidentally checked in.
- Asset provenance gaps (audio/image assets without a recorded source).
