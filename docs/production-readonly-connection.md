# Production read-only connection

This repository provides a deliberately narrow SSH runner for the first
Production Server Human Gate. It can run exactly one remote command:

    php server/ops/auth-readiness-check.php

The command reads the deployed configuration only to print three booleans:

- whether web-cookie auth is enabled;
- whether the production Magic Link mailer is completely configured; and
- whether the development harness is enabled.

It does **not** print configuration values, source files, database rows,
tokens, email addresses, or secrets. It does not execute SQL, write files,
change configuration, send email, or contact Paddle.

## Human setup: one-time SSH access

XServer requires SSH to be enabled and a public key to be registered in the
Server Panel. This is an account-access action, not a payment action. The
private key must remain in a user-managed secure location; never commit it,
put it in a GitHub Action secret, paste it into chat, or upload it to the
repository.

Use a dedicated key solely for this read-only preflight. The server account
must point at the app deployment directory. Confirm the SSH host key through
a trusted XServer source before adding it to a local known-hosts file. The
runner refuses unknown or changed host keys.

Set these local environment variables only in the secure execution
environment:

    TAMAMIZU_PRODUCTION_SSH_TARGET=account@host
    TAMAMIZU_PRODUCTION_SSH_PORT=port
    TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE=/absolute/path/to/private-key
    TAMAMIZU_PRODUCTION_KNOWN_HOSTS=/absolute/path/to/known_hosts
    TAMAMIZU_PRODUCTION_APP_ROOT=/absolute/path/to/deployed/kana-game

Then run:

    npm run production:preflight

## Explicit boundaries

- Do not add the private key to GitHub Actions, repository variables, or
  repository secrets. That would be a Production secret change and requires
  the owner's separate explicit approval.
- Do not use this runner for migrations, database access, file upload,
  deployment, or arbitrary commands.
- The remote `server/ops/auth-readiness-check.php` file must already be
  present in the deployed release. Uploading or changing Production files is
  a separate deployment action and is not performed by this runner.
- A successful result is only a redacted configuration check. It is not an
  authorization to perform an actual Magic Link test, Paddle Live operation,
  database write, DNS change, or production-secret change.

## Why this is local-only

The runner intentionally has no GitHub Actions workflow. A hosted workflow
would require storing an SSH private key as a Production secret and would
turn a human-controlled access path into unattended remote access. Keep this
first gate local, fixed-command, and read-only.
