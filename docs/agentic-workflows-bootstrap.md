# Agentic Workflows bootstrap

This change prepares the existing owner-gated Claude Code GitHub Action to author and compile GitHub Agentic Workflows using the official `gh aw` CLI.

## Scope

- No application code changes.
- No Production, Paddle Live, DNS, database, deployment, or secret changes.
- No automatic merge or production write capability.
- Claude remains gated to explicit `@claude` instructions from the repository owner.
- The only new shell capabilities are the official `gh-aw` installation, diagnostics, initialization/addition, and compilation commands needed to generate validated `.lock.yml` workflows.

## Planned follow-up

After this bootstrap PR is merged, create a separate implementation Issue for Claude Code to add and compile two read-oriented workflows:

1. Codex independent PR review.
2. CI failure investigation for PR verification failures.

Both follow-up workflows should use read-only agent permissions and sanitized `safe-outputs`; no automatic fixes, merges, deployments, or production actions in the first rollout.
