# Word icon provenance

Backups/sources for the vocabulary illustrations shipped at `public/word-icons/<word-id>.webp`. Kept for provenance only — nothing here is read by the app at runtime (see `CLAUDE.md`'s `design/` note).

- **`hiragana/`** — original hand-sourced/paid icons for all 89 hiragana words.
- **`katakana-gemini-review/`** — 109 Gemini (`gemini-2.5-flash-image`) icons generated for katakana/そくおん/ちょうおん/拗音, plus `review.html`, the gallery used to review the batch before wiring it in. Two of these (`youon-ha-byouki`, `youon-katakana-cha-na-chokoreeto`) were superseded later by the ChatGPT batches below; the rest are still what's live for katakana/そくおん.
- **`katakana-chatgpt/`** — 11 katakana icons the user sourced via ChatGPT (`source-sheet.png`) to replace their first-pass Gemini equivalents.
- **`youon-chatgpt/`** — all 60 拗音 icons, cropped from six ChatGPT-generated reference sheets (`source-sheet-1.png`–`source-sheet-6.png`).
- **`chouon-chatgpt/`** — the final 7 ちょうおん icons (`source-sheet.png`), completing image coverage for all 261 words.
- **`chatgpt-round2/`** — a second ChatGPT-sourced pass (5 more reference sheets) that re-did 51 words across katakana ma/ha/ra-row, sokuon, and both chōon batches, plus トカゲ/ぎょうざ re-cropped from their original sheets. Source sheets included. This pass is also where a real pipeline bug got found and fixed: some of these sheets have a genuinely transparent PNG background rather than white, which broke the row/column ink-scan used to find crop boundaries (a transparent pixel reads as solid black to an RGB-only check) — see the "Re-crop 55 word icons" commit for the fix.

`pending-review/` (gitignored, created on demand) is where `scripts/generateWordIcons.mjs` writes a fresh batch for review before it gets a permanent named folder here.
