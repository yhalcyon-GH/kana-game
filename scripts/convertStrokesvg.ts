// Converts vendored strokesvg SVGs (see vendor/strokesvg/PROVENANCE.md) into
// runtime StrokeGlyph data for the stroke-order animation (Phase 1A
// prototype — see Issue #122). Run whenever the vendored SVG set changes:
//   npx tsx scripts/convertStrokesvg.ts
//
// This is a build-time/generation-time step only. It reads exclusively from
// vendor/strokesvg/ and never touches the network — the normal app build
// must not fetch strokesvg source.
import { JSDOM } from 'jsdom'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// "kana-svgs", not upstream's own "dist" directory name — this repo's
// .gitignore has a generic (non-root-anchored) `dist` rule for build output,
// which would otherwise silently swallow these vendored SVGs.
export const VENDOR_DIR = path.resolve(import.meta.dirname, '../vendor/strokesvg/kana-svgs')
const OUT_FILE = path.resolve(import.meta.dirname, '../src/data/strokeGlyphs.ts')

// Maps this app's character ids (see src/data/characters.ts /
// src/data/strokes.ts) to the vendored strokesvg source file for that
// glyph. Prototype-scoped: only the six representative glyphs from Issue
// #122. Do not add entries here without also vendoring the corresponding
// /dist SVG (see vendor/strokesvg/PROVENANCE.md).
export const PROTOTYPE_GLYPHS: Record<string, string> = {
  a: 'hiragana/あ.svg',
  ki: 'hiragana/き.svg',
  zu: 'hiragana/ず.svg',
  'katakana-a': 'katakana/ア.svg',
  'katakana-shi': 'katakana/シ.svg',
  'katakana-tsu': 'katakana/ツ.svg',
}

// Small-tsu (促音) ids have no dedicated glyph in pinned strokesvg — Issue
// #125 confirmed (evidence spike) that deriving them from the pinned full
// つ/ツ via one glyph-level affine transform (Option A) is safe: near-
// uniform-scale best fit, contour topology matches 1:1, and residual stays
// within ~1% of glyph bbox diagonal (mean) after fitting. See Issue #126
// for the strokesvg-space refit (font-space constants can't be reused
// verbatim: strokesvg is 0 0 1024 1024, y-down, vs. the font's y-up em
// square).
//
// glyphTransform below was fit with scripts/_tmp_fitStrokesvgTransform.mjs
// (temporary analysis tool, not part of the repo) as follows:
//   1. Sample @fontsource/klee-one@5.3.0 japanese-400 outlines for the full
//      and small glyph of each pair in font space (y-up, unitsPerEm=1000).
//   2. Fit a uniform-scale+translation transform (bbox-anchored, then
//      refined by a few iterations of closest-point matching +
//      least-squares similarity solve) for font-space full->small.
//   3. Independently fit font-space full glyph -> the pinned strokesvg
//      shadow-path outline for the same full glyph, giving the font<->
//      strokesvg coordinate-system mapping.
//   4. Compose: conjugate the font-space full->small transform by that
//      coordinate mapping to obtain the equivalent transform directly in
//      strokesvg space. All three transforms are similarity transforms
//      (uniform scale + translation, no rotation), so the composition is
//      too.
// Final fitted constants (mean/max residual, % of small-glyph bbox
// diagonal, measured directly in strokesvg space against the font-space
// small glyph mapped through the same coordinate mapping):
//   つ.svg -> sokuon:          scale=0.750945 translate=(120.753, 283.883)  mean 0.78% / max 6.12%
//   ツ.svg -> katakana-sokuon: scale=0.762183 translate=(128.652, 251.783)  mean 0.65% / max 3.40%
// (max residual is dominated by a handful of thin stroke-tip sample points,
// consistent with Issue #125's qualitative "near-total overlap, mismatch
// limited mainly to thin stroke-tip slivers" finding.)
export const DERIVED_SMALL_TSU_GLYPHS: Record<
  string,
  { sourcePath: string; glyphTransform: string }
> = {
  sokuon: {
    sourcePath: 'hiragana/つ.svg',
    glyphTransform: 'translate(120.753 283.883) scale(0.750945)',
  },
  'katakana-sokuon': {
    sourcePath: 'katakana/ツ.svg',
    glyphTransform: 'translate(128.652 251.783) scale(0.762183)',
  },
}

