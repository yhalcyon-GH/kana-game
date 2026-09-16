# Autonomous / Overnight Operations Protocol

Durable operating protocol for AI-led work so future ChatGPT/Codex/Claude Code
sessions can resume safely from GitHub and make maximum progress without
repeated human supervision. This layers on top of
[`ai-operations-policy.md`](./ai-operations-policy.md),
[`ai-development-loop.md`](./ai-development-loop.md), and
[`resume-protocol.md`](./resume-protocol.md); it does not replace or loosen
any gate defined there.

## Source of truth

GitHub is the source of truth: `main`, open Issues, PRs, exact-HEAD CI, and
durable repo docs/checkpoints outrank chat memory. Every new session resumes
live GitHub state (`npm run resume`, [`resume-protocol.md`](./resume-protocol.md))
before mutating anything. Never infer current state from stale local
branches or chat summaries when GitHub can be checked directly.

## Roles

- **Claude Code:** primary implementation agent — explore, implement, test,
  commit, push, open a reviewable PR, and report.
- **ChatGPT/Codex:** orchestration, GitHub state/resume, task decomposition,
  Issue/PR creation, independent diff review, exact-HEAD CI verification,
  merge, queue management, launch/operations judgment.
- **Human:** product decisions and explicit Human Gates only.

Role defaults and swap conditions are defined in the
[Task roles](./ai-development-loop.md#task-roles) section of the development
loop; this doc does not redefine them.

## Autonomous execution loop

For an AI-ready task, continue without asking for confirmation through:

1. resume live GitHub state;
2. select the highest-priority unblocked Issue;
3. delegate/implement;
4. commit + push;
5. open/find the PR;
6. independently review the exact diff;
7. verify exact-HEAD CI;
8. if safe and all required checks pass, merge without additional human
   approval;
9. close the completed Issue;
10. move to the next unblocked task.

If CI or review finds a fixable issue, send it back to the Builder and
continue the loop rather than stopping for the human. This loop is bounded
by the same [Review depth](./ai-development-loop.md#review-depth) tiers and
[Merge gate](./ai-development-loop.md#merge-gate) as any other task — nothing
here authorizes skipping independent review or the live-HEAD recheck for a
Consequential change.

## Stop / Human Gates

Stop only when progress requires one of these, or a genuine product/legal
decision not already specified:

- real charge/refund or any other real-money operation;
- Paddle Live configuration/transaction mutation;
- paid API/service/resource use;
- Production DB write;
- DNS change;
- Production secret/credential change;
- KYC/payout/final legal decision;
- final general go/no-go for real customer traffic;
- destructive/irreversible operation not already covered by explicit policy.

Never paste secrets or personal financial/account identifiers into
GitHub/chat.

Read-only Production checks are allowed only when already explicitly
approved and bounded by repo procedure
([`production-readonly-connection.md`](./production-readonly-connection.md)).
The previously paused complex Production SSH/preflight diagnosis must remain
paused unless separately re-authorized.

## Overnight mode

`Overnight mode` means:

- maximize useful AI-only progress through the ordered queue while the human
  is away;
- keep going across multiple independent Issues/PRs when prior items merge;
- do not wait for cosmetic/optional work when a more important unblocked
  task exists;
- if one task hits a Human Gate, record the blocker and continue with other
  independent AI-ready tasks instead of stopping the whole queue;
- avoid concurrent branches that modify the same files/state; parallelize
  only clearly non-overlapping work;
- never start a paid or Production-mutating workaround just because the
  preferred path is blocked;
- leave a concise morning checkpoint: merged work, open PRs, CI failures,
  Human Gates, next machine action.

## Priority / severity

1. Launch blockers / security / data integrity / entitlement / auth
   failures.
2. User-visible correctness and required legal/commercial disclosures.
3. Content/UX improvements.

P2/P3 polish must not indefinitely delay launch unless evidence shows it is
actually blocking.

## Review/merge standard

Normal PR merge requires independent review and exact-HEAD required CI
success, per [Review depth](./ai-development-loop.md#review-depth) and the
[Merge gate](./ai-development-loop.md#merge-gate). The head SHA must be
rechecked immediately before merge; never merge a moved head based on old
CI/review. Docs-only PRs still receive appropriate verification but should
not trigger unnecessary Production work. There is no self-approval shortcut
that skips the independent review role.

## Recovery

- If a Builder's sandbox cannot update the intended branch, do not lose
  work: inspect the new branch, reconcile it from GitHub, open the correct
  PR if safe, and record the divergence.
- If a tool/agent stops, continue with another available AI path when safe
  rather than waiting unnecessarily.
- If state is ambiguous, resolve from GitHub before acting.
