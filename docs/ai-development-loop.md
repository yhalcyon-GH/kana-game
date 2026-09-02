# AI Development Loop (v1.6)

How a normal KanaGame task should flow with ChatGPT plus a coding agent such as Claude Code or Codex, so the user can usually supply a Goal and Acceptance Criteria instead of a long implementation prompt.

The workflow is **role-based with cost-aware defaults**. Roles remain swappable, but the normal assignment is:

- **ChatGPT:** orchestrator, Issue/spec writer, independent PR reviewer, live merge gate, and merge executor.
- **Claude Code:** primary Builder for normal implementation work.
- **Codex:** fallback Builder when Claude is unavailable/quota-limited, or independent reviewer when another model materially helps.
- **GitHub Actions/scripts/tests:** deterministic verifier.
- **Human:** product authority and explicit gate for consequential decisions.

Do not run multiple agents by habit. Add another model only when it improves the decision enough to justify the usage.

```text
Human
  → Goal / Acceptance Criteria / important decisions
ChatGPT
  → investigate narrowly / reuse settled evidence / create bounded Issue
Builder (normally Claude Code; Codex fallback)
  → preflight current origin/main + task state
  → Explore
  → Plan when useful
  → Implement
  → Focused tests
  → required browser/sample checks
  → npm run verify
  → full diff self-review
  → Commit / Push
  → one normal reviewable PR
ChatGPT
  → verify live PR/main/HEAD/diff/CI, not just the Builder report
  → Standard or Enhanced independent review
  → bundle corrections on the same PR when needed
GitHub Actions
  → deterministic exact-HEAD PR Verify
Human
  → explicit approval if consequential
ChatGPT
  → live Merge Gate + expected-head merge
  → promote real failures into tests/rules/workflow improvements when warranted
```

The shared completion bar is [`definition-of-done.md`](./definition-of-done.md). Project-independent principles are in [`global-ai-development-charter.md`](./global-ai-development-charter.md).

## Task roles

Roles are assigned per task; the defaults above are operational preferences, not permanent capability restrictions.

- **Owner / orchestrator:** the user and ChatGPT define intent, Acceptance Criteria, priority, review depth, and consequential decisions.
- **Builder:** normally Claude Code; Codex or another capable coding agent may substitute. The Builder explores, implements, tests, self-reviews, and opens the task PR.
- **Deterministic verifier:** tests, generated-data checks, lint, build, diff checks, and CI provide pass/fail evidence without model judgment.
- **Independent reviewer:** a fresh context reviews the finished diff against the task. Prefer a different model/context from the Builder when Enhanced review needs another view, but do not require a second model for every PR.
- **Human gate:** required for consequential decisions; routine low-risk changes may proceed through the established ChatGPT merge gate.

## Keep tasks bounded

Prefer small, reviewable tasks with explicit Goal, Acceptance Criteria, non-goals, and verification. An Issue-style task description is the default shared handoff artifact.

Do not force a planning ceremony for an obvious one-line or presentation-only fix. Use a separate plan/research/evidence spike when the approach is uncertain, the change spans multiple concerns, the architecture is unfamiliar, a source/licensing/data assumption must be established, or the resulting PR would otherwise be hard to review.

## Efficient autonomous execution

Start with `git status`, branch/HEAD, `origin/main`, the current PR diff and
changed filenames, plus the canonical Goal/Acceptance Criteria. Use targeted
`rg`, exact paths, and narrow ranges before whole-file or repository-wide
reads. Reuse verified unchanged facts, batch independent reads/commands when
practical, and run focused tests before broad verification. On failure, inspect
the failing log/path first instead of restarting exploration. Prefer a small
deterministic invariant over repeated prose; keep working notes and final
reports to decisions, evidence, risks, and next action.

Use this decision ladder to minimize human checks without weakening safety:

1. If the canonical spec, repository contract, tests, or convention determines
   the answer, proceed.
2. For routine bounded ambiguity, choose the lowest-risk option and verify it.
3. For a bounded approved-spec violation, fix it and add regression coverage.
4. Ask only for genuinely consequential, under-specified choices: material
   product/learning outcomes; destructive/lossy changes; security, auth,
   payment, licensing/legal concerns; irreversible migrations; major
   architecture/scope; or materially different outcomes with no source of
   truth. Do not ask merely about safe implementation details, test updates,
   routine branch refresh/rebase, stale factual text, or bounded approved fixes.

For manual-review reduction, use evidence in this order: deterministic
unit/invariant tests; focused integration tests; static/type/lint/build checks;
exact-HEAD CI; then targeted browser/visual/manual checks only where automation
cannot reliably prove the property. If manual verification remains, identify
the smallest exact gap rather than requesting a full-feature retest.

