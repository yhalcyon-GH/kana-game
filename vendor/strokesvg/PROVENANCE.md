# Vendored strokesvg source (Phase 1A prototype + Phase 1B small-tsu)

- Upstream repo: [`zhengkyl/strokesvg`](https://github.com/zhengkyl/strokesvg)
- Pinned commit: `e4c2c91034e03c9c2f4e95f14f2361a948f52cd0`
- The vendored kana SVGs are Klee One-derived, licensed under the SIL Open
  Font License; see `LICENSE` in this directory (copied from the pinned
  commit, with one line's trailing whitespace trimmed to satisfy this repo's
  whitespace check — no other change) for the full text and notice.

## What's vendored here

The six upstream `/dist` SVGs needed for the Phase 1A prototype (see Issue
#122), plus `hiragana/つ.svg` added in Phase 1B (see Issue #126), plus the
pinned upstream `LICENSE`. They live under `kana-svgs/` here, not `dist/` —
this repo's `.gitignore` has a generic (non-root-anchored) `dist` rule for
build output that would otherwise silently swallow these files; the content
is otherwise an unmodified copy of upstream's `/dist/hiragana/*.svg` and
`/dist/katakana/*.svg`:

- `kana-svgs/hiragana/あ.svg`
- `kana-svgs/hiragana/き.svg`
- `kana-svgs/hiragana/つ.svg`
- `kana-svgs/hiragana/ず.svg`
- `kana-svgs/katakana/ア.svg`
- `kana-svgs/katakana/シ.svg`
- `kana-svgs/katakana/ツ.svg`

This is a deliberately partial vendor set for the prototype phase. Full-kana
expansion (vendoring the remaining `/dist` SVGs and generating runtime data
for every character) is out of scope for this task and tracked separately.

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

## Regenerating runtime data from these files

Run:

```bash
npx tsx scripts/convertStrokesvg.ts
```

This reads the vendored SVGs above and writes `src/data/strokeGlyphs.ts`.
It does not fetch anything from the network — vendored files are the only
input.

To check (without writing) whether the committed `src/data/strokeGlyphs.ts`
is stale relative to the vendored SVGs and the converter's fitted transform
constants — e.g. as part of `npm run verify` — run:

```bash
npx tsx scripts/convertStrokesvg.ts --check
```

This exits non-zero and leaves the working tree untouched if the generated
output would differ from what's committed.
