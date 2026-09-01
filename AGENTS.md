# AGENTS.md

Guidance for Codex and other coding agents that honor `AGENTS.md` in this repository. Keep this file short: it is an entry point, not a repository encyclopedia.

## Shared sources of truth

For non-trivial work, use these shared documents rather than inventing an agent-specific process:

- `docs/global-ai-development-charter.md` — project-independent principles.
- `docs/ai-development-loop.md` — shared role-based development/review workflow.
- `docs/definition-of-done.md` — Builder completion criteria.
- `CLAUDE.md` — currently also carries the concise KanaGame project contract: architecture boundaries, curriculum rules, commands, and product-behavior guardrails. Apply those repository rules to Codex too; Claude-specific invocation details such as `/kana-task` and `.claude/` mechanics do not need to be copied literally.
- `docs/claude-reference.md` — deeper repository reference despite the historical filename; read only the sections relevant to the current task.

Use the source-of-truth order in `docs/ai-development-loop.md`. Current code/tests are evidence of implemented behavior, but they do not automatically override an accepted current Goal, Acceptance Criteria, or approved product/decision specification.

## Role assignment

Codex is not permanently assigned to implementation or review. The task determines the role.

- **When assigned as Builder:** follow the Standard task loop below and stop after opening the task PR. Normal completed work uses a non-Draft reviewable PR; use Draft only for an explicitly incomplete/WIP handoff.
- **When assigned as independent reviewer:** use a fresh review context, read the current Goal/Acceptance Criteria and full relevant diff, look for correctness/regression/scope/test gaps, and report findings before style preferences. Do not modify the branch unless explicitly asked to implement accepted findings.

Prefer a reviewer that did not produce the implementation when practical. Independence of context and role matters more than a fixed vendor assignment.

## Standard task loop (Builder)

Given a Goal and Acceptance Criteria:

1. Preflight: refresh `origin`, then confirm repository, `git status`, branch, current `origin/main`, and any existing task PR/issue.
2. If this task came from another agent/environment, do not trust the inherited checkout implicitly. Verify the branch/HEAD/diff before continuing.
3. Work on a fresh dedicated branch from current `origin/main`, unless resuming the exact existing task branch/PR.
4. Preserve unrelated work; never silently discard or overwrite it.
5. Explore only the relevant code/tests/docs. Search narrowly and stop when evidence is sufficient.
6. Plan only to the depth the task needs. An obvious bounded fix may proceed directly; uncertain, multi-concern, or hard-to-review work should be planned/decomposed first.
7. Implement the smallest change that satisfies the Acceptance Criteria.
8. Run focused tests during iteration.
9. On the final candidate, run `npm run verify`.
10. Read the full diff and remove unintended changes.
11. Commit only task-relevant files, push the branch, and open a **normal non-Draft PR** against `main`. Use Draft only if the handoff is genuinely incomplete/WIP and explicitly needs later Builder work before review.
12. Do not merge. Do not add a model-review opt-in unless the user/ChatGPT review gate explicitly assigns that reviewer; review depth, independent review, human approval when required, and merge remain separate gates.

Stop and escalate before destructive operations, paid external calls, secrets/API-key setup, irreversible migrations, new unresolved licensing/legal judgments, or product-behavior ambiguity with meaningful consequences.

## Commands

```bash
npm run dev
npm test
npm run lint
npm run build
npm run verify
```

`npm run build` includes TypeScript checking. `npm run verify` runs the repository-wide test/lint/build/diff checks used for a merge candidate.

## Agent-specific adapters

- **Codex:** this `AGENTS.md` is the persistent adapter. Follow the shared loop directly; do not require the Claude `/kana-task` command.
- **Claude Code:** `CLAUDE.md` plus `.claude/skills/kana-task/SKILL.md` provide the Claude-specific Builder adapter.

Keep shared behavior in the shared docs. Add agent-specific instructions only when repeated evidence shows the difference is genuinely caused by that agent or harness.
