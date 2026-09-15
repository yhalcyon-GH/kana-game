# Production read-only connection

This repository provides two deliberately narrow, local-only SSH checks for
the first Production Server Human Gate:

    cd -- "$TAMAMIZU_PRODUCTION_API_ROOT" && <allowlisted-php-cli> ops/auth-readiness-check.php
    cd -- "$TAMAMIZU_PRODUCTION_API_ROOT" && <allowlisted-php-cli> ops/release-integrity-check.php

Neither command opens a shell, displays files, accesses a database, writes
files, changes configuration, sends email, or contacts Paddle.

The readiness command prints only whether web-cookie auth is enabled, whether
the production Magic Link mailer is configured, and whether the development
harness is enabled.

The release-integrity command prints only one aggregate SHA-256 fingerprint
of the non-secret API files listed in
`ops/release-integrity-manifest.json`. The local runner calculates the same
fingerprint from the reviewed checkout and fails on any mismatch; it never
prints individual file names, file contents, configuration, tokens, email
addresses, or secrets.

## Deployment layout this runner verifies

The Production frontend calls the PHP API at /api. For XServer, the reviewed
deployment layout is the **contents** of the repository's server/ directory
copied into the served API directory:

    public_html/<app-domain>/api/
      ops/auth-readiness-check.php
      ops/release-integrity-check.php
      src/Config.php
      ...other reviewed PHP entry points and source files...

Accordingly, TAMAMIZU_PRODUCTION_API_ROOT is the absolute server path to that
deployed api/ directory — it is not the repository checkout root. The
readiness scripts require their sibling src/ directory, so both must belong to
the same reviewed release.

## Human setup: one-time SSH access

XServer requires SSH to be enabled and a public key to be registered in the
Server Panel. This is an account-access action, not a payment action. The
private key must remain in a user-managed secure location; never commit it,
put it in a GitHub Action secret, paste it into chat, or upload it to the
repository.

Use a dedicated key solely for these read-only checks. Confirm the SSH host
key through a trusted XServer source before adding it to a local known-hosts
file. The runners refuse unknown or changed host keys.

Set these local environment variables only in the secure execution
environment:

    TAMAMIZU_PRODUCTION_SSH_TARGET=account@host
    TAMAMIZU_PRODUCTION_SSH_PORT=port
    TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE=/absolute/path/to/private-key
    TAMAMIZU_PRODUCTION_KNOWN_HOSTS=/absolute/path/to/known_hosts
    TAMAMIZU_PRODUCTION_API_ROOT=/absolute/path/to/deployed/api

If the SSH account's bare `php` CLI is older than PHP 8.1, set the optional
local-only selector to one of the explicitly allowlisted commands after a
read-only version probe confirms it exists:

    TAMAMIZU_PRODUCTION_PHP_COMMAND=php8.1

The runner permits only `php`, `php8.1`, `php8.2`, `php8.3`, or `php8.4`; it
never accepts an arbitrary command. Omit the variable only when bare `php` is
already PHP 8.1 or newer.

After the owner has approved and performed the Production upload, run:

    npm run production:release-integrity
    npm run production:preflight

## Explicit boundaries

- Do not add the private key to GitHub Actions, repository variables, or
  repository secrets. That would be a Production secret change and requires
  the owner's separate explicit approval.
- Do not use these runners for migrations, database access, file upload,
  deployment, or arbitrary commands.
- The remote ops scripts, their manifest, and the required src/ directory
  must already be present in the deployed API release. Uploading or changing
  Production files is a separate deployment action and is not performed by
  these runners.
- The committed ops/.htaccess denies every HTTP request to the CLI-only
  scripts. Verify that denial after an approved upload; never browse a
  readiness-check response.
- Successful results are only redacted checks. They are not authorization to
  perform an actual Magic Link test, Paddle Live operation, database write,
  DNS change, or production-secret change.

## Why this is local-only

The runners intentionally have no GitHub Actions workflow. A hosted workflow
would require storing an SSH private key as a Production secret and would turn
a human-controlled access path into unattended remote access. Keep this first
gate local, fixed-command, and read-only.
