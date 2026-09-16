# Autonomous / Overnight Operations Protocol

This document adds the **multi-task autonomous loop** and the **"Overnight
mode" invocation** for Tamamizu/KanaGame work. It does not replace or loosen
any existing gate: roles and cost routing stay defined by
[`ai-operations-policy.md`](./ai-operations-policy.md), the per-task workflow
and review-depth ladder stay defined by
[`ai-development-loop.md`](./ai-development-loop.md), and resume/checkpoint
mechanics stay defined by [`resume-protocol.md`](./resume-protocol.md). Use
this doc only to decide *whether to keep going without asking* across a queue
of tasks; use those docs for *how* each task is built, reviewed, and merged.

## Source of truth

GitHub is the source of truth: `main`, open Issues, PRs, exact-head CI, and
durable repo docs/checkpoints outrank chat memory. Every new or resumed
session runs `npm run resume` (see [`resume-protocol.md`](./resume-protocol.md))
and reads live GitHub state before any mutating action. Never infer current
state from a stale local branch, another agent's report, or a chat summary
when GitHub can be checked directly.

## Roles

Same roles as [`ai-operations-policy.md`](./ai-operations-policy.md) and
[`ai-development-loop.md`](./ai-development-loop.md#task-roles): Claude Code
is the normal Builder; ChatGPT/Codex handle orchestration, GitHub-state
resume, task decomposition, Issue/PR creation, independent review, exact-head
CI verification, merge, and queue management; the human retains product
decisions and the Stop/Human Gates below.

## Autonomous execution loop

For an AI-ready task, an orchestrator (normally ChatGPT, or Codex when
substituting) may continue without asking for confirmation through:

1. resume live GitHub state (`npm run resume`);
2. select the highest-priority unblocked Issue (see Priority/severity below);
3. delegate to/implement with the Builder;
4. commit + push;
5. open or find the task PR;
6. independently review the exact diff;
7. verify exact-head CI;
8. if the change is Standard or Enhanced review tier per
   [`ai-development-loop.md`](./ai-development-loop.md#review-depth), all
   required review/CI gates pass, and merging does not touch anything in the
   Stop/Human Gates list below, merge without an additional per-merge human
   approval; a **Consequential change** always keeps its existing explicit
   human-approval requirement — this loop never widens that boundary;
9. close the completed Issue;
10. move to the next unblocked task.

If CI or review finds a fixable issue, send it back to the Builder and
continue the loop rather than stopping for the human.

## Stop / Human Gates

Stop only when progress requires one of these, or a genuine product/legal
decision not already specified. This list is the same boundary as the
[`ai-operations-policy.md`](./ai-operations-policy.md#non-negotiable-human-gates)
non-negotiable human gates and the [`resume-protocol.md`](./resume-protocol.md#stop-conditions)
stop conditions, plus two general catch-alls this loop adds explicitly:

- real charge/refund or any other real-money operation;
- Paddle Live configuration/transaction mutation;
- paid API/service/resource use;
- Production DB write;
- DNS change;
- Production secret/credential change;
- KYC/payout/final legal decision;
- **final general go/no-go for real customer traffic** (distinct from a
  single validated Live test purchase/refund — see
  [`pre-live-launch-checklist.md`](./pre-live-launch-checklist.md));
- **any destructive/irreversible operation not already covered by explicit
  policy**.

Never paste secrets or personal financial/account identifiers into
GitHub/chat.

Read-only Production checks (see
[`production-readonly-connection.md`](./production-readonly-connection.md))
are allowed only when already explicitly approved and bounded by that
procedure. The Production SSH/preflight diagnosis stays paused per
`ops/project-state.json`'s `known_non_blockers` unless separately
re-authorized; this loop does not restart it.

## Overnight mode

`Overnight mode` (or an equivalent short invocation) means, for the duration
the human is away:

- maximize useful AI-only progress through the ordered queue;
- keep going across multiple independent Issues/PRs as prior items merge;
- do not wait on cosmetic/optional work when a more important unblocked task
  exists;
- if one task hits a Stop/Human Gate, record the blocker (Issue comment and/or
  checkpoint) and continue with other independent AI-ready tasks instead of
  stopping the whole queue;
- avoid concurrent branches that modify the same files/state; parallelize
  only clearly non-overlapping work;
- never start a paid or Production-mutating workaround just because the
  preferred path is blocked;
- leave a concise morning checkpoint: merged work, open PRs, CI failures,
  Human Gates hit, and the next machine action.

## Priority/severity

1. Launch blockers, security, data integrity, entitlement, and auth failures.
2. User-visible correctness and required legal/commercial disclosures.
3. Content/UX improvements.

P2/P3 polish must not indefinitely delay launch unless evidence shows it is
actually blocking.

## Review/merge standard

Follow the existing [`ai-development-loop.md`](./ai-development-loop.md#review-depth)
review-depth ladder and [merge gate](./ai-development-loop.md#merge-gate)
unchanged: normal merge requires independent review plus exact-head required
CI success, and the head SHA is rechecked immediately before merge — never
merge a moved head based on stale CI/review. Docs-only PRs still receive
appropriate verification but should not trigger unnecessary Production work.
There is no self-approval shortcut that skips the independent-review role.

## Recovery

- If a Builder's sandbox cannot update the intended branch, do not lose work:
  inspect the new branch, reconcile it from GitHub, open the correct PR if
  safe, and record the divergence (Issue comment and/or checkpoint).
- If a tool/agent stops responding, continue with another available AI path
  when safe rather than waiting unnecessarily — see
  [`ai-development-loop.md`](./ai-development-loop.md#stagnation-detection-and-route-switching).
- If state is ambiguous, resolve from GitHub before acting — see
  [`ai-development-loop.md`](./ai-development-loop.md#agent-switch-handoff)
  and [`resume-protocol.md`](./resume-protocol.md).