Use a compact handoff state capsule: current main SHA; PR/branch/HEAD;
canonical behavior; already-merged/do-not-reimplement baseline; relevant
files/contracts; unresolved blockers only; and required verification plus stop
conditions. Reference historical discussion rather than replaying it, except
where a superseding decision must be explicit.

When a spike has already settled architecture, constraints, pinned sources, or a tradeoff decision, **reuse that evidence** in the implementation task. Do not repeat the same broad corpus/research/architecture investigation unless new evidence creates a concrete reason to reopen it. This keeps model calls and context focused on the remaining unknowns.

## Action over report

When the next safe routine action is determined and the executor currently has
the tool/permission capability to perform it, perform it before ending the
turn with a status report. A statement such as "next I will inspect the
failing log" or "next I will fix and re-run CI" is not completion when that
action is executable now with already-available tools; it is a deferral.
Reports should follow concrete execution and evidence, not substitute for it.
This applies to routine, already-decided next steps and does not override the
human-gate/consequential-decision rules above — still pause there instead of
forcing an action through.

## Stagnation detection and route switching

Progress means new evidence: a new observation, a repo mutation, a test/CI
result, or a resolved decision. Do not keep repeating the same poll, read, or
retry when it produces no new evidence. After repeated no-change observations
on the same method, switch route instead of repeating it again: try a
different tool, inspect a different evidence source, or hand off to a
different Builder. Detect stagnation from evidence — identical output,
identical failure, no new information — not from a fixed time/minute
threshold. Claude Code remains the normal Builder; Codex is the fallback when
Claude Code is blocked, stalled, or tool-limited and switching is genuinely
likely to be faster, consistent with the cost-aware role policy above — do not
switch merely out of habit.

## Builder capability preflight

Before depending on a Builder to perform the final required verification (for
example `npm run verify`), confirm that the Builder's allowed tools/harness can
actually execute that exact command. If they cannot, fix the harness (for
example, extend an allowed-tools/permissions list) or route that verification
elsewhere before handoff. Do not discover the gap only when the Builder
reports, at the end of its run, that it was unable to run the check.

## Agent-switch handoff

Never assume another agent's local checkout, branch, worktree, or conversation state is current.

## Autonomous/offline handoff completeness

Use this gate when the user will be unavailable, the task spans several
approved decisions, or local/external assets are involved. Carry a compact
canonical snapshot, not merely a link to a long Issue thread:

- executor and filesystem/tool reach for every required local resource;
- fresh `origin/main`, task branch/PR, and already-merged dependencies;
- approved current product/learning decisions, including superseding comments;
- explicit do-not-reimplement baseline behavior;
- exact asset paths and current runtime contracts, plus pending assets and
  approved fallbacks;
- required verification, known gaps, and exact stop/escalation conditions.

Do not apply this checklist to trivial interactive work. Resolve materially
conflicting Issue comments into one quoted or written canonical final snapshot
before implementation. Historical examples remain evidence only and must not
override a verified current contract.

Before assigning local-path work, verify that the selected executor can reach
the path. If a cloud chat cannot reach a user-local path but a local Builder
can, route the work there explicitly; never imply arbitrary local Windows paths
are connector-readable.

When a migration changes a shared contract, refresh downstream handoffs from
live repository evidence and prefer a deterministic invariant that rejects
reintroduction of the retired contract. After another chat reports a merge,
verify live `main`/PR state before carrying the new baseline forward.

For closely related variants, describe the shared shell/engine once and add an
explicit delta matrix for intentional differences. Add regression coverage at
the shared boundary so variants cannot silently fork.

When switching Claude Code ↔ Codex, resuming work from another environment, or starting from an old checkout:

1. fetch/refresh `origin`;
2. confirm repository, full `git status`, current branch, current `origin/main`, and the current task PR/Issue if one exists;
3. for a new task, create a fresh dedicated branch from current `origin/main`;
4. for an existing task, verify the actual branch/PR HEAD and diff before continuing;
5. preserve unrelated uncommitted work.

Issue + branch + PR are the normal shared task memory. Add durable specs/research/architecture docs only when the decision itself must outlive the task.

## One reviewable PR is the default

A Builder should open the PR only after implementation, required focused verification, a clean final `npm run verify`, and full diff self-review. At that point the normal handoff is a **non-Draft reviewable PR**.

Keep subsequent work on that same PR:

- `PR Verify` may run repeatedly because it is deterministic and comparatively cheap.
- Follow-up code pushes do not automatically trigger paid/model review.
- ChatGPT/human review should consolidate findings so corrections can be bundled on the same branch/PR.
- If an independent Claude review is selected, the review gate adds the exact opt-in line to the existing PR body; no Ready transition or replacement PR is needed.

