import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseGlyph, PROTOTYPE_GLYPHS, VENDOR_DIR } from './convertStrokesvg'

async function loadGlyph(characterId: string) {
  const relPath = PROTOTYPE_GLYPHS[characterId]
  const svgText = await readFile(path.join(VENDOR_DIR, relPath), 'utf-8')
  return parseGlyph(characterId, svgText)
}

describe('convertStrokesvg: parseGlyph on vendored prototype SVGs', () => {
  it('あ: 3 logical strokes, with 2 parts in logical stroke 3 (self-intersecting multi-part stroke)', async () => {
    const glyph = await loadGlyph('a')
    expect(glyph.logicalStrokes).toHaveLength(3)
    expect(glyph.logicalStrokes[0].parts).toHaveLength(1)
    expect(glyph.logicalStrokes[1].parts).toHaveLength(1)
    expect(glyph.logicalStrokes[2].parts).toHaveLength(2)
  })

  it('ず: optional transform is preserved on both parts of the multi-part logical stroke', async () => {
    const glyph = await loadGlyph('zu')
    const multiPartStroke = glyph.logicalStrokes.find((s) => s.parts.length > 1)
    expect(multiPartStroke).toBeDefined()
    expect(multiPartStroke!.parts).toHaveLength(2)
    for (const part of multiPartStroke!.parts) {
      expect(part.transform).toBe('translate(0 .01)')
    }
  })

  it('single-part cases: き, ア, シ, ツ have only single-part logical strokes', async () => {
    for (const id of ['ki', 'katakana-a', 'katakana-shi', 'katakana-tsu']) {
      const glyph = await loadGlyph(id)
      expect(glyph.logicalStrokes.length).toBeGreaterThan(0)
      for (const stroke of glyph.logicalStrokes) {
        expect(stroke.parts).toHaveLength(1)
      }
    }
  })

  it('ツ: 3 logical strokes (contrast case for シ)', async () => {
    const glyph = await loadGlyph('katakana-tsu')
    expect(glyph.logicalStrokes).toHaveLength(3)
  })

  it('シ: 3 logical strokes', async () => {
    const glyph = await loadGlyph('katakana-shi')
    expect(glyph.logicalStrokes).toHaveLength(3)
  })

  it('ア: 2 ordinary logical strokes', async () => {
    const glyph = await loadGlyph('katakana-a')
    expect(glyph.logicalStrokes).toHaveLength(2)
  })

  it('every part resolves a real, non-empty shadowD distinct from its strokeD', async () => {
    const glyph = await loadGlyph('a')
    for (const stroke of glyph.logicalStrokes) {
      for (const part of stroke.parts) {
        expect(part.shadowD.length).toBeGreaterThan(0)
        expect(part.strokeD.length).toBeGreaterThan(0)
        expect(part.shadowD).not.toBe(part.strokeD)
      }
    }
  })

  it('records viewBox, strokeWidth, strokeLinecap from the source SVG', async () => {
    const glyph = await loadGlyph('a')
    expect(glyph.viewBox).toBe('0 0 1024 1024')
    expect(glyph.strokeWidth).toBe(128)
    expect(glyph.strokeLinecap).toBe('round')
  })

  it('fails loudly (does not silently drop data) on a stroke path with an unsupported attribute', async () => {
    const svgText = await readFile(path.join(VENDOR_DIR, PROTOTYPE_GLYPHS['katakana-a']), 'utf-8')
    const tampered = svgText.replace(
      '<path style="--i:0" d="M103 245c146 107 431-31 741-55 62-4-75 104-305 274" clip-path="url(#30a2c)"/>',
      '<path style="--i:0" d="M103 245c146 107 431-31 741-55 62-4-75 104-305 274" clip-path="url(#30a2c)" fill-opacity="0.5"/>',
    )
    expect(tampered).not.toBe(svgText)
    expect(() => parseGlyph('katakana-a', tampered)).toThrow(/unsupported attribute/)
  })

  it('fails loudly on a stroke path whose clip-path references an unknown clipPath id', async () => {
    const svgText = await readFile(path.join(VENDOR_DIR, PROTOTYPE_GLYPHS['katakana-a']), 'utf-8')
    const tampered = svgText.replace('clip-path="url(#30a2c)"', 'clip-path="url(#nonexistent)"')
    expect(() => parseGlyph('katakana-a', tampered)).toThrow(/unknown clipPath id/)
  })

  it('fails loudly on an unexpected top-level element in the strokes group', async () => {
    const svgText = await readFile(path.join(VENDOR_DIR, PROTOTYPE_GLYPHS['katakana-a']), 'utf-8')
    const tampered = svgText.replace(
      '<path style="--i:0" d="M103 245c146 107 431-31 741-55 62-4-75 104-305 274" clip-path="url(#30a2c)"/>',
      '<circle style="--i:0" cx="0" cy="0" r="1"/>',
    )
    expect(() => parseGlyph('katakana-a', tampered)).toThrow(/unexpected top-level element/)
  })

  it('fails loudly when the shadows group is missing', async () => {
    const svgText = await readFile(path.join(VENDOR_DIR, PROTOTYPE_GLYPHS['katakana-a']), 'utf-8')
    const tampered = svgText.replace('data-strokesvg="shadows"', 'data-strokesvg="not-shadows"')
    expect(() => parseGlyph('katakana-a', tampered)).toThrow(/missing shadows group/)
  })

  it('is deterministic: parsing the same SVG twice produces identical output', async () => {
    const svgText = await readFile(path.join(VENDOR_DIR, PROTOTYPE_GLYPHS['a']), 'utf-8')
    const first = parseGlyph('a', svgText)
    const second = parseGlyph('a', svgText)
    expect(first).toEqual(second)
  })

  it('resolves clip-path references to the correct shadow shape (not a coincidental match)', async () => {
    // シ's 3 logical strokes have visually distinct shadow shapes (see the
    // vendored SVG) — asserting they're pairwise distinct rules out a
    // resolution bug that happens to return the same (e.g. first) shadow
    // for every stroke.
    const glyph = await loadGlyph('katakana-shi')
    const shadowDs = glyph.logicalStrokes.map((s) => s.parts[0].shadowD)
    expect(new Set(shadowDs).size).toBe(shadowDs.length)
  })

  // Upstream's animator sequences strokes off each top-level strokes-group
  // child's `--i:N` custom property, not off document order — the six
  // vendored SVGs happen to have `--i` match document order already, so a
  // converter that only trusted document order would pass on this corpus
  // while silently accepting a glyph whose `--i` disagrees with, or is
  // simply missing from, document order. These tamper tests target that gap
  // directly, using ア (katakana-a — exactly 2 top-level strokes, --i:0 and
  // --i:1) as the tampering base.
  describe('logical-stroke "--i" metadata validation', () => {
    it('fails loudly when a top-level stroke element is missing --i entirely', async () => {
      const svgText = await readFile(path.join(VENDOR_DIR, PROTOTYPE_GLYPHS['katakana-a']), 'utf-8')
      const tampered = svgText.replace('<path style="--i:0"', '<path')
      expect(tampered).not.toBe(svgText)
      expect(() => parseGlyph('katakana-a', tampered)).toThrow(/missing "--i"/)
    })

    it('fails loudly on a duplicate --i value across top-level stroke elements', async () => {
      const svgText = await readFile(path.join(VENDOR_DIR, PROTOTYPE_GLYPHS['katakana-a']), 'utf-8')
      const tampered = svgText.replace('<path style="--i:1"', '<path style="--i:0"')
      expect(() => parseGlyph('katakana-a', tampered)).toThrow(/duplicate logical-stroke "--i:0"/)
    })

    it('fails loudly when --i values are out of order relative to document order', async () => {
      const svgText = await readFile(path.join(VENDOR_DIR, PROTOTYPE_GLYPHS['katakana-tsu']), 'utf-8')
      // ツ has --i:0, --i:1, --i:2 in document order; swapping the first two
      // values keeps them a valid 0..2 SET but out of DOCUMENT order.
      const tampered = svgText.replace('style="--i:0"', 'style="--i:9"').replace('style="--i:1"', 'style="--i:0"').replace('style="--i:9"', 'style="--i:1"')
      expect(() => parseGlyph('katakana-tsu', tampered)).toThrow(/sequential run 0\.\.2/)
    })

    it('fails loudly on a non-sequential --i run (e.g. 0, 2 for a 2-stroke glyph — a gap, not just reordering)', async () => {
      const svgText = await readFile(path.join(VENDOR_DIR, PROTOTYPE_GLYPHS['katakana-a']), 'utf-8')
      const tampered = svgText.replace('<path style="--i:1"', '<path style="--i:2"')
      expect(() => parseGlyph('katakana-a', tampered)).toThrow(/sequential run 0\.\.1/)
    })

    it('fails loudly on an unsupported (non-numeric) --i value', async () => {
      const svgText = await readFile(path.join(VENDOR_DIR, PROTOTYPE_GLYPHS['katakana-a']), 'utf-8')
      const tampered = svgText.replace('<path style="--i:0"', '<path style="--i:foo"')
      expect(() => parseGlyph('katakana-a', tampered)).toThrow(/missing "--i"/)
    })
  })
})
