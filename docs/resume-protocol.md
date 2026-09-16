# Resume Protocol

Use this protocol whenever a Work/agent session starts, resumes after a timeout,
or is uncertain whether a previous action completed. GitHub is the durable
control plane; a Work thread is only a temporary executor.

## Fast path

From a clean checkout of the repository, run:

```bash
npm ci
npm run resume
```

`npm run resume` fetches `origin/main`, reads open and recently merged pull
requests through GitHub, and compares that live state with
[`ops/project-state.json`](../ops/project-state.json). It only reads state;
it never creates branches, pull requests, deployments, or configuration.

Each GitHub API read `npm run resume` performs is bounded by a finite,
documented timeout (`GITHUB_API_TIMEOUT_MS` in `scripts/resumeProject.mjs`).
If GitHub is temporarily unreachable — timeout, network failure, or an API
error response — the command fails closed: it exits non-zero with a concise
message confirming no mutating action was attempted, and does not retry.
Stop with the recorded checkpoint and retry the read-only resume preflight
later.

## Required decision order

1. Treat `origin/main`, GitHub pull-request status, and exact-HEAD CI as the
   current truth. The committed state file is a compact checkpoint, not a
   live database.
2. If the checkpoint differs from GitHub, do **not** repeat the recorded
   action. Identify whether its branch/PR is open, merged, or absent, then
   update the checkpoint only at the next meaningful milestone.
3. Confirm the `active_work_item` is not already merged or superseded before
   creating a branch or PR.
4. Continue only from `next_machine_action` or a newly bounded task derived
   from live GitHub evidence.

## Idempotent operation rules

- Before branch creation, check both local and `origin` branch names.
- Before PR creation, check for an open PR with the same head and base.
- Before merge, confirm the PR is still open, mergeable, approved as required,
  and that CI passed for its exact current HEAD.
- Before deploy, confirm the intended commit SHA and the existing deployment
  result. Do not infer a deployment from an earlier thread report.
- Before a configuration change, read the current value. Production and Live
  configuration remains Human Gate work.
- A merged/completed work item is evidence to record, never an instruction to
  recreate it.

## Checkpoints and handoff

Update `ops/project-state.json` and commit it in the same PR when one of these
events changes the next safe action: a PR is created or merged, `main` changes
materially, a blocker is resolved, or work reaches a Human Gate. Do not rewrite
it for routine conversation turns.

Exact-HEAD CI is durable GitHub Actions/PR metadata. Do **not** create a
state-only commit merely to record a passing CI result: that would create a new
head whose CI has not run yet. Instead, preserve the CI outcome in the PR
timeline or Issue and have every executor fetch the current head's checks.

The state file deliberately records the SHA verified *before its own PR is
merged*, so it can become stale by one merge commit. That is expected and is
why every executor must run `npm run resume` first. Do not add a workflow that
writes directly to `main` merely to keep this checkpoint current.

Keep task-specific intent in the PR description or Issue. Keep durable global
rules in `AGENTS.md`, `CLAUDE.md`, and `docs/ai-operations-policy.md`; do not
paste a large master prompt into each Work thread.

## Stop conditions

**NO MONEY WITHOUT EXPLICIT HUMAN APPROVAL.** Do not carry out real charges or
refunds, Paddle Live activity/configuration, paid service/API/resource changes,
Production DB writes, DNS changes, or Production secret changes. KYC, final
price/currency, final legal decisions, and Live-cutover approval remain Human
Gates.
