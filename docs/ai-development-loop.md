# AI Development Loop (v1)

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
  → Diff review
  → Fix (if needed)
  → Commit / Push / PR
  → GitHub Actions (deterministic PR verification)
  → AI review when configured/available
  → Human/ChatGPT merge gate
  → Learnings / durable system improvement when warranted
```

The shared completion bar is [`definition-of-done.md`](./definition-of-done.md). The project-independent principles are in [`global-ai-development-charter.md`](./global-ai-development-charter.md).

## Agent adapters

The workflow is shared; only the agent-specific entry point should differ.

- **Claude Code:** `CLAUDE.md` plus [`.claude/skills/kana-task/SKILL.md`](../.claude/skills/kana-task/SKILL.md) implement the loop as `/kana-task`.
- **Codex:** root [`AGENTS.md`](../AGENTS.md) tells Codex to follow the same loop directly.

Do not maintain two independent copies of the shared workflow. Add a separate agent-specific Skill/rule only when repeated evidence shows that the agent or harness genuinely needs different mechanics.

Coding agents stop at an open PR. Merge remains a separate human/ChatGPT gate.

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

This v1 loop deliberately does not add more agent hooks. The workflow + `npm run verify` + CI combination should stabilize first; hooks are an enforcement layer to add only after actual failure modes justify them.

Candidate future hooks:

- Block direct commits to `main`.
- Detect likely secrets in staged changes before commit.
- Block destructive git commands (e.g. `push --force` to `main`, `reset --hard` without confirmation) outside explicit user request.
- Pause before paid/external audio generation.
- Guard commercial/licensed asset usage (see the `audit:commercial` idea below).

Before adding an agent-specific hook, check that agent's current official hook/configuration specification rather than assuming another agent's mechanism applies.

## Future: commercial audit script

Not built in this v1 pass. Recorded here as a future task:

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
