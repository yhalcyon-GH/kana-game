# Production operations checkpoint

This file exists to prevent repeated Human Gate work when a chat, agent, or local session changes. GitHub is the durable source of truth for completed Production setup and cutover state. Do not repeat a completed step merely because a new chat cannot remember it.

## Current durable Production state

As of 2026-09-20:

- Dedicated XServer SSH access for the fixed read-only Production checks is working.
- The local operator has a persistent resume helper at `C:\Users\halcy\tamamizu-resume.ps1`. Its contents are local-only and must not be copied into the repository.
- Production API root and the allowlisted PHP CLI were already confirmed during the initial setup. Do not rediscover them in each chat.
- PHP 8.4 is available for the fixed Production runners.
- `production:preflight` passes with:
  - `webCookieAuthActive=true`
  - `productionMagicLinkMailerConfigured=true`
  - `devHarnessEnabled=false`
- A fresh Production DB backup was taken before the 2026-09-20 auth schema change.
- A rollback archive of the previously deployed Production API was taken before the 2026-09-20 API deployment.
- Production migration `0006_email_otp_persistent_login.sql` was explicitly human-approved, applied, and verified:
  - `email_login_challenges` exists
  - `persistent_sessions` exists
  - `sessions.persistent_session_id` exists
- Migration `0007_dev_harness_login_codes.sql` is intentionally NOT applied in Production because it is dev-only.
- The reviewed API release from main commit `419878e097e10e8f5dc4b999e03071379b391642` was explicitly human-approved and deployed.
- Post-deploy `production:release-integrity` passed.
- Post-deploy `production:preflight` passed.

No Production secrets, private keys, DB contents, customer identifiers, or backup paths belong in this file.

## What to run when a new chat/session starts

First run the local helper once:

    & C:\Users\halcy\tamamizu-resume.ps1

Then tell the assistant:

    Tamamizuの続きを進めて。GitHubをsource of truthとしてresumeしてください。

The assistant must read live GitHub state before asking the human to repeat completed Production setup.

For a concise read-only Production health check, after the local helper has loaded the environment, run:

    npm run production:status

This is equivalent to the three fixed read-only checks:

    npm run production:php-probe
    npm run production:preflight
    npm run production:release-integrity

## Repeat policy

Do NOT repeat these just because the chat changed:

- SSH host/user/port discovery
- SSH private-key location discovery
- known_hosts creation/discovery
- Production API-root discovery
- PHP CLI version discovery
- migration 0006
- the 2026-09-20 DB backup
- the 2026-09-20 pre-deploy API rollback archive
- the 2026-09-20 API deployment
- already-recorded Paddle Live purchase/refund tests
- already-recorded cancelled-checkout QA
- already-recorded PWA install QA

Repeat a step only when its trigger occurs:

| Step | Repeat only when |
| --- | --- |
| `npm run resume` | Start of a new agent/chat/work session, or before mutation after a long pause |
| `npm run production:status` | Production state matters, after a deploy, or drift/failure is suspected |
| DB backup | Immediately before a NEW Production DB write/migration |
| API rollback backup | Immediately before a NEW Production API deployment |
| DB migration | A NEW reviewed migration is required and explicitly human-approved |
| Production API deployment | Reviewed main changed, deployment is actually needed, and the human explicitly approves the Production write |
| Real-browser auth QA | After auth/session behavior changed in Production, or when a current release requires final validation |
| Real Paddle charge/refund | Never repeat for routine confidence; only with separate explicit human approval and a concrete need |

## Current next Human Gate

The 2026-09-20 DB migration and API deployment are complete. The next relevant Human Gate is a real-browser check against the newly deployed Production auth flow:

1. OTP login succeeds.
2. Login survives a normal reload.
3. Logout returns to signed-out state.

Once this is recorded, do not ask the human to repeat it in later chats unless a later auth/session deployment materially changes that behavior.

## Safety

`docs/operational-gates.md` remains authoritative. In particular:

- NO MONEY WITHOUT EXPLICIT HUMAN APPROVAL.
- Production DB writes/migrations require explicit human approval.
- Production deployments require explicit human approval.
- Production secret, DNS, Paddle Live, and paid-resource mutations remain Human Gates.
