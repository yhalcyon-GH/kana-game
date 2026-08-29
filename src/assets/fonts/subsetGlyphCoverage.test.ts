import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error -- wawoff2 ships no types.
import { decompress } from 'wawoff2'

// harfbuzzjs's default export is a raw CJS module.exports = new Promise(...)
// — ESM interop mangles that (Promise.prototype.then called on an
// incompatible receiver), so it's loaded via a real CJS require instead,
// used only in this test to decode the subset woff2 and check real glyph
// coverage.
const require = createRequire(import.meta.url)
const hbPromise: Promise<any> = require('harfbuzzjs')

// Regression test for "small ァィゥェォ font subsetting bug" (finish
// Special Katakana learning polish, item 1): the Klee One subset used by
// .font-kana (see scripts/subsetKanaFont.mjs) is regenerated from a scan of
// src/data/*.ts, but that scan can miss a glyph that only the Guide (not
// any character/word/curriculum string) references — ゥ, for instance, has
// no current character or word using it standalone. REQUIRED_KANA_GLYPHS in
// subsetKanaFont.mjs is the explicit safety net; this test verifies the
// CHECKED-IN woff2 files actually contain real (non-.notdef) glyphs for
// all 5 small vowels, not just that the source scan lists them — catching
// the actual failure mode this bug had: the font simply wasn't regenerated
// after Special Katakana was added to the curriculum.
const REQUIRED_KANA_GLYPHS = 'ァィゥェォ'
// A yōon sample, to confirm the safety net didn't regress this existing,
// previously-working glyph set.
const YOUON_SAMPLE = 'きゃしゅちょ'

async function hasRealGlyphsFor(fontPath: string, text: string): Promise<boolean[]> {
  const hb = await hbPromise
  // HarfBuzz's wasm build here only understands raw sfnt (TTF-style) font
  // data, not woff2's compressed container directly — decompress first.
  // wawoff2's emscripten binding wants a plain Uint8Array (not a Node
  // Buffer instance, whose extra prototype confuses its type coercion under
  // jsdom's globals) for both the input and its own output.
  const woff2 = new Uint8Array(await readFile(fontPath))
  const buf = new Uint8Array(await decompress(woff2))
  const blob = hb.createBlob(buf)
  const face = hb.createFace(blob, 0)
  const font = hb.createFont(face)
  const results: boolean[] = []
  for (const ch of text) {
    const buffer = hb.createBuffer()
    buffer.addText(ch)
    buffer.guessSegmentProperties()
    hb.shape(font, buffer)
    const glyphs = buffer.json(font)
    // glyph id 0 is .notdef — a real font renders a visible box/fallback for
    // it, which is exactly the "fallback-font-looking" symptom this bug had.
    results.push(glyphs.length > 0 && glyphs.every((g: { g: number }) => g.g !== 0))
    buffer.destroy()
  }
  font.destroy()
  face.destroy()
  blob.destroy()
  return results
}

describe.each([400, 600])('klee-one-hiragana-%i.woff2 glyph coverage', (weight) => {
  const fontPath = path.join(__dirname, `klee-one-hiragana-${weight}.woff2`)

  it('has a real glyph (not .notdef) for every small vowel ァィゥェォ, including ゥ', async () => {
    const results = await hasRealGlyphsFor(fontPath, REQUIRED_KANA_GLYPHS)
    expect(Object.fromEntries([...REQUIRED_KANA_GLYPHS].map((ch, i) => [ch, results[i]]))).toEqual(
      Object.fromEntries([...REQUIRED_KANA_GLYPHS].map((ch) => [ch, true])),
    )
  })

  it('still has real glyphs for existing yōon (no regression)', async () => {
    const results = await hasRealGlyphsFor(fontPath, YOUON_SAMPLE)
    expect(results.every(Boolean)).toBe(true)
  })
})
