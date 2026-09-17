# Agentic Workflows: Codex PR review and CI failure investigator

This follows the [Agentic Workflows bootstrap](./agentic-workflows-bootstrap.md)
and adds the two read-oriented workflows it planned, authored and compiled
with the official `gh aw` CLI (`github/gh-aw`). Both are new, independent
workflows; the existing owner-gated `@claude` workflow
(`.github/workflows/claude.yml`) and the opt-in Claude PR review
(`.github/workflows/claude-code-review.yml`) are unchanged.

## Workflow A — Codex independent PR review

- Source: `.github/workflows/codex-pr-review.md`; compiled:
  `.github/workflows/codex-pr-review.lock.yml`.
- Trigger: `pull_request` `opened` / `ready_for_review`, gated on
  `draft == false`. It intentionally does not run on `synchronize`, so pushing
  more commits to an already-reviewed PR does not spend model usage again.
  This is a separate, automatic mechanism from the existing opt-in
  `AI review: Claude` marker gate; the two can both run on the same PR if a
  human also adds that marker, which is an accepted, low-risk overlap since
  neither workflow can modify code, merge, or deploy.
- Engine: OpenAI Codex (`engine: codex`).
- Permissions: `contents: read`, `pull-requests: read`, `issues: read`. No
  write permissions, no merge/deploy/Production access.
- Output: a single sanitized `add-comment` safe-output on the PR. No commits,
  no code changes, no other write action.

## Workflow B — CI failure investigator

- Source: `.github/workflows/pr-verify-failure-investigator.md`; compiled:
  `.github/workflows/pr-verify-failure-investigator.lock.yml`.
- Trigger: `workflow_run` for the `PR Verify` workflow, `types: [completed]`,
  restricted to `branches: [main]` (the base branch PRs verify against), with
  `if: conclusion == 'failure'`.
- Engine: OpenAI Codex (`engine: codex`), for the same authenticated-engine
  reason as Workflow A.
- Permissions: `actions: read`, `contents: read`, `issues: read`,
  `pull-requests: read`. Read-only; never reruns jobs, merges, deploys, or
  touches Production.
- Behavior: investigates the failed `PR Verify` run's logs and PR/repository
  context, classifies the likely root cause with a confidence level, and
  prefers commenting on the associated pull request. It only creates (or
  deduplicates onto an existing) issue when the failure is recurring across
  PRs/`main` or otherwise carries new actionable information beyond what a PR
  comment captures — never for a failure fully explained by that PR's own
  changes.

## Compilation and validation

Both workflows were compiled with the official `gh aw` CLI (`v0.88.7`):

- `gh aw compile --strict --validate` — passes with no warnings.
- `gh aw compile --actionlint` — no issues.
- `gh aw compile --shellcheck` — no issues.
- `gh aw compile --poutine` — no new findings on these two files (existing,
  pre-existing low-severity notes on unrelated workflows are unchanged).
- `gh aw compile --zizmor` — reports one `[High] github-env` finding inside
  gh-aw's own generated scaffolding (a step that copies the trusted
  `runner.tool_cache` context into `GITHUB_ENV`). This is not specific to our
  authored Markdown: compiling GitHub's own unmodified
  `githubnext/agentics/ci-doctor.md` catalog workflow with the same gh-aw
  version reproduces an identical finding. Since generated `.lock.yml` files
  must come from the compiler and must not be hand-edited, this is left as a
  known upstream gh-aw/zizmor interaction rather than patched.

Compilation also produced supporting official tooling files, committed
alongside the workflows: `.gitattributes` (marks `*.lock.yml` as generated),
`.github/aw/actions-lock.json` (pinned action SHAs used by the compiled
workflows), `.github/skills/agentic-workflows/SKILL.md` (the `gh aw`
authoring/debugging dispatcher skill), and `.poutine.yml` (poutine scanner
configuration, with one documented skip for a rule that does not apply to
gh-aw's generated `activation` job).

## Required repository secret (human setup)

Both workflows use the Codex engine, which requires **one** of these repository
secrets to be set (either name works; the compiled workflow falls back from
the first to the second):

- `CODEX_API_KEY`, or
- `OPENAI_API_KEY`

This secret is not created, inferred, printed, or otherwise modified by this
change — a repository admin must add it under **Settings → Secrets and
variables → Actions** before these workflows can run successfully. Without
it, both workflows will fail at their credential-validation step rather than
running with a missing/blank credential.

No other secret, Production, Paddle, DNS, or database configuration is
introduced or changed by this work.
