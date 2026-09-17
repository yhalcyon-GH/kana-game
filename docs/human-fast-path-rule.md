# Human fast-path rule

Prefer autonomous AI execution by default, but do not waste substantial time on avoidable agent/tool workarounds.

Ask the human to perform a bounded manual step when all of the following are true:

- the AI path is blocked, repeatedly failing, or requires a brittle workaround;
- the human can complete the step directly and safely with clear instructions;
- human intervention is expected to reduce total completion time substantially, not merely save a small amount of agent time; and
- the step is not something the AI can finish reliably in roughly the same time without added risk.

When this rule applies, stop retrying equivalent AI workarounds, explain the exact blocker, give the smallest concrete human action needed, and resume autonomous execution immediately after the result is available.

Do not escalate to the human just for convenience. Prefer AI completion when the time difference is minor, when the human step is error-prone, or when the task can continue productively through another safe AI path.

This rule does not weaken existing Human Gates. Money, Production writes, secrets, DNS, Paddle Live, KYC/legal decisions, and other protected operations still require the explicit approvals defined elsewhere.
