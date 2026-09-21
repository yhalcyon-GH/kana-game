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

## Execution-efficiency gate and Human fast-path

Do **not** optimize for "AI does everything." Optimize for the shortest reliable
path to completion while preserving safety, auditability, and user control.

Before starting a non-trivial tool-heavy workaround, compare the AI route with a
small human action on:

- expected total completion time, including debugging and retries;
- reliability and reversibility;
- whether the AI route depends on unavailable local credentials, local GUI
  state, browser state, hardware, or host-specific controls;
- human effort required by the manual route;
- whether automation will be reused, or is only being built for a one-off
  operation.

Prefer the Human fast-path **early**, even when an AI workaround is technically
possible, when the human action is safe and materially simpler. Typical examples
include checking or changing one visible setting, changing one file/folder
permission, choosing one item in an admin panel, confirming one value, or
performing a small local action that depends on credentials/devices unavailable
to the AI.

Do not build bespoke scripts, browser automation, deployment machinery, or
multi-step recovery code merely to avoid a safe one-to-three-step human action
that is likely to take only a few minutes.

### Retry budget

At any single execution boundary:

- if the first AI failure reveals that a simple human route is clearly faster,
  switch immediately to the Human fast-path;
- after **two failed AI attempts at the same boundary**, stop creating further
  workaround variants and explicitly reassess the human route;
- if a safe human action can likely resolve the boundary in about five minutes
  or less, request that action instead of attempting a third AI workaround;
- only continue AI-side retries when the human route is materially difficult,
  risky, destructive, unavailable, or would violate an existing Human Gate.

The retry budget is a ceiling, not a target: do not wait for two failures when
the manual route is obviously better from the start.

When requesting human work, make it minimal and operational: state exactly what
to click/run/change, the expected observable result, what **not** to touch, and
what the AI will verify or continue immediately afterward.

A permission denial, security guardrail, or Human Gate is not a tool limitation.
Do not reframe a denied AI action as a request for the human to bypass the same
guardrail. Surface the policy/permission decision explicitly instead.

Visible GUI/browser automation is not a substitute for the Human fast-path when
it would disrupt the user's desktop workflow. Follow the user's GUI-permission
preference before opening or focusing visible interfaces.

## Decision order

When choosing an execution route:

1. Check safety and existing Human Gates.
2. Check incremental cost and apply the Cost Gate before implementation.
3. Compare AI and human routes using the execution-efficiency gate.
4. Prefer a reliable free/already-paid route when it is fit for purpose.
5. Use AI execution when it is efficient, robust, and does not require a
   needlessly complex one-off workaround.
6. Use the Human fast-path early when it materially reduces total completion
   time or avoids a fragile route; enforce the retry budget above.
7. Record durable decisions in GitHub rather than relying on chat memory.
