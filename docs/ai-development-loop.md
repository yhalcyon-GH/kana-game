# AI Development Loop (v1.3)

How a normal KanaGame task should flow with a coding agent such as Claude Code or Codex, so the user can usually supply a Goal and Acceptance Criteria instead of a long implementation prompt.

The workflow is **role-based, not vendor-based**. Claude Code and Codex can both act as the Builder. Review should come from a fresh, independent context appropriate to the risk of the change rather than assuming one product must always implement and another must always review.

```text
User / ChatGPT orchestrator
  → Goal + Acceptance Criteria
  → classify scope and review depth
  → Builder
      → Claude Code: CLAUDE.md + /kana-task
      → Codex: AGENTS.md
  → preflight / handoff check
  → Explore
  → Plan when useful
  → Implement
  → Focused tests
  → npm run verify
  → Diff self-review
  → Commit / Push
  → one reviewable PR (normally non-Draft)
      → PR Verify runs on open and later pushes
      → ChatGPT/human diff review
      → fixes stay on the same PR
      → optional independent model review only when selected
  → Human gate if the change is consequential
  → ChatGPT merge gate
  → Merge
  → Learnings / durable system improvement when warranted
```

The shared completion bar is [`definition-of-done.md`](./definition-of-done.md). The project-independent principles are in [`global-ai-development-charter.md`](./global-ai-development-charter.md).

## Task roles

Roles are assigned per task. Do not permanently equate a role with a product.

- **Owner / orchestrator:** the user and ChatGPT define intent, Acceptance Criteria, priority, review depth, and consequential decisions.
- **Builder:** Claude Code, Codex, or another capable coding agent explores, implements, tests, self-reviews, and opens the task PR.
- **Deterministic verifier:** tests, lint, build, diff checks, and CI provide pass/fail evidence that does not require model judgment.
- **Independent reviewer:** a fresh context reviews the finished diff against the task. Prefer a different agent/model from the Builder when practical, but independence of context and role matters more than a fixed vendor assignment.
- **Human gate:** required for consequential decisions; routine low-risk changes may be delegated through the normal merge gate.

This keeps development running when one agent is unavailable or quota-limited. For example, Claude Code can be the normal Builder, while Codex takes the Builder role when Claude usage is exhausted; the review role is then assigned independently according to the review level below.

## Keep tasks bounded

Prefer small, reviewable tasks with explicit Goal, Acceptance Criteria, non-goals, and verification. An issue-style task description is the default shared handoff artifact.

Do not force a formal planning ceremony for an obvious one-line or presentation-only fix. Use a separate plan/research step when the approach is uncertain, the change spans multiple concerns, the architecture is unfamiliar, or the resulting PR would be difficult to review as one bounded unit. Split large work when a clean decomposition exists.

## Agent-switch handoff

Never assume another agent's local checkout, branch, worktree, or conversation state is current.

When switching Claude Code ↔ Codex, resuming work from another environment, or starting from an old checkout:

1. fetch/refresh `origin`;
2. confirm repository, `git status`, current branch, current `origin/main`, and the current task PR/issue if one exists;
3. for a new task, create a fresh dedicated branch from current `origin/main`;
4. for an existing task, verify the branch/PR HEAD and diff before continuing rather than silently layering work on an unrelated or stale branch;
5. preserve unrelated uncommitted work.

For normal implementation tasks, GitHub Issue + branch + PR are the shared memory. Add durable product/research/architecture documents only when they carry decisions that should outlive the task; do not create a large documentation bureaucracy for a small fix.

## One reviewable PR is the default

A Builder should open the PR only after implementation, focused verification, `npm run verify`, and full diff self-review. At that point the normal handoff is a **non-Draft reviewable PR**.

Keep subsequent work on that same PR:

- `PR Verify` may run repeatedly because it is deterministic and comparatively cheap.
- Follow-up code pushes do **not** trigger Claude model review; the review workflow intentionally has no `synchronize` trigger.
- ChatGPT/human review should consolidate findings so fixes can be bundled on the same branch/PR.
- If an independent Claude review is actually selected, the review gate adds the exact opt-in line to the existing PR body; no Ready transition or replacement PR is needed.

Use Draft only for a genuinely incomplete/WIP handoff where the Builder is not yet presenting a completed candidate. Draft is a state for real incompleteness, not routine ceremony.

This replaces the older mandatory Draft → Ready flow, which repeatedly created duplicate PRs and duplicate CI because the connected Ready transition was unreliable. The merge gate remains unchanged: reviewable does not mean mergeable-by-default.

## Review depth

Review depth should track risk instead of calling every available model on every PR.

### Standard review — default for bounded low-risk work

Examples: small presentation/UI polish, documentation, narrow cleanup with strong tests, or similarly local and reversible changes.

Required:

- Builder self-review of the full diff;
- focused verification plus `npm run verify` where applicable;
- PR Verify green for the exact HEAD;
- ChatGPT/human diff review;
- normal merge gate.

A second paid/model review is optional here. Skipping it is intentional resource management, not a weakened deterministic gate.

### Enhanced review — for changes with meaningful correctness risk

Use Enhanced review for cross-cutting logic, unfamiliar architecture, larger refactors, state/data changes, security/performance-sensitive code, weak testability, repeated corrections, or any diff where an independent second opinion is materially valuable.