Use Draft only for a genuinely incomplete/WIP handoff. Draft is a state for real incompleteness, not routine ceremony.

This replaces the older Draft → Ready flow that created duplicate PRs and duplicate CI when the Ready transition failed.

## Evidence strategy: prove the property at the right level

Prefer the cheapest evidence that actually proves the important property.

- **Logic/state behavior:** focused unit/integration tests plus broader verification.
- **Large corpus/data migrations:** inventory-wide deterministic invariants for completeness/mapping, plus bounded representative sampling for source-sensitive or visual cases. Do not manually inspect hundreds of entries when a mechanical invariant proves coverage better.
- **Generated data:** fail-fast freshness checks should prove committed output matches source inputs. Keep canonical generated output stable; if a platform-only representation difference such as CRLF/LF causes a false stale result, first measure the mismatch, then normalize only at the comparison boundary and keep tests proving real content tampering remains stale.
- **Browser-sensitive SVG/CSS geometry:** jsdom/DOM structure is not enough when browser coordinate semantics can clip or shift output. Changes involving `clipPath`, mask, transform, viewBox, or similar geometry should be checked in a real browser for complete visibility, clipping/alignment, animation, and replay at representative desktop/mobile widths.
- **Physical device:** use as a targeted gate after a demonstrated device-only failure or when the changed platform behavior genuinely requires it; do not require physical-device testing for every ordinary UI change.

If a requested verification tool is unavailable, the Builder must report the gap explicitly. The reviewer/orchestrator must then either satisfy the gate elsewhere or explicitly document why the changed surface makes that check non-material. A requested verification step is never silently treated as completed.

## Failure and flake discipline

Do not label a failure "pre-existing", "unrelated", or "flaky" from intuition alone.

When a final verification fails:

1. isolate the failing test/check;
2. reproduce or rerun it;
3. compare with clean/current `origin/main` when practical if claiming it predates the task;
4. investigate the actual mismatch rather than weakening the check;
5. rerun the full candidate.

Builder handoff requires a **clean final full verification rerun**. An earlier flake may be recorded, but the final candidate should not be presented as verified while its latest full run is failing. Exact-HEAD PR CI is additional independent evidence, not permission to ignore a deterministic local failure whose cause is still unknown.

## Staged migration rule

For source/data/renderer migrations, prefer a staged sequence instead of replacing and deleting everything at once:

1. establish architecture/source feasibility with bounded evidence if needed;
2. add the new path behind the existing safe path;
3. prove complete current coverage mechanically;
4. run representative browser/deployed/physical-device smoke appropriate to the risk;
5. only then remove the old fallback/data/generator and update user-facing license/provenance claims in a separate bounded cleanup when practical.

Do not keep a retired fallback indefinitely once coverage is proven, because dead fallback code, stale instructions, and stale attribution create future confusion. Conversely, do not remove it merely because the new path exists.

## Review depth

Review depth should track risk instead of calling every available model on every PR.

### Standard review — default for bounded low-risk work

Examples: small UI polish, documentation, narrow cleanup with strong tests, or similarly local and reversible changes.

Required:

- Builder self-review of the full diff;
- focused verification plus a clean final `npm run verify` where applicable;
- PR Verify green for the exact HEAD;
- ChatGPT/human diff review;
- normal merge gate.

A second paid/model review is optional. Skipping it is intentional resource management, not a weakened deterministic gate.

### Enhanced review — for meaningful correctness risk

Use Enhanced review for cross-cutting logic, unfamiliar architecture, larger refactors, state/data changes, security/performance-sensitive code, weak testability, repeated corrections, broad data migrations, or any diff where a fresh second view materially helps.

In addition to Standard review, require a **fresh-context independent review**. ChatGPT may provide that independent review when Claude Code built the change. Use Codex/Claude/fresh human review when another view is materially useful or ChatGPT lacks the needed evidence. Do not automatically call both Claude and Codex.

If the required independent AI reviewer is unavailable, route Enhanced work to human review rather than silently downgrading it.

### Consequential change — explicit human approval

Human approval is required before merge for meaningful product or irreversible consequences, including security/authorization boundaries, destructive/lossy data, monetization/payment behavior, unresolved licensing/legal decisions, irreversible migrations, major architecture commitments, or meaningful learning/product-correctness changes not already approved.

A licensing cleanup based on an already approved source/provenance decision does not need the same decision reopened unless new ambiguity appears; preserve notices/provenance and escalate only genuinely new uncertainty.

## ChatGPT orchestrator / reviewer rules

ChatGPT must treat a Builder summary as a useful report, **not as merge evidence**. Before accepting or merging a PR, use the connected GitHub state when available and verify the current facts directly:

