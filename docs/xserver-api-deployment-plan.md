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
   - `server/.htaccess` (reviewed API security-header policy);
   - `server/entitlement-me.php`;
   - `server/purchase-intent.php`;
   - `server/paddle-webhook.php`;
   - `server/ops/auth-readiness-check.php` and its `.htaccess` file.

4. Confirm these are **not** included in the web-served release:

   - `server/dev-only/` (the development HTTP endpoint);
   - `server/tests/` and `server/sql/`;
   - `server/entitlement.php` (the fixed Sandbox-user PoC endpoint);
   - `server/config.example.php`.

The Production `api/config.php`, if used instead of real environment
variables, is deliberately untracked. Never copy, display, download, or
overwrite it as part of an application release. Creating or changing it is a
Production-secret change and needs the owner's explicit approval.

## Human-only deployment gate

Before uploading, the owner must securely preserve the currently deployed
application files for rollback and record the prior deployed SHA. Do not put
a backup containing configuration or secrets into GitHub or chat.

A release upload copies only the checked release sets above into the existing
`api/` directory while preserving the existing Production configuration.
No database schema, Paddle Dashboard setting, DNS record, or secret is
changed by this plan.

The `ops/` directory includes a committed Apache rule that rejects all HTTP
requests. It exists solely so the fixed local SSH runner can execute:

    cd -- "$TAMAMIZU_PRODUCTION_API_ROOT" && php ops/auth-readiness-check.php

A post-upload browser request to
`/api/ops/auth-readiness-check.php` must return an HTTP denial, not
readiness output. The CLI preflight must still return only its three redacted
booleans. Do not run the browser request until the owner has approved the
Production upload.

After an approved upload, perform a read-only header verification against
`/api/auth/capabilities.php`. The response should include the reviewed root
`.htaccess` policy: HSTS, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, the restrictive
Permissions Policy, and the JSON-API Content Security Policy. If these headers
are absent, stop and verify XServer's Apache/mod_headers behavior rather than
assuming the committed policy is active.

## Stop conditions

Stop the deployment and restore the preserved prior application files if any
of these is true:

- the reviewed SHA or required CI results cannot be identified;
- the release would overwrite or expose `config.php`;
- an excluded development or test endpoint would be web-served;
- the `ops/` HTTP denial cannot be verified;
- the redacted preflight reports an enabled development harness or an
  unconfigured production Magic Link mailer;
- a required database migration is uncertain, or a rollback procedure is
  unavailable.

A successful preflight is not approval for a real Magic Link email, Paddle
Live configuration, a charge, a refund, or any database write.
