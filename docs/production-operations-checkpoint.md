# Production operations checkpoint

This file exists to prevent repeated Human Gate work when a chat, agent, or local session changes. GitHub is the durable source of truth for completed Production setup and cutover state. Do not repeat a completed step merely because a new chat cannot remember it.

## Current durable Production state

As of 2026-09-20:

- Dedicated XServer SSH access for the fixed Production checks is working.
- The local operator has a persistent resume helper at `C:\Users\halcy\tamamizu-resume.ps1`. Its contents are local-only and must not be copied into the repository.
- Production API root and the allowlisted PHP CLI were already confirmed. Do not rediscover them in each chat.
- PHP 8.4 is available for the fixed Production runners.
- Production migration `0006_email_otp_persistent_login.sql` was explicitly human-approved, applied, and verified:
  - `email_login_challenges` exists
  - `persistent_sessions` exists
  - `sessions.persistent_session_id` exists
- Migration `0007_dev_harness_login_codes.sql` is intentionally NOT applied in Production because it is dev-only.
- Security migration `0008_magic_link_browser_binding.sql` is **not yet applied**
  in Production. It is additive, does not depend on dev-only 0007, and must be
  applied only after the normal Production DB backup/Human Gate immediately
  before deploying the matching #364 backend source. Until both migration and
  code are deployed together, keep the current Production backend unchanged.
- Security migration `0009_paddle_event_reconciliation.sql` is **not yet
  applied** in Production. It adds the per-Paddle-transaction serialization
  table plus nullable replay-baseline metadata and widens Paddle event-ordering
  timestamps to `DATETIME(6)`. It does **not** guess/backfill missing legacy
  adjustment payloads. The matching #365 backend initializes each legacy
  transaction's baseline lazily from its already-materialized grant status and
  `status_changed_at` while holding that transaction's lock. The backend also
  marks that legacy snapshot as whole-second/coarse and refuses ambiguous
  same-second entitlement restoration. Apply 0009 only after 0008, under the
  same Production DB backup/Human Gate, immediately before deploying the
  matching #365 backend source. Do not deploy #365 backend code against a
  schema that has not applied 0009.
- The #365 cutover also requires the guarded one-time
  `ops/paddle-reconciliation-cutover.php` inventory/repair to clear any
  pre-existing **grant-backed unreconciled adjustments** left by the old race.
  Duplicate Paddle delivery cannot be relied on to heal those because the old
  event id may already be present in `payment_events`.
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

The next security-release Human Gate, once the audited source changes are
merged and reviewed, is a **single coordinated Production update**: preserve a
DB/API rollback backup, apply migration 0008 then 0009, and deploy the matching
reviewed backend source while preserving `api/config.php` and the host-owned
root `api/.htaccess`, then run the guarded idempotent Paddle cutover
reconciliation and require a zero grant-backed-unreconciled count. Until that
explicit approval, keep Production unchanged.

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
