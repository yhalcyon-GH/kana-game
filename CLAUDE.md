# CLAUDE.md

Guidance for Claude Code sessions in this repository. Keep this file short: it contains only the information that should influence most non-trivial tasks. Read deeper docs only when the task requires them.

## What this is

`kana-game` is a React/TypeScript kana-learning web app with local-only progress persistence. It teaches kana by row, vocabulary, graded mini-games, and tracing.

Current curriculum categories are hiragana, katakana, sokuon, chōon, yōon, and Special Katakana (特殊音, `SPECIAL_KATAKANA_CATEGORY_ID` in `src/data/curriculum.ts`). It was removed once and later reintroduced as its own category; treat it as current, supported content.

Deployment: GitHub Pages from `main`; Vite base path is `/kana-game/`.

## Commands

```bash
npm run dev
npm test
npm run lint
npm run build
```

`npm run build` runs TypeScript checking (`tsc -b`) and is the authoritative type check. There is no separate `typecheck` script.

Before considering data/logic changes complete, run the relevant focused tests and, when practical, `npm run verify` (runs test + lint + build + `git diff --check` in one step).

## Standard task loop

For a non-trivial task, use the `/kana-task` Skill (`.claude/skills/kana-task/SKILL.md`): Explore → Plan → Implement → Verify → Inspect → Fix → Commit → Push → PR, from just a Goal and Acceptance Criteria. See `docs/ai-development-loop.md` for the full loop and `docs/definition-of-done.md` for what "done" means.

## Architecture boundaries

- `src/data/` — static curriculum/content and pure lookup data.
- `src/lib/` — framework-agnostic logic.
- `src/hooks/` — React state glue and shared game/session behavior.
- `src/components/` — mostly presentational/small interaction components.
- `src/routes/` — page-level screens and games.
- `src/store/progressStore.ts` — the single Zustand progress/settings store; persisted to `localStorage`.
- `scripts/` — offline/manual generation tools; runtime code must not depend on them.
- `public/audio/` — checked-in static runtime audio.

`useCurriculum()` is the single place that should combine static curriculum data with live progress to answer what is currently usable. Do not recreate that combination independently in new screens.

## Curriculum rules

`ScriptCategory`/`categoryId` defines category scope. `learnStyle` defines lesson/game behavior:

- `character-set`: hiragana, katakana, yōon
- `contrast-pairs`: sokuon, chōon

When behavior depends on lesson shape, branch on `learnStyle`, not a specific category id.

Category dependencies are explicit through `dependsOnCategoryIds`; never infer dependencies from category order.

`src/data/curriculum.test.ts` enforces key content invariants. New vocabulary/rows should preserve them rather than bypassing the tests.

Yōon is multi-glyph/one-mora. Pitch-accent code already handles mora boundaries, but the stroke generator is unsafe for multi-glyph ids. **Do not run `scripts/fetchStrokeData.ts` for yōon or future multi-glyph character ids.**

Chōon rows may have `characterIds: []`; do not assume every row introduces characters.

## Product-behavior guardrails

Do not silently change any of the following without explicit confirmation:

- game rules;
- answer-correctness behavior;
- SRS/review/unlock thresholds;
- feedback/reaction behavior;
- deliberately removed curriculum content.

Prefer small, independently testable changes over broad refactors, especially around `src/data/`, `src/store/`, answer checking, SRS, and Review logic.

Do not guess Japanese pitch accent or pronunciation from memory. Use the repository's data/generation pipeline or ask.

Do not regenerate paid/external audio speculatively. Audio generation can cost money and produces git-visible files.

## Learning loop

Project-specific reusable lessons live in `Learnings.md`. Use relevant learnings as evidence, not rigid rules. Current code, tests, and explicit user instructions override stale learnings.

Detailed learning workflow is defined in `.claude/rules/learnings.md` and the project skills `/update-learnings` and `/consolidate-learnings`.

## Read deeper only when relevant

Use `docs/claude-reference.md` for detailed repository behavior, including:

- full game/navigation flow;
- curriculum data-model details and category exceptions;
- yōon/mora/stroke edge cases;
- audio architecture and generation rules;
- recipes for adding words/rows/categories;
- known gaps and stale-content risks.

Other focused docs are indexed in `docs/README.md`. In particular:

- `docs/curriculum-extensibility.md` — category design/history.
- `docs/audio-provider-interface.md` — audio provider abstraction.

When narrative docs and current code/tests disagree, treat the code/tests as stronger evidence and update stale documentation when relevant.
