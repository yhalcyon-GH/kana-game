# AGENTS.md

Guidance for Codex and other coding agents that honor `AGENTS.md` in this repository. Keep this file short: it is an entry point, not a repository encyclopedia.

## Shared sources of truth

For non-trivial work, use these shared documents rather than inventing an agent-specific process:

- `docs/global-ai-development-charter.md` — project-independent principles.
- `docs/ai-development-loop.md` — standard Goal + Acceptance Criteria → PR workflow.
- `docs/definition-of-done.md` — completion criteria.
- `CLAUDE.md` — currently also carries the concise KanaGame project contract: architecture boundaries, curriculum rules, commands, and product-behavior guardrails. Apply those repository rules to Codex too; Claude-specific invocation details such as `/kana-task` and `.claude/` mechanics do not need to be copied literally.
- `docs/claude-reference.md` — deeper repository reference despite the historical filename; read only the sections relevant to the current task.

Current code/tests and explicit user instructions outrank stale narrative documentation. If a material doc contradiction is found, fix it in scope.

## Standard task loop

Given a Goal and Acceptance Criteria:

1. Preflight: confirm repository, `git status`, branch, and current `origin/main`.
2. Work on a fresh dedicated branch from current `origin/main`, unless resuming the exact existing task branch/PR.
3. Preserve unrelated uncommitted work; never silently discard or overwrite it.
4. Explore only the relevant code/tests/docs. Search narrowly and stop when evidence is sufficient.
5. Plan scope, non-goals, tests, and risks.
6. Implement the smallest change that satisfies the Acceptance Criteria.
7. Run focused tests during iteration.
8. On the final candidate, run `npm run verify`.
9. Read the full diff and remove unintended changes.
10. Commit only task-relevant files, push the branch, and open a **Draft PR** against `main`.
11. Do not mark the PR Ready and do not merge it; leave review, Ready-for-Review transition, AI review, and merge to the separate human/ChatGPT gate.

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
- **Claude Code:** `CLAUDE.md` plus `.claude/skills/kana-task/SKILL.md` provide the Claude-specific adapter.

Keep shared behavior in the shared docs. Add agent-specific instructions only when the difference is genuinely caused by that agent or harness.
