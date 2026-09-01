# docs/

Repository documentation is split into **current guidance** and **historical evidence** so coding agents do not mistake old session notes or migration plans for current product truth.

For day-to-day development, start with [`CLAUDE.md`](../CLAUDE.md) or [`AGENTS.md`](../AGENTS.md). Read deeper docs only when the current task needs them.

## Current guidance

- **[ai-development-loop.md](./ai-development-loop.md)** — shared ChatGPT / Claude Code / Codex development and review workflow.
- **[definition-of-done.md](./definition-of-done.md)** — Builder completion criteria and verification expectations.
- **[global-ai-development-charter.md](./global-ai-development-charter.md)** — project-independent AI development principles.
- **[claude-reference.md](./claude-reference.md)** — deeper KanaGame repository reference; read only relevant sections.
- **[curriculum-extensibility.md](./curriculum-extensibility.md)** — curriculum data-model design and implementation history. Current accepted decisions and code/tests outrank older narrative inside the document.
- **[audio-provider-interface.md](./audio-provider-interface.md)** — implemented `SpeechProvider` architecture.
- **[tamamizu-guide-scripts.md](./tamamizu-guide-scripts.md)** — approved guide copy / visual direction where still applicable.
- **[restaurant-audio-manifest.csv](./restaurant-audio-manifest.csv)** — restaurant audio asset manifest.

## Historical evidence

[`history/`](./history/) contains dated session reports, old review notes, release-audit records, and superseded implementation plans/specs. These files are useful for provenance and understanding why decisions were made, but they are **not current product or architecture authority**.

When historical material conflicts with current accepted behavior, use the source-of-truth order in [`ai-development-loop.md`](./ai-development-loop.md): current user decision / accepted task spec first, then current code/tests and recent repository evidence, with historical narrative last.
