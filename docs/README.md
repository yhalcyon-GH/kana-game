# docs/

Repository documentation is split into **current guidance** and **historical evidence** so coding agents do not mistake old session notes or migration plans for current product truth.

For day-to-day development, start with [`CLAUDE.md`](../CLAUDE.md) or [`AGENTS.md`](../AGENTS.md). Read deeper docs only when the current task needs them.

## Current guidance

- **[ai-development-loop.md](./ai-development-loop.md)** — shared ChatGPT / Claude Code / Codex development and review workflow.
- **[resume-protocol.md](./resume-protocol.md)** — timeout-safe, GitHub-first resume and checkpoint protocol; start a new Work session here.
- **[autonomous-operations.md](./autonomous-operations.md)** — autonomous/overnight AI operating protocol: source of truth, roles, the multi-task autonomous execution loop, Stop/Human Gates, "Overnight mode", priority/severity, review/merge standard, and recovery.
- **[operational-gates.md](./operational-gates.md)** — canonical Cost Gate and Human fast-path policy for paid services/APIs, automation, infrastructure choices, and when to ask for a small human action early.
- **[definition-of-done.md](./definition-of-done.md)** — Builder completion criteria and verification expectations.
- **[global-ai-development-charter.md](./global-ai-development-charter.md)** — project-independent AI development principles.
- **[claude-reference.md](./claude-reference.md)** — deeper KanaGame repository reference; read only relevant sections.
- **[curriculum-extensibility.md](./curriculum-extensibility.md)** — curriculum data-model design and implementation history. Current accepted decisions and code/tests outrank older narrative inside the document.
- **[audio-provider-interface.md](./audio-provider-interface.md)** — implemented `SpeechProvider` architecture.
- **[pitch-accent-provenance.md](./pitch-accent-provenance.md)** — pitch-accent data source, resolution method, and the 2026-09 commercial-release audit.
- **[analytics-foundation.md](./analytics-foundation.md)** — provider-neutral analytics/feedback abstraction; what's instrumented, and what connecting a real provider later requires.
- **[feedback-analytics-provider-decision.md](./feedback-analytics-provider-decision.md)** — Tally vs. Formspree and Umami vs. PostHog/Plausible comparison, decision, and disclosed trade-offs (dated; re-verify pricing/terms if read much later).
- **[feedback-setup.md](./feedback-setup.md)** — step-by-step Tally account/form setup and `VITE_FEEDBACK_URL` activation guide for a human operator.
- **[paddle-sandbox-checkout.md](./paddle-sandbox-checkout.md)** — development-only Paddle Checkout PoC setup and human Sandbox payment verification.
- **[paddle-webhook-poc.md](./paddle-webhook-poc.md)** — Phase 2 PoC: PHP/MySQL server-side webhook signature verification and entitlement storage, Xserver deployment, Paddle Sandbox webhook setup, and human end-to-end verification.
- **[paddle-auth-phase3a-pr-a.md](./paddle-auth-phase3a-pr-a.md)** — Phase 3A PR A: real-user identity + Magic Link auth foundation (users, sessions, rate limiting, CORS preflight); not yet deployed.
- **[paddle-auth-phase3a-pr-b.md](./paddle-auth-phase3a-pr-b.md)** — Phase 3A PR B: secure purchase attribution (purchase_ref, transaction_grants, out-of-order webhook reconciliation, refund lifecycle); not yet deployed.
- **[paddle-auth-phase3a-pr-c.md](./paddle-auth-phase3a-pr-c.md)** — Phase 3A PR C: dev-only end-to-end auth/purchase harness (`/account-test`, `/verify`, dev-only Magic Link retrieval); not yet deployed.
- **[paddle-customer-portal-audit.md](./paddle-customer-portal-audit.md)** — audit confirming this repository has no Paddle customer-portal link/config/API integration; an authenticated portal-session feature would require a new Production Paddle API key and is a Human Gate, not implemented.
- **[observability.md](./observability.md)** — minimal pre-Live error-log tags for the Paddle webhook, auth, and entitlement endpoints: what each tag means, severity, and where the real Xserver `error_log` destination still needs confirming.
- **[security/ephemeral-data-retention.md](./security/ephemeral-data-retention.md)** — #348 retention policy and guarded cleanup runbook for short-lived auth/session/purchase-intent rows; Production mutation/cron remains a Human Gate.
- **[pre-live-launch-checklist.md](./pre-live-launch-checklist.md)** — human-facing Sandbox→Live/Production cutover checklist; separates AI-verifiable items from human-only and real Paddle-Live-money operations. No secrets recorded.
- **[final-legal-readiness-audit-2026-09-20.md](./final-legal-readiness-audit-2026-09-20.md)** — dated AI-assisted final legal-readiness audit; records factual copy fixes and the exact operator/legal decisions still requiring human approval.
- **[final-human-gates-runbook.md](./final-human-gates-runbook.md)** — shortest remaining human path: redacted Production CORS probe, XServer error-log/retention check, final legal decisions, and GO/NO-GO criteria.
- **[pwa-installability-qa.md](./pwa-installability-qa.md)** — PWA manifest/service-worker/icon-path audit and the Android Chrome + iPhone Safari real-device home-screen install QA checklist; final icon/logo branding remains a Human Gate.
- **[pwa-update-flow.md](./pwa-update-flow.md)** — expected Production PWA update behavior (build-id display, update-available prompt, what an update does/doesn't touch); read before telling a learner to uninstall/clear storage for a routine update.
- **[tamamizu-guide-scripts.md](./tamamizu-guide-scripts.md)** — approved guide copy / visual direction where still applicable.
- **[restaurant-audio-manifest.csv](./restaurant-audio-manifest.csv)** — restaurant audio asset manifest.

## Historical evidence

[`history/`](./history/) contains dated session reports, old review notes, release-audit records, and superseded implementation plans/specs. These files are useful for provenance and understanding why decisions were made, but they are **not current product or architecture authority**.

When historical material conflicts with current accepted behavior, use the source-of-truth order in [`ai-development-loop.md`](./ai-development-loop.md): current user decision / accepted task spec first, then current code/tests and recent repository evidence, with historical narrative last.
