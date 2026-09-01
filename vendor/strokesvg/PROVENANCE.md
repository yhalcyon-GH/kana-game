# Vendored strokesvg source (current-curriculum full-kana expansion)

- Upstream repo: [`zhengkyl/strokesvg`](https://github.com/zhengkyl/strokesvg)
- Pinned commit: `e4c2c91034e03c9c2f4e95f14f2361a948f52cd0`
- The vendored kana SVGs are Klee One-derived, licensed under the SIL Open
  Font License; see `LICENSE` in this directory (copied from the pinned
  commit, with one line's trailing whitespace trimmed to satisfy this repo's
  whitespace check — no other change) for the full text and notice.

## What's vendored here

Every pinned upstream `/dist/hiragana/*.svg` and `/dist/katakana/*.svg` SVG
needed by a current single-glyph `CHARACTERS` entry (Issue #129), plus the
pinned upstream `LICENSE`. They live under `kana-svgs/` here, not `dist/` —
this repo's `.gitignore` has a generic (non-root-anchored) `dist` rule for
build output that would otherwise silently swallow these files; the content
is otherwise an unmodified copy of upstream's `/dist/hiragana/*.svg` and
`/dist/katakana/*.svg`.

`kana-svgs/hiragana/` holds 71 files and `kana-svgs/katakana/` holds 72 files
(143 total) — one per current single-glyph `CHARACTERS` id, excluding
`sokuon`/`katakana-sokuon` (generated derivatives, see below) and every
multi-glyph yōon / Special Katakana id (composed at render time instead, see
`src/lib/tracingUnits.ts`). `scripts/convertStrokesvg.ts`'s `DIRECT_GLYPHS`
derives each id's exact source path mechanically from `CHARACTERS`, rather
than this file (or any other manifest) hand-listing every filename — that
mapping, not this doc, is the source of truth for which files are required;
`scripts/convertStrokesvg.ts --check` fails loudly if a required file is
missing.

The original Phase 1A prototype (Issue #122) vendored only six representative
glyphs (あ/き/ず/ア/シ/ツ); that set is now a subset of the full vendor set
above.

## Generated derivatives: sokuon / katakana-sokuon (Phase 1B, Issue #126)

Pinned strokesvg has no dedicated `っ` / `ッ` (small-tsu / 促音) glyph.
KanaGame's `sokuon` and `katakana-sokuon` `STROKE_GLYPHS` entries are
**generated derivatives** of `hiragana/つ.svg` and `katakana/ツ.svg` above:
`scripts/convertStrokesvg.ts` applies one documented glyph-level affine
transform (uniform scale + translation, no new geometry) to each pinned
glyph's parsed logical-stroke data, producing the small-glyph placement.

This is Option A from the Issue #125 evidence spike, confirmed there as
safe: contour topology matches 1:1 for both pairs, a near-uniform-scale
best-fit transform leaves small residual error relative to the actual Klee
One small glyph outlines, and a visual overlay showed near-total overlap.
See `scripts/convertStrokesvg.ts`'s `DERIVED_SMALL_TSU_GLYPHS` for the fitted
transform constants (refit directly in strokesvg's `0 0 1024 1024`, y-down
coordinate space — the font-space constants from the spike are not reused
verbatim) and the full derivation method. No hand-authored centerline data
is used for these two ids.

## What's intentionally not vendored/generated here

Multi-glyph yōon / Special Katakana characterIds (`kana` length 2, e.g.
`kya` -> きゃ) have no direct `STROKE_GLYPHS` entry of their own — they
continue to compose their base consonant glyph + a reused full-size small-
vowel glyph at render time (`src/lib/tracingUnits.ts`'s `buildTracingUnit`),
unchanged by this expansion.

The legacy KanjiVG-derived `src/data/strokes.ts` (`STROKE_PATHS`) and
`scripts/fetchStrokeData.ts` generator have been removed (Issue #142) now
that full current-curriculum coverage from this vendor set is proven (this
task's `STROKE_GLYPHS` inventory-coverage test provides that proof for
current single-glyph ids). `StrokeOrderAnimation` renders a safe empty guide
for any id with no `STROKE_GLYPHS` entry.

## Regenerating runtime data from these files

Run:

```bash
npx tsx scripts/convertStrokesvg.ts
```

This reads the vendored SVGs above and writes `src/data/strokeGlyphs.ts`.
It does not fetch anything from the network — vendored files are the only
input.

To check (without writing) whether the committed `src/data/strokeGlyphs.ts`
is stale relative to the vendored SVGs, `CHARACTERS`, and the converter's
fitted transform constants — e.g. as part of `npm run verify` — run:

```bash
npx tsx scripts/convertStrokesvg.ts --check
```

This exits non-zero and leaves the working tree untouched if the generated
output would differ from what's committed.
