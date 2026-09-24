# Security Policy

## Reporting a vulnerability

Please do **not** open a public GitHub issue for a suspected security vulnerability.

Use GitHub's **Private vulnerability reporting** for this repository instead:

1. Open the repository's **Security and quality** tab.
2. Open **Advisories**.
3. Choose **Report a vulnerability** and submit the report privately.

Please include, where possible:

- a clear description of the issue;
- the affected page, endpoint, or feature;
- reproduction steps or a minimal proof of concept;
- the security impact you believe is possible;
- browser / operating system details when relevant;
- whether the issue appears to affect Production.

Do not include real credentials, recovery codes, payment secrets, private user data, or other sensitive information that is not necessary to demonstrate the issue.

## Scope

Security reports may include the Tamamizu PWA, authentication/session handling, purchase/entitlement handling, server endpoints, build/deployment workflows, dependency/supply-chain issues, and security-sensitive configuration committed to this repository.

For infrastructure-only issues involving DNS, hosting/CDN headers, or the public website outside this repository, include enough context to identify the affected hostname or service so the report can be routed correctly.

## Response

Reports will be reviewed before public disclosure. A fix may require coordination across the application, hosting, or third-party service configuration depending on the issue.

This policy does not create a bug-bounty program or promise a reward.
