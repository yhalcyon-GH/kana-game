# Ephemeral authentication and purchase-intent retention

This document defines the repository-side cleanup policy for Security Audit v1
follow-up #348. It is an operational/data-minimization policy, not authority to
mutate Production.

## Scope

The cleanup is intentionally limited to short-lived rows whose security or
purchase-attribution purpose has already ended:

| Table | Eligible only when | Grace period |
| --- | --- | ---: |
| `magic_link_tokens` | expired, or already used | 30 days |
| `email_login_challenges` | expired, used, or invalidated | 30 days |
| `sessions` | expired or revoked | 30 days |
| `persistent_sessions` | expired or revoked **and no `sessions` row still references it** | 30 days |
| `purchase_intents` | expired, **unconsumed**, and not referenced by `transaction_grants` | 30 days |

The 30-day grace period preserves a bounded troubleshooting window without
keeping normalized email-bearing one-time auth artifacts indefinitely.

## Explicit non-targets

The cleanup must never delete or mutate:

- `users`;
- `transaction_grants`;
- `payment_events`;
- `entitlements`;
- `pending_adjustments`;
- `paddle_reconciliation_blocks`;
- Paddle transaction/refund/dispute evidence;
- Production configuration, secrets, logs, or backups.

`rate_limits` are also outside #348. They contain keyed HMAC identifiers rather
than normalized email/IP values, and their window is reset lazily by the
existing rate-limiter code. Any separate long-horizon rate-limit-row cleanup
should be reviewed independently rather than expanding this cleanup implicitly.

## Safety properties

`EphemeralDataCleanupRepository`:

- previews the complete currently eligible count before mutation;
- deletes at most 500 rows **per table per invocation**;
- runs one batch inside a database transaction;
- deletes ordinary sessions before persistent sessions;
- re-checks the eligibility predicate in the final `DELETE`, not only during
  candidate selection;
- preserves every purchase intent referenced by `transaction_grants`;
- preserves a persistent session while any child `sessions` row still
  references it;
- never turns an expired/revoked credential back into an active credential.

SQLite tests cover the eligibility and batch rules. The disposable MariaDB
matrix separately verifies real foreign-key behavior on MariaDB 10.5 and 10.11.

## Operator CLI

The operator-only entrypoint is:

    php ops/ephemeral-data-cleanup.php --check

`--check` is read-only and prints only counts.

Mutation requires the exact explicit guard:

    php ops/ephemeral-data-cleanup.php --apply --human-approved-ephemeral-cleanup

One invocation performs one bounded batch and prints deleted and remaining
counts. If `moreEligible=true`, a later approved invocation may process
another batch. Do not replace the bounded behavior with an unbounded delete
loop.

The `ops/` HTTP deny rule remains required. The CLI additionally refuses
non-CLI execution.

## Production Human Gate

Merging this repository code does **not** enable cleanup in Production.

Before the first Production cleanup:

1. obtain explicit human approval for the Production DB write;
2. take the normal fresh DB rollback backup;
3. stage/deploy the reviewed cleanup CLI and matching repository code under the
   existing Production deployment rules;
4. run `--check` first and review counts;
5. run guarded `--apply` only under the same explicit approval;
6. run `--check` again and record the remaining counts.

Creating a host cron/scheduler is a separate Production configuration Human
Gate. Do not create one merely because this code exists.

## Privacy wording

The current public Privacy Policy says Tamamizu keeps account and purchase
access information only while needed for service operation, refunds/disputes,
fraud prevention, and legal/record-keeping obligations. This cleanup makes the
short-lived auth/purchase-intent behavior more data-minimizing and remains
consistent with that criterion-based wording.

Do not add a public promise of an exact 30-day retention period merely because
this repository code merged. Public legal/privacy wording changes remain a
human legal-approval gate. If Production cleanup is activated and an exact
public schedule is later desired, update the public policy only after that
separate review.