- actual PR HEAD/base and current `main`;
- actual changed files and relevant diff;
- whether the branch started from the expected current main when that matters;
- exact-HEAD PR Verify and relevant workflow/job results;
- unresolved review threads;
- `draft=false` and `mergeable=true`;
- any required browser/visual/source/provenance evidence;
- no unrelated scope drift.

For broad vendored/generated-data changes, review mechanically: compare inventory/mapping/provenance and representative source blobs/samples rather than manually reading every generated entry.

If the Builder reported a missing required verification step, ChatGPT must close that gap before merge or explicitly determine from the actual diff and prior evidence that the gate is non-material. For example, a browser geometry smoke may be waived for a pure renderer-deletion/docs cleanup that does not alter geometry and follows a recent successful deployed device smoke; that waiver should be reasoned, not silent.

When ChatGPT finds bounded corrections, keep them on the same PR when practical. Do not create replacement PRs merely to move between review states.

## Agent adapters

Keep shared behavior in this document rather than duplicating separate manuals.

- **Claude Code:** `CLAUDE.md` plus [`.claude/skills/kana-task/SKILL.md`](../.claude/skills/kana-task/SKILL.md) implement the primary Builder loop and stop after opening the task PR.
- **Codex:** root [`AGENTS.md`](../AGENTS.md) is the thin persistent adapter for fallback Builder or independent reviewer work.

Add agent-specific rules only when repeated evidence shows the difference is genuinely caused by that agent or harness.

## AI review policy

Model review is a targeted quality layer, not a mandatory call on every PR.

The repository's Claude GitHub review workflow is **opt-in**. It enters the Claude model-review step only when the PR body contains a **dedicated line exactly equal to** the configured review marker. Prose or negated mentions do not count, and LF/CRLF line endings are treated equivalently.

This exact-line rule exists because substring matching once caused a negated sentence to consume Claude usage. The regression is deterministic, so the prevention belongs in workflow logic rather than human memory.

The Builder does not add the marker by default. ChatGPT/human adds it only when Claude is intentionally selected as independent reviewer and the usage is worth it. Code pushes must not retrigger paid review automatically.

If a requested model review fails because of quota/provider/auth/action infrastructure:

- Standard work may proceed if all Standard gates are satisfied.
- Enhanced work needs another fresh independent reviewer or human review.
- Reviewer unavailability never bypasses a failing deterministic check, known defect, unresolved thread, or unknown failure that may be code-related.

## Merge gate

Immediately before merge, ChatGPT/human must verify the **live current PR state**, not rely on an earlier snapshot:

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

## Source-of-truth order

Distinguish "what the product should do" from "what the current code happens to do."

When sources conflict, use this order unless the task establishes another hierarchy:

1. explicit current user decision;
2. accepted current Goal / Acceptance Criteria and approved product/decision specification;
3. current tests and code as evidence of implemented behavior;
4. recent repository history/PR evidence;
5. older narrative/historical documentation.

Code/tests are strong evidence of current behavior, but they do not automatically override an approved specification describing intended behavior.

## Repository knowledge, not chat history

Persistent instructions should stay small and navigational. `CLAUDE.md` and `AGENTS.md` point to focused repository sources rather than becoming encyclopedias. Chat history is useful context, but durable decisions, regression tests, issues, provenance, and workflow rules should live in the repository when future agents need them.

## Promotion rules

Recurring signal should move up the stack rather than being re-solved by hand each time:

| Recurring signal | Promote to |
| --- | --- |
| Repeated bug | Regression test |
| Cross-agent judgment error | Shared project rule/focused doc |
| Agent-specific judgment error | Thin agent adapter |
| Repeated workflow | Shared workflow first; agent Skill only if needed |
| Deterministic safety check | Script/hook/CI/workflow condition |
| Reusable project lesson | `Learnings.md`, then a stable rule when evidence justifies promotion |

The target is not maximum automation. Promote only failures/repetition that are costly enough to justify another mechanism, and remove mechanisms that no longer help.

## Hooks: add only when evidence justifies them

Do not add hooks merely because a harness supports them. Use hooks for deterministic repeated actions after a real failure demonstrates value.

Candidate future hooks:

- block direct commits to `main`;
- detect likely secrets in staged changes;
- block destructive git commands outside explicit user request;
- pause before paid/external audio generation;
- guard commercial/licensed asset usage.

Before adding an agent-specific hook, check that agent's current official hook/configuration specification rather than assuming another agent's mechanism applies.

## Future: commercial audit script

Not built yet. Candidate future command:

```text
npm run audit:commercial
```

Possible checks include leftover incompatible assets/data, required third-party notices, prohibited licenses, secrets, and asset-provenance gaps.