export type StrokeGlyph = {
  viewBox: string
  strokeWidth: number
  strokeLinecap: string
  // Applies uniformly to every part's shadow (guide) geometry, clip
  // geometry, and animated stroke geometry for the whole glyph — semantically
  // distinct from each part's own optional `transform`, which is
  // stroke-path-only (see StrokeOrderAnimation.tsx and ず's existing usage).
  // Only present on derived small-tsu entries (see DERIVED_SMALL_TSU_GLYPHS).
  glyphTransform?: string
  logicalStrokes: Array<{
    parts: Array<{
      shadowD: string
      strokeD: string
      transform?: string
    }>
  }>
}

function fail(characterId: string, message: string): never {
  throw new Error(`convertStrokesvg: ${characterId}: ${message}`)
}

export function parseGlyph(characterId: string, svgText: string): StrokeGlyph {
  const dom = new JSDOM(svgText, { contentType: 'image/svg+xml' })
  const doc = dom.window.document
  const svg = doc.documentElement
  if (svg.tagName.toLowerCase() !== 'svg') {
    fail(characterId, `expected root <svg>, got <${svg.tagName}>`)
  }

  const viewBox = svg.getAttribute('viewBox')
  if (!viewBox) fail(characterId, 'missing root viewBox')

  const shadowsGroup = svg.querySelector('g[data-strokesvg="shadows"]')
  if (!shadowsGroup) fail(characterId, 'missing shadows group (g[data-strokesvg="shadows"])')
  const strokesGroup = svg.querySelector('g[data-strokesvg="strokes"]')
  if (!strokesGroup) fail(characterId, 'missing strokes group (g[data-strokesvg="strokes"])')

  const strokeStyle = strokesGroup.getAttribute('style') ?? ''
  const strokeWidthMatch = strokeStyle.match(/stroke-width:\s*([0-9.]+)/)
  if (!strokeWidthMatch) fail(characterId, 'strokes group style missing stroke-width')
  const strokeWidth = Number(strokeWidthMatch[1])

  const strokeLinecapMatch = strokeStyle.match(/stroke-linecap:\s*([a-z]+)/)
  if (!strokeLinecapMatch) fail(characterId, 'strokes group style missing stroke-linecap')
  const strokeLinecap = strokeLinecapMatch[1]

  // Shadow paths (with `id`) may sit directly under the shadows group, or be
  // wrapped in a plain <g> alongside sibling shadow paths (see ず / あ,
  // where the multi-part logical stroke's shadow paths are grouped) — the
  // grouping is purely presentational, so shadow-id lookup below walks the
  // whole shadows subtree via querySelectorAll rather than assuming a flat
  // list of direct children.
  const shadowPathsById = new Map<string, string>()
  for (const el of shadowsGroup.querySelectorAll('path[id]')) {
    const id = el.getAttribute('id')
    const d = el.getAttribute('d')
    if (!id || !d) fail(characterId, 'shadow path missing id or d')
    if (shadowPathsById.has(id)) fail(characterId, `duplicate shadow path id "${id}"`)
    shadowPathsById.set(id, d)
  }

  // clipPath[id] -> <use href="#shadowId"/> resolves each stroke part's
  // clip-path reference to the shadow path it clips against, without
  // preserving the upstream clipPath/shadow ids in runtime data.
  const clipPathToShadowId = new Map<string, string>()
  for (const clipPath of doc.querySelectorAll('defs > clipPath[id]')) {
    const clipId = clipPath.getAttribute('id')
    if (!clipId) fail(characterId, 'clipPath missing id')
    const use = clipPath.querySelector('use')
    const href = use?.getAttribute('href') ?? use?.getAttribute('xlink:href')
    if (!href || !href.startsWith('#')) {
      fail(characterId, `clipPath "${clipId}" missing a valid <use href="#...">`)
    }
    clipPathToShadowId.set(clipId, href.slice(1))
  }

  function resolvePart(pathEl: Element): { shadowD: string; strokeD: string; transform?: string } {
    const strokeD = pathEl.getAttribute('d')
    if (!strokeD) fail(characterId, 'stroke path missing d')
    const clipAttr = pathEl.getAttribute('clip-path')
    const clipMatch = clipAttr?.match(/^url\(#(.+)\)$/)
    if (!clipMatch) fail(characterId, `stroke path has unexpected clip-path attribute: ${String(clipAttr)}`)
    const clipId = clipMatch[1]
    const shadowId = clipPathToShadowId.get(clipId)
    if (!shadowId) fail(characterId, `clip-path references unknown clipPath id "${clipId}"`)
    const shadowD = shadowPathsById.get(shadowId)
    if (!shadowD) fail(characterId, `clipPath "${clipId}" resolves to unknown shadow id "${shadowId}"`)

    const transform = pathEl.getAttribute('transform')

    // Fail loudly on any attribute we don't explicitly understand, rather
    // than silently dropping it (Issue #122 requirement).
    const allowedAttrs = new Set(['d', 'clip-path', 'transform', 'style'])
    for (const attr of pathEl.getAttributeNames()) {
      if (!allowedAttrs.has(attr)) fail(characterId, `stroke path has unsupported attribute "${attr}"`)
    }

    return transform ? { shadowD, strokeD, transform } : { shadowD, strokeD }
  }

  // Each top-level child of the strokes group (one <path> per single-part
  // logical stroke, or one <g> per multi-part logical stroke) carries its
  // own animation/sequencing index as a `--i:N` custom property in `style`
  // — upstream's animator drives stroke order off this, not off document
  // order. Corpus source order happens to already match it (see the six
  // vendored SVGs), but a converter that only trusts document order would
  // silently mis-sequence a glyph whose source order and `--i` diverge
  // (or accept one with a missing/duplicate/out-of-order index) without any
  // signal — so `--i` is parsed and checked explicitly to be the exact
  // sequential run 0..n-1, matching document order 1:1, and any mismatch
  // fails loudly rather than falling back to document order silently.
  function readStrokeIndex(el: Element): number {
    const style = el.getAttribute('style') ?? ''
    const match = style.match(/--i:\s*(-?\d+)\s*(?:;|$)/)
    if (!match) fail(characterId, `top-level stroke element missing "--i" in style: ${JSON.stringify(style)}`)
    return Number(match[1])
  }

  const logicalStrokes: StrokeGlyph['logicalStrokes'] = []
  const seenIndices = new Set<number>()
  const strokeIndices: number[] = []
  for (const child of strokesGroup.children) {
    const tag = child.tagName.toLowerCase()
    const strokeIndex = readStrokeIndex(child)
    if (seenIndices.has(strokeIndex)) fail(characterId, `duplicate logical-stroke "--i:${strokeIndex}"`)
    seenIndices.add(strokeIndex)
    strokeIndices.push(strokeIndex)

    if (tag === 'path') {
      logicalStrokes.push({ parts: [resolvePart(child)] })
    } else if (tag === 'g') {
      const partEls = [...child.children]
      if (partEls.length === 0) fail(characterId, 'logical stroke group has no parts')
      if (!partEls.every((el) => el.tagName.toLowerCase() === 'path')) {
        fail(characterId, 'logical stroke group contains a non-<path> child')
      }
      logicalStrokes.push({ parts: partEls.map((el) => resolvePart(el)) })
    } else {
      fail(characterId, `unexpected top-level element <${tag}> in strokes group`)
    }
  }

  if (logicalStrokes.length === 0) fail(characterId, 'no logical strokes found')

  const expectedIndices = logicalStrokes.map((_, i) => i)
  if (strokeIndices.some((idx, i) => idx !== expectedIndices[i])) {
    fail(
      characterId,
      `logical-stroke "--i" values must be the sequential run 0..${logicalStrokes.length - 1} in document order, got [${strokeIndices.join(',')}]`,
    )
  }

  return { viewBox, strokeWidth, strokeLinecap, logicalStrokes }
}

export async function generateOutput(): Promise<string> {
  const entries: [string, StrokeGlyph][] = []
  for (const [characterId, relPath] of Object.entries(PROTOTYPE_GLYPHS)) {
    const filePath = path.join(VENDOR_DIR, relPath)
    const svgText = await readFile(filePath, 'utf-8')
    const glyph = parseGlyph(characterId, svgText)
    entries.push([characterId, glyph])
    const partCounts = glyph.logicalStrokes.map((s) => s.parts.length).join(',')
    console.log(`  ${characterId} (${relPath}): ${glyph.logicalStrokes.length} logical strokes [${partCounts}]`)
  }

  for (const [characterId, { sourcePath, glyphTransform }] of Object.entries(DERIVED_SMALL_TSU_GLYPHS)) {
    const filePath = path.join(VENDOR_DIR, sourcePath)
    const svgText = await readFile(filePath, 'utf-8')
    const glyph = { ...parseGlyph(characterId, svgText), glyphTransform }
    entries.push([characterId, glyph])
    const partCounts = glyph.logicalStrokes.map((s) => s.parts.length).join(',')
    console.log(`  ${characterId} (derived from ${sourcePath}): ${glyph.logicalStrokes.length} logical strokes [${partCounts}], glyphTransform="${glyphTransform}"`)
  }

  // Sort by character id for deterministic, diff-stable output regardless
  // of iteration/insertion order across PROTOTYPE_GLYPHS and
  // DERIVED_SMALL_TSU_GLYPHS.
  entries.sort(([a], [b]) => a.localeCompare(b))

  const body = entries.map(([id, glyph]) => `  ${JSON.stringify(id)}: ${JSON.stringify(glyph, null, 2).replace(/\n/g, '\n  ')},`).join('\n')

  return `// Stroke-order glyph data converted from vendored strokesvg SVGs (see
// vendor/strokesvg/PROVENANCE.md for source, pinned commit, and license).
// Derived from the Klee One font, licensed under the SIL Open Font License —
// see vendor/strokesvg/LICENSE. Generated by scripts/convertStrokesvg.ts —
// do not hand-edit; re-run the script instead.
//
// Phase 1A prototype (Issue #122): the six representative glyphs listed in
// scripts/convertStrokesvg.ts's PROTOTYPE_GLYPHS. All other characters
// continue to use src/data/strokes.ts's KanjiVG-derived STROKE_PATHS via
// StrokeOrderAnimation's existing fallback.
//
// Phase 1B (Issue #126): sokuon / katakana-sokuon are additionally derived
// from the pinned full つ/ツ via one glyph-level affine transform (see
// scripts/convertStrokesvg.ts's DERIVED_SMALL_TSU_GLYPHS for the fitted
// constants and derivation method) rather than a dedicated upstream glyph.
export type StrokeGlyph = {
  viewBox: string
  strokeWidth: number
  strokeLinecap: string
  glyphTransform?: string
  logicalStrokes: Array<{
    parts: Array<{
      shadowD: string
      strokeD: string
      transform?: string
    }>
  }>
}

export const STROKE_GLYPHS: Record<string, StrokeGlyph> = {
${body}
}
`
}

// Pure freshness check, reused by both the CLI's --check mode and focused
// tests: `existing` (the currently committed src/data/strokeGlyphs.ts
// content, or null if it doesn't exist) is fresh iff it matches
// `generated` (this run's generateOutput() result) exactly.
export function isFreshOutput(generated: string, existing: string | null): boolean {
  return existing === generated
}

async function main() {
  const checkMode = process.argv.includes('--check')
  console.log(checkMode ? 'Checking generated strokeGlyphs.ts is up to date...' : 'Converting vendored strokesvg SVGs...')
  const content = await generateOutput()

  if (checkMode) {
    const existing = await readFile(OUT_FILE, 'utf-8').catch(() => null)
    if (!isFreshOutput(content, existing)) {
      console.error(
        `\nsrc/data/strokeGlyphs.ts is stale relative to vendored SVGs + converter/spec constants.\nRun: npx tsx scripts/convertStrokesvg.ts`,
      )
      process.exitCode = 1
      return
    }
    console.log('OK: src/data/strokeGlyphs.ts matches current vendored SVGs + converter/spec constants.')
    return
  }

  await writeFile(OUT_FILE, content)
  console.log(`\nWrote ${path.relative(process.cwd(), OUT_FILE)}`)
}

// Only run when invoked directly (`npx tsx scripts/convertStrokesvg.ts`),
// not when imported by scripts/convertStrokesvg.test.ts for parseGlyph
// coverage — matches this repo's existing convention (see
// scripts/fetchStrokeData.ts), applied explicitly here since this module is
// actually imported elsewhere, unlike that one. Compares resolved file
// paths (via the `file:` URL -> path conversion) rather than raw strings,
// since a raw `file://${process.argv[1]}` comparison breaks on Windows
// (backslash path separators, drive-letter casing).
if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? '')) {
  main()
}