In addition to Standard review, require a **fresh-context independent review**. Prefer a different capable agent/model from the Builder when available. Claude Code, Codex code review, a fresh reviewer session/subagent, or another suitable reviewer can fill this role.

If the required independent AI reviewer is unavailable, do not silently downgrade an Enhanced change to Standard. Route it to human review before merge.

### Consequential change — explicit human approval

Human approval is required before merge for changes with meaningful product or irreversible consequences, including security/authorization boundaries, destructive or lossy data operations, monetization/payment behavior, unresolved licensing/legal decisions, irreversible migrations, major architecture commitments, or meaningful changes to learning/product correctness that the user has not already approved.

A consequential change may also require Enhanced technical review. Human approval is about judgment and authorization, not a replacement for tests or technical review.

## Agent adapters

The shared workflow should not be duplicated into separate vendor-specific manuals.

- **Claude Code:** `CLAUDE.md` plus [`.claude/skills/kana-task/SKILL.md`](../.claude/skills/kana-task/SKILL.md) implement the Builder loop and stop after opening the task PR. Normal completed work uses a non-Draft PR; Draft is reserved for explicitly incomplete/WIP handoff.
- **Codex:** root [`AGENTS.md`](../AGENTS.md) supplies persistent repository guidance. Codex may act as Builder or independent reviewer depending on the task.

Add agent-specific rules only when repeated evidence shows that a difference is genuinely caused by that agent or harness.

## AI review policy

Model review is a targeted quality layer, not a mandatory call on every PR.

The repository's Claude GitHub review workflow is **opt-in**. It only enters the Claude model-review step for a reviewable PR whose body contains a **dedicated line exactly equal to** the configured Claude-review marker. Prose or negated mentions do not count as opt-in, and LF/CRLF line endings are treated equivalently.

The ChatGPT/human review gate adds the exact opt-in line only when Claude is the chosen independent reviewer and the review is worth the usage. Standard low-risk PRs normally omit it. The Builder does not add it by default.

For the normal single-PR flow, ChatGPT may add the marker to an existing non-Draft PR after reviewing the candidate. The workflow's `edited` handling requests review only on the transition from **no exact marker line → exact marker line**. Unrelated body/title edits, edits after the marker already existed, negated prose, and code pushes must not trigger another model pass.

Binary-only changes may still skip model review when there is no reviewable text diff. If Claude is quota-limited, choose another independent reviewer for Enhanced work rather than making Claude availability a development blocker.

AI-review findings are real findings: if a review runs and opens actionable threads, resolve them before merge. A failed requested AI review must not be treated as harmless until its cause is understood.

## Merge gate

Before merge, the human/ChatGPT gate must verify the **current** PR state, not rely on an earlier snapshot:

- actual PR HEAD is unchanged from the reviewed candidate;
- PR Verify for that exact HEAD succeeded;
- unresolved review threads = 0;
- `mergeable=true` and `draft=false`;
- current `main` is known and the PR is not stale/conflicted in a way that changes the review judgment;
- the full relevant diff has been reviewed;
- any required Enhanced review has completed or been replaced by the required human review;
- any successful AI-review findings have been addressed;
- any consequential-change human approval has been obtained.

When merging through automation/API, use the expected PR HEAD SHA when supported so the merge fails if the branch moved after the gate check.

## Requested-review failure

If a **requested** AI review fails because of quota, provider/service, authentication, or action infrastructure:

- Standard work can still proceed if its normal Standard gates are satisfied, because the extra model review was not required.
- Enhanced work requires another fresh independent reviewer or human review before merge.
- Never use reviewer unavailability to bypass a failing test/build/lint/diff check, a known code defect, an unresolved review finding, or an unknown failure that may be code-related.

## Source-of-truth order

Distinguish "what the product should do" from "what the current code happens to do."

When sources conflict, use this order unless the task explicitly establishes another hierarchy:

1. explicit current user decision;
2. accepted current Goal / Acceptance Criteria and any approved product/decision specification;
3. current tests and code as evidence of implemented behavior;
4. recent repository history/PR evidence;
5. older narrative or historical documentation.

Code/tests are strong evidence of current behavior, but they do not automatically override an approved specification describing intended behavior.

## Repository knowledge, not chat history

Keep persistent instructions small and navigational. `CLAUDE.md` and `AGENTS.md` should point agents to focused repository sources instead of becoming encyclopedias. Retrieve deeper context only when the current task needs it.

For ordinary bounded tasks, use the Issue and PR as the audit trail. Create durable documents such as product specs, research, decisions, or architecture notes when the decision itself needs to be preserved and reused across future work.

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

## Hooks: add only when evidence justifies them

Do not add hooks merely because the harness supports them. Use hooks for actions that must happen deterministically and repeatedly, after a real failure mode demonstrates the value.

Candidate future hooks:

- Block direct commits to `main`.
- Detect likely secrets in staged changes before commit.
- Block destructive git commands outside explicit user request.
- Pause before paid/external audio generation.
- Guard commercial/licensed asset usage.

Before adding an agent-specific hook, check that agent's current official hook/configuration specification rather than assuming another agent's mechanism applies.

## Future: commercial audit script

Not built in this v1.3 pass. Candidate future command:

```text
npm run audit:commercial
```

Possible checks include leftover incompatible assets/data, required third-party notices, prohibited licenses, secrets, and asset-provenance gaps.
