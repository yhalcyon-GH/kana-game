# Final Human Gates Runbook

This is the durable 2026-09-20 pre-launch checkpoint. **Do not repeat completed Production work just because a chat/session changes.**

## Completed technical gates

- Production CORS is reduced to exactly the Production frontend origin `https://app.tamamizu.giganihongo.com`; guarded backup/postcondition checks and `production:status` passed.
- Production PHP is 8.4; auth/mail readiness and release integrity passed.
- Email OTP is enabled and real-device OTP login, persistence, and logout QA passed.
- Production DB migration `0006_email_otp_persistent_login.sql` is applied; dev-only `0007` remains intentionally unapplied.
- Reviewed Production API code is deployed with rollback backups.
- Paddle Live product/price, one real purchase, one real refund, purchase records, and cancelled-checkout UX were already validated. **Do not repeat real-money tests for routine confidence.**
- XServer error logs are reachable; the reviewed log had no launch-critical Paddle/auth-mailer/PHP failure tags, and `giganihongo.com` user-area error-log retention is set to **9 weeks**.
- PWA install/update recovery and current update-check behavior were validated.

## Completed legal/product decisions and implementation

- Public supplier/operator/product identity: **Tamamizu**.
- Tamamizu operates from Thailand; the existing Thailand governing-law framework remains.
- Worldwide availability is limited to places Paddle supports, subject to legal/payment/sanctions restrictions.
- No minimum learning age; guardian involvement/management applies where needed.
- Refund policy: full refund within 14 calendar days, no usage condition or digital-content waiver.
- Public support email is published.
- Public Thai support phone is published in international format.
- Paddle Merchant-of-Record wording is present in Terms, with supporting role clarification on Support.
- The purchase page now requires an **explicit unchecked Terms & Conditions + Refund Policy acceptance** before Checkout can start. Acceptance is page-local and not persisted/tracked.

## Completed Gate — final human legal approval

Review the actual public-facing wording/UX in:

- `/terms`
- `/privacy`
- `/refund`
- `/support`
- Account → Full Access purchase section

Confirm that the public identity, support details, Paddle wording, refund promise, privacy disclosures, minors/guardian wording, and explicit acceptance checkbox are acceptable for launch.

**Completed 2026-09-20:** the human operator explicitly approved the current public Terms, Privacy Policy, Refund Policy, Support page, and explicit purchase acceptance UX for launch.

## Remaining Gate — final GO/NO-GO

Before normal customer traffic, verify read-only status:

    & C:\Users\halcy\tamamizu-resume.ps1
    npm run production:cors-probe
    npm run production:status

Expected:

- CORS exact single Production frontend origin.
- PHP/readiness/release-integrity all pass.
- No newly observed repeated current auth/purchase/webhook server errors.
- Current reviewed frontend build is the one publicly served.

Existing DB/API rollback backups and restore procedure should remain understood. A destructive rollback rehearsal is optional; do not create a new Production write merely to prove it unless the human explicitly chooses to rehearse it.

The final **GO/NO-GO decision is human-only**.

## Stop conditions

Stop launch and investigate if any of the following appears:

- Production release-integrity mismatch.
- Email OTP/auth failure.
- Paddle webhook signature/config failure.
- Entitlement mismatch after a valid transaction/refund.
- Repeated current server errors.
- Unexpected CORS origin(s).
- Public legal/support pages do not match the approved wording.

## Safety boundary

**NO MONEY WITHOUT EXPLICIT HUMAN APPROVAL.** Do not perform new real Paddle charges/refunds, Paddle Live mutations, paid-service activation, Production DB writes, DNS changes, Production secret changes, email sends, or Production backend deployments without explicit approval.
