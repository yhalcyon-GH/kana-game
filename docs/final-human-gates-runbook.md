# Final Human Gates Runbook

This is the shortest remaining path from the completed AI-only launch work to a human GO/NO-GO decision. Do not repeat completed Paddle Live purchase/refund, OTP, migration, API deploy, PWA install/recovery, or checkout-cancel QA just because a session changes.

Run the gates in order.

## Gate 1 — exact Production CORS allowlist

This is read-only. It uses the existing local SSH variables loaded by the resume helper and prints no configured origin values.

From PowerShell:

    & C:\Users\halcy\tamamizu-resume.ps1
    npm run production:cors-probe

Expected pass:

    Production CORS probe passed: corsExact=true originCount=1

That means the effective Production allowlist is exactly:

    https://app.tamamizu.giganihongo.com

The command deliberately reports only equality + count. It never prints the real configured list.

If it reports `corsExact=false`, stop. Do not paste config.php or secret values into chat. A Production config correction is a Human Gate and should be made only after reviewing the intended change.

## Gate 2 — Production PHP error-log access and retention

First verify that the existing XServer account can read the domain's error log. This is read-only:

    xserver server log error --domain tamamizu.giganihongo.com --lines 50

Do not paste raw logs into chat if they contain request/customer data. Report only:

- whether the command returned the log successfully;
- whether any repeated `paddle-webhook: stage=` errors are present;
- whether `request-link: mailer_unconfigured` is present.

A few unrelated historical PHP warnings are not automatically a launch blocker. Repeated current auth/purchase/webhook failures are.

Then, in XServer Server Panel, open the Error Log screen for `tamamizu.giganihongo.com` and confirm the current save/retention setting. XServer's current documentation says recent error logs are available in the panel and that longer user-area saving is configurable; the actual account/domain setting is not visible from the repository.

Record the chosen operational retention in `docs/observability.md` after the human confirms it. Do not invent a duration before that confirmation.

## Gate 3 — final legal decisions

Read:

    docs/final-legal-readiness-audit-2026-09-20.md

The human must intentionally decide these items before AI edits the public legal pages:

1. **Public operator/supplier identity** — what legal/business/brand identity should be published.
2. **Public support phone** — whether Paddle/current legal requirements require one, and which number may be public if needed.
3. **Purchase acceptance** — approve the final click-wrap mechanism/wording for Terms + Refund Policy.
4. **Paddle Merchant of Record wording** — approve a concise description of Paddle's role in the Terms/Support pages.
5. **Launch geography/privacy scope** — which markets are intentionally served, and which controller/lawful-basis/rights/transfer disclosures therefore apply.
6. **Minor/guardian policy** — no minimum age vs account/purchase age restriction vs other guardian rule.

Do not put a private legal name, address, or phone number into GitHub unless the operator has deliberately chosen to publish it.

After the human supplies these decisions, AI can implement the approved legal wording, tests, and deployment automatically up to any new Human Gate.

## Gate 4 — rollback / GO-NO-GO

Before opening Tamamizu to normal customer traffic, confirm:

- the current reviewed frontend build is the one publicly served;
- `npm run production:status` passes;
- Gate 1 CORS probe passes;
- Gate 2 confirms logs are reachable and there are no repeated current auth/purchase/webhook failures;
- the existing DB/API rollback backups and restore procedure are understood;
- the final public legal pages reflect the decisions from Gate 3.

Suggested abort conditions are objective failures such as:

- Production release-integrity mismatch;
- Email OTP/auth failure;
- Paddle webhook signature/config failure;
- entitlement mismatch after a valid transaction/refund;
- repeated current server errors;
- unexpected CORS origin(s).

A destructive rollback rehearsal is optional if the existing backup/restore procedure is already understood; do not create a new Production write merely to prove it unless the human specifically chooses to rehearse it.

The final GO/NO-GO decision remains human-only.
