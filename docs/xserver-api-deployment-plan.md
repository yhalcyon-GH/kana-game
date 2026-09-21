# XServer API deployment plan

This is a **pre-deployment verification plan**, not an automation and not
authority to change Production. The owner performs any Production file upload
or rollback from a trusted local machine only after separately approving the
action.

## Reviewed layout

The released web frontend calls:

    https://tamamizu.giganihongo.com/api

On XServer, the source directory `server/` is mapped by copying the listed
release files into:

    giganihongo.com/public_html/tamamizu.giganihongo.com/api/

The exact absolute shell path is only needed for the local read-only
preflight; use the XServer account's confirmed path, not an assumed path.

## Candidate-release checks (no Production access)

1. Record the reviewed `main` SHA and confirm required GitHub Actions are
   green for that SHA.
2. Run the deterministic local checks on that exact checkout:

       npm run verify
       php server/tests/run-tests.php

3. Confirm the release source contains the following deployment sets:

   - all of `server/src/`, including `src/DevOnly/`. The latter is a
     library dependency of the normal authentication request endpoint; it is
     not a public endpoint by itself.
   - all of `server/auth/`;
   - `server/entitlement-me.php`;
   - `server/purchase-intent.php`;
   - `server/paddle-webhook.php`;
   - `server/ops/auth-readiness-check.php`, `server/ops/release-integrity-check.php`,
     `server/ops/paddle-reconciliation-cutover.php`, and the shared `server/ops/.htaccess` deny rule.

4. Confirm these are **not** included in the web-served release:

   - `server/dev-only/` (the development HTTP endpoint);
   - `server/tests/` and `server/sql/`;
   - `server/entitlement.php` (the fixed Sandbox-user PoC endpoint);
   - `server/config.example.php`.

The Production `api/config.php`, if used instead of real environment
variables, is deliberately untracked. Never copy, display, download, or
overwrite it as part of an application release. Creating or changing it is a
Production-secret change and needs the owner's explicit approval.

The Production root `api/.htaccess` is also deliberately **not** part of the
release set. XServer deployments may use that host-owned file for `SetEnv`,
rewrite rules, or other environment-specific configuration. Never replace,
download, display, or merge it as part of an ordinary application release.
Any host-level security-header/HSTS change is a separate Production
configuration Human Gate.

## Human-only deployment gate

Before uploading, the owner must securely preserve the currently deployed
application files for rollback and record the prior deployed SHA. Do not put
a backup containing configuration or secrets into GitHub or chat.

A release upload copies only the checked release sets above into the existing
`api/` directory while preserving the existing Production configuration.
No database schema, Paddle Dashboard setting, DNS record, or secret is
changed by this plan.

After staging/copying from a Windows operator machine, normalize the web-served
application permissions before declaring the deployment complete: directories
under `api/auth/` must be traversable by the web server (`0755`) and the
reviewed PHP entry files must be readable (`0644`). Do not use `cp -a` or
SCP-preserved client-side modes as the final permission source for web-served
directories. This normalization applies only to reviewed application files; it
must not chmod, replace, display, or otherwise modify `api/config.php` or the
host-owned root `api/.htaccess`.

For the Security & Safety Audit v1 backend release, database schema and backend
source must move together under the Human Gate. After the fresh Production DB
backup and before uploading the matching backend source, apply reviewed
migration `0008_magic_link_browser_binding.sql` and then
`0009_paddle_event_reconciliation.sql` in that order. Migration 0009 adds nullable replay-baseline metadata (including an explicit
legacy/coarse timestamp marker) but performs no speculative legacy-event
backfill. Migration 0007 remains dev-only and intentionally skipped in
Production.

Before any database/schema write, inventory grant-backed unreconciled
adjustments. After the fresh API rollback backup, stage **only** the reviewed
`ops/paddle-reconciliation-cutover.php` under the already-denied `ops/`
directory. Its `--check` path requires only the pre-0009 Config/Db runtime and
executes a read-only SELECT against columns that already existed before 0009:

    php ops/paddle-reconciliation-cutover.php --check

This staging upload is still a Production backend file write and therefore
requires the same explicit Human Gate, even though the command itself is
read-only.

Because the old backend can still create one last stranded row in the narrow
schema-to-code cutover window, the required order is:

1. fresh DB + API rollback backups;
2. stage only the reviewed cutover CLI file and run the read-only `--check`;
3. apply 0008, then 0009;
4. immediately deploy the matching reviewed backend while preserving
   `api/config.php` and root `api/.htaccess`;
5. under the same explicitly approved Production security-cutover Human Gate,
   run the idempotent repair:

       php ops/paddle-reconciliation-cutover.php --apply --human-approved-security-cutover

6. run `--check` again and require both
   `grantBackedUnreconciledTransactions=0` **and**
   `unresolvedReconciliationBlocks=0` before declaring cutover complete.

The repair acquires the same per-transaction lock as live webhooks. Known
non-reconstructable invariants are durably quarantined instead of relying on an
infinite/finite 500 retry loop. The cutover continues to later transactions,
but the affected normalized rows remain unreconciled and the final zero-count
gate stays non-zero until an operator resolves them. Any unresolved deterministic reconciliation block conservatively excludes
only that Paddle transaction while preserving any separate healthy repurchase. Treat any
quarantine/non-zero result as a deployment stop condition.

**Rollback boundary after 0009:** once the 0009-aware backend has processed any
webhook, an application-files-only rollback to the pre-0009 backend is
prohibited. Use a forward fix or a reconciliation-compatible rollback build.
A true return to the old backend requires a coordinated DB restore to the
pre-cutover backup plus controlled webhook pause/recovery; any Paddle Live
configuration change for that is a separate Human Gate.

If either migration is uncertain or fails before the new backend is exposed,
stop before completing the cutover and follow the coordinated rollback plan
rather than attempting an ad-hoc partial release.

The `ops/` directory includes a committed Apache rule that rejects all HTTP
requests. It exists solely so the fixed local SSH runner can execute:

    cd -- "$TAMAMIZU_PRODUCTION_API_ROOT" && php ops/auth-readiness-check.php

A post-upload browser request to
`/api/ops/auth-readiness-check.php` must return an HTTP denial, not
readiness output. The CLI preflight must still return only its three redacted
booleans. Do not run the browser request until the owner has approved the
Production upload.

After an approved upload, perform a read-only header verification against
`/api/auth/capabilities.php`. Application code should emit
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, the restrictive Permissions Policy, and the
JSON-API Content Security Policy. HSTS is intentionally **not** emitted by PHP:
the application cannot safely infer the original HTTPS transport behind the
hosting layer without a trusted-proxy contract. If HSTS is later enabled, do
so only as a separate host-level Human Gate after confirming the actual
XServer TLS/proxy configuration.

## Stop conditions

Stop the deployment and restore the preserved prior application files if any
of these is true:

- the reviewed SHA or required CI results cannot be identified;
- the release would overwrite or expose `config.php` or the host-owned root `api/.htaccess`;
- an excluded development or test endpoint would be web-served;
- the `ops/` HTTP denial cannot be verified;
- the redacted preflight reports an enabled development harness or an
  unconfigured production Magic Link mailer;
- a required database migration is uncertain, or a rollback procedure is
  unavailable;
- cutover reconciliation leaves any grant-backed unreconciled adjustment or
  any unresolved `paddle_reconciliation_blocks` row;
- the only proposed rollback is restoring pre-0009 application files while
  leaving 0009 database/baseline state in place.

A successful preflight is not approval for a real Magic Link email, Paddle
Live configuration, a charge, a refund, or any database write.
