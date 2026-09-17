# Operational Gates

This document is the canonical policy for two cross-cutting execution gates: cost approval and human fast-path escalation. These gates apply before choosing or changing development infrastructure, external services, APIs, automation, or execution routes.

## Cost Gate

Before adopting or enabling a new API, hosted service, automation platform, paid model, paid resource, or infrastructure dependency, determine and report:

- whether it can incur any additional charge beyond services the user already pays for;
- whether pricing is fixed, subscription, prepaid, usage-based, or a combination;
- what action actually starts billing;
- whether a genuinely free path exists for the intended workload;
- what spending limits, hard stops, alerts, auto-recharge settings, and cancellation/disable controls exist;
- the practical free or already-paid alternatives and their trade-offs.

If any additional charge can occur, stop before implementation, activation, secret creation, purchase, or billable API use and obtain explicit human approval. Do not treat creation of an account, API key, billing profile, secret, or workflow as harmless setup when it is part of a path that can later trigger charges without another explicit approval.

The default preference is an already-paid or free solution when it satisfies the requirement without a material loss of safety or effectiveness. Automation is not a goal by itself; do not add a paid dependency merely to remove a small amount of manual work.

If pricing or billing behavior is unclear, treat the path as potentially paid until verified. Never assume a user will receive a confirmation dialog before usage charges begin.

Existing Human Gates remain stricter where applicable: real charges/refunds, Paddle Live mutations, paid resources, Production writes, DNS changes, Production secret changes, KYC, and final legal decisions still require explicit approval.

## Human fast-path

AI-first execution remains the default. Ask the human to perform a small action early only when all of the following are true:

- the AI route is blocked by a genuine tool/capability limitation, is repeatedly failing, or requires a brittle workaround;
- the requested human action is safe, reversible, and permitted by policy;
- the human can complete it substantially faster than continued AI workaround attempts;
- the request is narrowly scoped and includes exact steps plus what the AI will do immediately afterward.

A permission denial, security guardrail, or Human Gate is not a tool limitation. Do not reframe a denied AI action as a request for the human to bypass the same guardrail. Surface the policy/permission decision explicitly instead.

Do not interrupt the human merely because manual work is marginally faster. Use this fast-path only when it materially reduces total completion time or avoids a fragile execution path.

## Decision order

When choosing an execution route:

1. Check safety and existing Human Gates.
2. Check incremental cost and apply the Cost Gate before implementation.
3. Prefer a reliable free/already-paid route when it is fit for purpose.
4. Prefer AI execution when it is reasonably efficient and robust.
5. Use the Human fast-path when human intervention is clearly much faster and policy-safe.
6. Record durable decisions in GitHub rather than relying on chat memory.
