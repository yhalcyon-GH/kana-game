# AI Operations Policy

This policy governs AI-assisted development for Tamamizu / KanaGame.

## Control plane

GitHub is the source of truth. Normal work flows through branch → pull request → deterministic CI → review → merge. Do not change `main` directly.

## Roles and cost routing

- GitHub Actions and scripts handle deterministic checks first.
- Claude Code is the normal Builder for bounded implementation tasks.
- Codex is the independent reviewer/auditor by default, or a Builder only when Claude Code is unavailable or blocked.
- Use a second model only when the risk justifies an independent view.

| Risk | Default route |
| --- | --- |
| 0 — formatting, generated checks, routine verification | deterministic scripts/CI only |
| 1 — bounded, reversible implementation | one normal Builder session |
| 2 — cross-cutting, state, security, or payment-adjacent change | Builder plus independent review |
| 3 — consequential or hard-to-test change | targeted higher-effort review; escalate only after lower-cost evidence is insufficient |

Do not automatically invoke model review. Claude Code review remains opt-in through its exact PR marker. Record the builder, reviewer, model/effort when known, retry count, and escalation reason in the PR template; use `N/A` when no model was used.

## Non-negotiable human gates

No money without explicit human approval. Never perform or configure any of the following without it:

- real charges, refunds, Paddle Live transactions, or Paddle Live configuration;
- paid-plan or usage-billed API activation or change;
- paid runners or cloud resources;
- production database writes, production secrets, DNS, or other production configuration changes;
- final legal, pricing, currency, KYC, or Live-cutover decisions.

## Runtime AI boundary

The shipped app must not directly call an AI-provider endpoint. `npm run check:prelive` enforces `AI_REACHABLE=0` for known AI endpoints in `src/`, and verifies example/local configuration remains blank. Static audio assets and opt-in GitHub AI workflows are outside that runtime boundary.
