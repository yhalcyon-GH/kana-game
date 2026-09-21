# Production operations checkpoint

This file exists to prevent repeated Human Gate work when a chat, agent, or local session changes. GitHub is the durable source of truth for completed Production setup and cutover state. Do not repeat a completed step merely because a new chat cannot remember it.

## Current durable Production state

As of 2026-09-21:

- Dedicated XServer SSH access for the fixed Production checks is working.
- The local operator has a persistent resume helper at `C:\Users\halcy\tamamizu-resume.ps1`. Its contents are local-only and must not be copied into the repository.
- Production API root and the allowlisted PHP CLI were already confirmed. Do not rediscover them in each chat.
- PHP 8.4 is available for the fixed Production runners.
- Production migration `0006_email_otp_persistent_login.sql` was explicitly human-approved, applied, and verified:
  - `email_login_challenges` exists
  - `persistent_sessions` exists
  - `sessions.persistent_session_id` exists
- Migration `0007_dev_harness_login_codes.sql` is intentionally NOT applied in Production because it is dev-only.
- Security migration `0008_magic_link_browser_binding.sql` was explicitly human-approved, applied, and verified on 2026-09-21.
- Security migration `0009_paddle_event_reconciliation.sql` was explicitly human-approved, applied, and verified on 2026-09-21 together with the matching reviewed backend.
- The guarded `ops/paddle-reconciliation-cutover.php` cutover completed with
  `grantBackedUnreconciledTransactions=0` and
  `unresolvedReconciliationBlocks=0`. No quarantine block remained.
- A fresh Production DB backup and API rollback backup were created before the
  0008/0009 cutover, and release-integrity passed after the reviewed backend
  deployment.
- The deployment initially left the web-served `api/auth/` directory at mode
  `700`, causing every public `/api/auth/*` endpoint to return HTTP 403.
  The human operator corrected only that directory to `755` on 2026-09-21.
  External verification then returned:
  - `/api/auth/capabilities.php` -> HTTP 200 with `email_code_auth=true`
  - `/api/auth/me.php` -> HTTP 401 while signed out
  - `/api/ops/auth-readiness-check.php` -> HTTP 403 as intended
  Future Windows-to-XServer releases must normalize web-served `api/auth/`
  directories to `0755` and reviewed PHP files to `0644`; do not propagate
  client-side directory modes as the final Production permissions.
- Production email OTP configuration is enabled:
  - a distinct `LOGIN_CODE_PEPPER` is configured without exposing its value
  - `EMAIL_CODE_AUTH_ENABLED=true`
  - public `/api/auth/capabilities.php` returns `email_code_auth=true`
- Production API release-integrity passed after OTP enablement.
- PR #312 added a visible PWA update prompt and preserved local learner data.
- PR #317 added deterministic service-worker update checks:
  - explicit `registration.update()` when the registration becomes available
  - foreground/focus re-checks with throttling
  - hourly re-check while open
  - existing consent-gated Update button remains the activation path
- GitHub Pages deployment for main `2e018d246e97dde797642878b637adc91bffeb34` completed successfully.
- Public Production Settings shows `Build: 2e018d2`.
- The user's already-installed PWA still reports `Build: 419878e`. That build predates the deterministic update-check fix and therefore needs one non-destructive recovery before it can benefit from the new update behavior.

No Production secrets, private keys, DB contents, customer identifiers, or backup paths belong in this file.

## What to run when a new chat/session starts

First run:

    & C:\Users\halcy\tamamizu-resume.ps1

Then tell the assistant:

    Tamamizuの続きを進めて。GitHubをsource of truthとしてresumeしてください。

The assistant must read live GitHub state before asking the human to repeat completed Production setup.

For a concise read-only Production health check, after the local helper has loaded the environment:

    npm run production:status

## Repeat policy

Do NOT repeat these merely because the chat changed:

- SSH host/user/port discovery
- SSH private-key location discovery
- known_hosts creation/discovery
- Production API-root discovery
- PHP CLI discovery
- migration 0006
- the completed 2026-09-20 backups/deployments
- Production OTP secret/config enablement
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

