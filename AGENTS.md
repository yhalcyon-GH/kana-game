# AGENTS.md

This is the thin Codex adapter for KanaGame. Shared workflow, source-of-truth
order, autonomous handoff gates, verification hierarchy, and merge policy live
in [`docs/ai-development-loop.md`](docs/ai-development-loop.md).

Apply the concise repository contract in [`CLAUDE.md`](CLAUDE.md), and read
[`docs/definition-of-done.md`](docs/definition-of-done.md) for completion
criteria. For non-trivial work, use the shared loop: refresh the live base,
preserve unrelated work, inspect narrowly, implement minimally, verify, review
the full diff, commit, push, and open one normal non-Draft PR. Do not merge
unless the user explicitly instructs you to merge the current PR. When
explicitly instructed, confirm the live PR HEAD, mergeability, required
exact-HEAD CI, and applicable review gates before merging.

Codex-specific adapter: do not require Claude commands or mechanics; use the
same repository paths, commands, escalation rules, and review gates directly.
