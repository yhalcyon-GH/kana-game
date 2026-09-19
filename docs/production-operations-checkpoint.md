# Production operations checkpoint

This file exists to prevent repeated Human Gate work when a chat, agent, or local session changes. GitHub is the durable source of truth for completed Production setup and cutover state. Do not repeat a completed step merely because a new chat cannot remember it.

## Current durable Production state

As of 2026-09-20:

- Dedicated XServer SSH access for the fixed Production checks is working.
- The local operator has a persistent resume helper at `C:\Users\halcy\tamamizu-resume.ps1`. Its contents are local-only and must not be copied into the repository.
- Production API root and the allowlisted PHP CLI were already confirmed during the initial setup. Do not rediscover them in each chat.
- PHP 8.4 is available for the fixed Production runners.
- Production migration `0006_email_otp_persistent_login.sql` was explicitly human-approved, applied, and verified:
  - `email_login_challenges` exists
  - `persistent_sessions` exists
  - `sessions.persistent_session_id` exists
- Migration `0007_dev_harness_login_codes.sql` is intentionally NOT applied in Production because it is dev-only.
- A fresh Production DB backup was taken before migration 0006.
- A rollback archive of the previously deployed Production API was taken before the 2026-09-20 API deployment.
- The reviewed OTP/persistent-login API release was explicitly human-approved and deployed.
- Post-deploy `production:release-integrity` passed.
- Post-deploy `production:preflight` passed with:
  - `webCookieAuthActive=true`
  - `productionMagicLinkMailerConfigured=true`
  - `devHarnessEnabled=false`
- PR #312 added a visible PWA update prompt and preserved local learning progress/storage.
- PR #314 added secret-free OTP readiness booleans to the fixed Production preflight.
- GitHub Pages deployment for current main `7aa7f5dcf0ea707230d2dc9bd332c8891fd74a02` completed successfully.
- Public Production Settings shows `Build: 7aa7f5d`.
- The live service worker waits for explicit `SKIP_WAITING` and no longer silently activates a new build.
- The public Production auth capability currently returns `email_code_auth=false`; this is now understood as a Production OTP configuration state, not proof of a stale frontend.

No Production secrets, private keys, DB contents, customer identifiers, or backup paths belong in this file.

## What to run when a new chat/session starts

First run the local helper once:

    & C:\Users\halcy\tamamizu-resume.ps1

Then tell the assistant:

    Tamamizuの続きを進めて。GitHubをsource of truthとしてresumeしてください。

The assistant must read live GitHub state before asking the human to repeat completed Production setup.

For a concise read-only Production health check, after the local helper has loaded the environment, run:

    npm run production:status

This is equivalent to:

    npm run production:php-probe
    npm run production:preflight
    npm run production:release-integrity

## Repeat policy

Do NOT repeat these merely because the chat changed:

- SSH host/user/port discovery
- SSH private-key location discovery
- known_hosts creation/discovery
- Production API-root discovery
- PHP CLI discovery
- migration 0006
- the 2026-09-20 DB backup
- the 2026-09-20 initial API rollback archive
- the 2026-09-20 initial API deployment
- already-recorded Paddle Live purchase/refund tests
- already-recorded cancelled-checkout QA
- already-recorded PWA install QA

Repeat a step only when its trigger occurs:

| Step | Repeat only when |
| --- | --- |
| `npm run resume` | Start of a new chat/agent/work session, or before mutation after a long pause |
| `npm run production:status` | Production state matters, after a deploy/config change, or drift/failure is suspected |
| DB backup | Immediately before a NEW Production DB write/migration |
| API rollback backup | Immediately before a NEW Production API deployment/write |
| DB migration | A NEW reviewed migration is required and explicitly human-approved |
| Production API deployment | Reviewed server code changed, deployment is actually needed, and the human explicitly approves the Production write |
| Production secret/config mutation | A reviewed change is required and the human explicitly approves it |
| Real-browser auth QA | After auth/session behavior or auth configuration changed in Production |
| Real Paddle charge/refund | Never repeat for routine confidence; only with separate explicit human approval and a concrete need |

## Current next Human Gate

The frontend is current and the OTP backend/schema are already present. The remaining issue is Production OTP configuration.

The next approved Human Gate sequence is:

1. Take a fresh rollback backup immediately before the NEW readiness-file Production write.
2. Deploy the two readiness-only files from current main:
   - `server/ops/auth-readiness-check.php`
   - `server/src/Auth/ProductionAuthReadiness.php`
3. Run the new read-only `npm run production:preflight` and record:
   - `emailCodeAuthEnabled`
   - `loginCodePepperConfigured`
   - `emailCodeAuthReady`
4. Create/set a distinct Production `LOGIN_CODE_PEPPER` and set `EMAIL_CODE_AUTH_ENABLED=true` without exposing the secret value. The user explicitly approved this Production secret/config mutation in the current chat.
5. Run `npm run production:status`; expected auth state after enablement:
   - `webCookieAuthActive=true`
   - `productionMagicLinkMailerConfigured=true`
   - `devHarnessEnabled=false`
   - `emailCodeAuthEnabled=true`
   - `loginCodePepperConfigured=true`
   - `emailCodeAuthReady=true`
6. Confirm the public capability returns `email_code_auth=true`.
7. Perform one real-browser OTP login -> normal reload persistence -> logout check.

Once this succeeds, do not ask the human to repeat it in later chats unless a later auth/session/config deployment materially changes the behavior.

## PWA update behavior

Routine app updates must not require uninstalling the installed PWA or clearing site storage.

- Current build is visible in Settings/About as `Build: <short-sha>`.
- When a newer build is waiting, Tamamizu shows `A new version is available.` with an Update action.
- The Update action activates the waiting service worker and reloads once.
- Routine update handling must not clear local learning progress, localStorage, IndexedDB, or the runtime media cache.
- Do not tell a learner to uninstall the app or clear site data for a normal update unless there is specific evidence of corrupted storage and the user understands the data-loss risk.

## Safety

`docs/operational-gates.md` remains authoritative. In particular:

- NO MONEY WITHOUT EXPLICIT HUMAN APPROVAL.
- Production DB writes/migrations require explicit human approval.
- Production deployments require explicit human approval.
- Production secret, DNS, Paddle Live, paid-resource, and email-send mutations remain Human Gates.