The Security Audit v1 Production cutover is complete as of 2026-09-21. There is
no remaining security-release Human Gate for migrations 0008/0009 or the
matching backend deployment. Return to ordinary post-launch monitoring.

After the 0009-aware backend has processed any webhook, **application-only
rollback to the pre-0009 backend is not an allowed rollback path**. Use a
forward fix/reconciliation-compatible build, or a coordinated pre-cutover DB
restore plus controlled webhook recovery under the relevant Human Gates.

Separately, the installed PWA still has a one-time, non-destructive recovery from old Build `419878e` to current Production. Because Build `419878e` predates PR #317, it cannot execute the new active `registration.update()` logic until it has updated once.

Rules for this recovery:

- Do not uninstall the PWA.
- Do not clear site data/storage.
- Preserve local learning progress.
- Prefer a normal same-origin browser navigation/reload first so the existing registration gets another update opportunity.
- If the old build still does not advance, use a non-destructive service-worker update action (for example, browser remote debugging / DevTools Update or `registration.update()`) rather than clearing storage.
- Once the installed build reaches current Production, future updates should be handled by PR #317's deterministic checks and the existing Update prompt.

After recovery, perform the final Production auth smoke once:

1. receive a 6-digit OTP
2. sign in successfully
3. reload/relaunch and confirm the signed-in state persists
4. sign out successfully

Once recorded, do not repeat this QA unless a later auth/session/config deployment materially changes the behavior.

## PWA update behavior

Routine updates must not require uninstalling the installed PWA or clearing site storage.

- Current build is visible in Settings/About as `Build: <short-sha>`.
- Current builds actively ask the service-worker registration to check for updates on registration/foreground/focus, with throttling, plus hourly while open.
- When a newer worker is waiting, Tamamizu shows `A new version is available.` with an Update action.
- Update activation replaces the app shell and reloads once.
- It does not clear local learning progress, localStorage, IndexedDB, or runtime media caches.

## Safety

`docs/operational-gates.md` remains authoritative. In particular:

- NO MONEY WITHOUT EXPLICIT HUMAN APPROVAL.
- Production DB writes/migrations require explicit human approval.
- Production deployments require explicit human approval.
- Production secret, DNS, Paddle Live, paid-resource, and email-send mutations remain Human Gates.


## 2026-09-21 final post-launch maintenance closeout

The remaining explicitly approved post-launch hardening and maintenance gates are complete:

- Issue #348 ephemeral-data retention cleanup is active in Production. A fresh DB backup was taken before activation; the reviewed cleanup CLI/repository files were deployed; the initial read-only preview reported zero eligible rows across magic-link tokens, email login challenges, sessions, persistent sessions, and purchase intents, so no first-run deletion was necessary. HTTP protection and signed-out auth controls remained healthy. The owner then configured the approved recurring bounded cleanup Cron. The 30-day grace period, per-table batch limit, grant/FK preservation rules, and guarded CLI remain authoritative.
- Issue #350 was closed as a documented v1 accepted hosting constraint. Meaningful frontend response headers still require a broader hosting/CDN/DNS change; meta-only CSP/frame-busting substitutes remain intentionally rejected.
- Issue #366 was closed as the documented v1 accepted commercial residual for static/PWA premium assets. Revisit only on the issue's stated piracy/value/subscription triggers.
- PR #384 updated `actions/deploy-pages` to v5.0.1 after exact-head CI/review passed. The resulting Production GitHub Pages deployment completed successfully.
- Stale PR #356 was superseded by #384 and closed. Stale PR #294 was superseded by the already-merged complete Agentic Workflow implementation in PR #296 and closed.

At this checkpoint there is no queued launch-blocking or post-launch remediation work. Future Production writes, Paddle Live or real-money actions, DNS/hosting changes, secrets, paid resources, or deployments remain fresh Human Gates under `docs/operational-gates.md`. Do not repeat completed validation merely to recreate confidence; act again only on new evidence or a new approved change.
