# Vendored strokesvg source (Phase 1A prototype)

- Upstream repo: [`zhengkyl/strokesvg`](https://github.com/zhengkyl/strokesvg)
- Pinned commit: `e4c2c91034e03c9c2f4e95f14f2361a948f52cd0`
- The vendored kana SVGs are Klee One-derived, licensed under the SIL Open
  Font License; see `LICENSE` in this directory (copied from the pinned
  commit, with one line's trailing whitespace trimmed to satisfy this repo's
  whitespace check — no other change) for the full text and notice.

## What's vendored here

Only the six upstream `/dist` SVGs needed for the Phase 1A prototype (see
Issue #122), plus the pinned upstream `LICENSE`. They live under
`kana-svgs/` here, not `dist/` — this repo's `.gitignore` has a generic
(non-root-anchored) `dist` rule for build output that would otherwise
silently swallow these files; the content is otherwise an unmodified copy
of upstream's `/dist/hiragana/*.svg` and `/dist/katakana/*.svg`:

- `kana-svgs/hiragana/あ.svg`
- `kana-svgs/hiragana/き.svg`
- `kana-svgs/hiragana/ず.svg`
- `kana-svgs/katakana/ア.svg`
- `kana-svgs/katakana/シ.svg`
- `kana-svgs/katakana/ツ.svg`

This is a deliberately partial vendor set for the prototype phase. Full-kana
expansion (vendoring the remaining `/dist` SVGs and generating runtime data
for every character) is out of scope for this task and tracked separately.

## Regenerating runtime data from these files

Run:

```bash
npx tsx scripts/convertStrokesvg.ts
```

This reads the vendored SVGs above and writes `src/data/strokeGlyphs.ts`.
It does not fetch anything from the network — vendored files are the only
input.
