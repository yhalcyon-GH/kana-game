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

export type StrokeGlyph = {
  viewBox: string
  strokeWidth: number
  strokeLinecap: string
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

  const logicalStrokes: StrokeGlyph['logicalStrokes'] = []
  for (const child of strokesGroup.children) {
    const tag = child.tagName.toLowerCase()
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

  return { viewBox, strokeWidth, strokeLinecap, logicalStrokes }
}

async function main() {
  console.log('Converting vendored strokesvg SVGs...')
  const entries: [string, StrokeGlyph][] = []
  for (const [characterId, relPath] of Object.entries(PROTOTYPE_GLYPHS)) {
    const filePath = path.join(VENDOR_DIR, relPath)
    const svgText = await readFile(filePath, 'utf-8')
    const glyph = parseGlyph(characterId, svgText)
    entries.push([characterId, glyph])
    const partCounts = glyph.logicalStrokes.map((s) => s.parts.length).join(',')
    console.log(`  ${characterId} (${relPath}): ${glyph.logicalStrokes.length} logical strokes [${partCounts}]`)
  }

  // Sort by character id for deterministic, diff-stable output regardless
  // of PROTOTYPE_GLYPHS iteration/insertion order.
  entries.sort(([a], [b]) => a.localeCompare(b))

  const body = entries.map(([id, glyph]) => `  ${JSON.stringify(id)}: ${JSON.stringify(glyph, null, 2).replace(/\n/g, '\n  ')},`).join('\n')

  const content = `// Stroke-order glyph data converted from vendored strokesvg SVGs (see
// vendor/strokesvg/PROVENANCE.md for source, pinned commit, and license).
// Derived from the Klee One font, licensed under the SIL Open Font License —
// see vendor/strokesvg/LICENSE. Generated by scripts/convertStrokesvg.ts —
// do not hand-edit; re-run the script instead.
//
// Phase 1A prototype (Issue #122): only the six representative glyphs listed
// in scripts/convertStrokesvg.ts's PROTOTYPE_GLYPHS are present. All other
// characters continue to use src/data/strokes.ts's KanjiVG-derived
// STROKE_PATHS via StrokeOrderAnimation's existing fallback.
export type StrokeGlyph = {
  viewBox: string
  strokeWidth: number
  strokeLinecap: string
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

  await writeFile(OUT_FILE, content)
  console.log(`\nWrote ${entries.length} glyphs to ${path.relative(process.cwd(), OUT_FILE)}`)
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
