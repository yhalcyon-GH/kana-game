import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { DERIVED_SMALL_TSU_GLYPHS, DIRECT_GLYPHS, generateOutput, isFreshOutput, parseGlyph, VENDOR_DIR } from './convertStrokesvg'
import { STROKE_GLYPHS } from '../src/data/strokeGlyphs'
import { CHARACTERS } from '../src/data/characters'

async function loadGlyph(characterId: string) {
  const relPath = DIRECT_GLYPHS[characterId]
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
    const svgText = await readFile(path.join(VENDOR_DIR, DIRECT_GLYPHS['katakana-a']), 'utf-8')
    const tampered = svgText.replace(
      '<path style="--i:0" d="M103 245c146 107 431-31 741-55 62-4-75 104-305 274" clip-path="url(#30a2c)"/>',
      '<path style="--i:0" d="M103 245c146 107 431-31 741-55 62-4-75 104-305 274" clip-path="url(#30a2c)" fill-opacity="0.5"/>',
    )
    expect(tampered).not.toBe(svgText)
    expect(() => parseGlyph('katakana-a', tampered)).toThrow(/unsupported attribute/)
  })

  it('fails loudly on a stroke path whose clip-path references an unknown clipPath id', async () => {
    const svgText = await readFile(path.join(VENDOR_DIR, DIRECT_GLYPHS['katakana-a']), 'utf-8')
    const tampered = svgText.replace('clip-path="url(#30a2c)"', 'clip-path="url(#nonexistent)"')
    expect(() => parseGlyph('katakana-a', tampered)).toThrow(/unknown clipPath id/)
  })

  it('fails loudly on an unexpected top-level element in the strokes group', async () => {
    const svgText = await readFile(path.join(VENDOR_DIR, DIRECT_GLYPHS['katakana-a']), 'utf-8')
    const tampered = svgText.replace(
      '<path style="--i:0" d="M103 245c146 107 431-31 741-55 62-4-75 104-305 274" clip-path="url(#30a2c)"/>',
      '<circle style="--i:0" cx="0" cy="0" r="1"/>',
    )
    expect(() => parseGlyph('katakana-a', tampered)).toThrow(/unexpected top-level element/)
  })

  it('fails loudly when the shadows group is missing', async () => {
    const svgText = await readFile(path.join(VENDOR_DIR, DIRECT_GLYPHS['katakana-a']), 'utf-8')
    const tampered = svgText.replace('data-strokesvg="shadows"', 'data-strokesvg="not-shadows"')
    expect(() => parseGlyph('katakana-a', tampered)).toThrow(/missing shadows group/)
  })

  it('is deterministic: parsing the same SVG twice produces identical output', async () => {
    const svgText = await readFile(path.join(VENDOR_DIR, DIRECT_GLYPHS['a']), 'utf-8')
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
      const svgText = await readFile(path.join(VENDOR_DIR, DIRECT_GLYPHS['katakana-a']), 'utf-8')
      const tampered = svgText.replace('<path style="--i:0"', '<path')
      expect(tampered).not.toBe(svgText)
      expect(() => parseGlyph('katakana-a', tampered)).toThrow(/missing "--i"/)
    })

    it('fails loudly on a duplicate --i value across top-level stroke elements', async () => {
      const svgText = await readFile(path.join(VENDOR_DIR, DIRECT_GLYPHS['katakana-a']), 'utf-8')
      const tampered = svgText.replace('<path style="--i:1"', '<path style="--i:0"')
      expect(() => parseGlyph('katakana-a', tampered)).toThrow(/duplicate logical-stroke "--i:0"/)
    })

    it('fails loudly when --i values are out of order relative to document order', async () => {
      const svgText = await readFile(path.join(VENDOR_DIR, DIRECT_GLYPHS['katakana-tsu']), 'utf-8')
      // ツ has --i:0, --i:1, --i:2 in document order; swapping the first two
      // values keeps them a valid 0..2 SET but out of DOCUMENT order.
      const tampered = svgText.replace('style="--i:0"', 'style="--i:9"').replace('style="--i:1"', 'style="--i:0"').replace('style="--i:9"', 'style="--i:1"')
      expect(() => parseGlyph('katakana-tsu', tampered)).toThrow(/sequential run 0\.\.2/)
    })

    it('fails loudly on a non-sequential --i run (e.g. 0, 2 for a 2-stroke glyph — a gap, not just reordering)', async () => {
      const svgText = await readFile(path.join(VENDOR_DIR, DIRECT_GLYPHS['katakana-a']), 'utf-8')
      const tampered = svgText.replace('<path style="--i:1"', '<path style="--i:2"')
      expect(() => parseGlyph('katakana-a', tampered)).toThrow(/sequential run 0\.\.1/)
    })

    it('fails loudly on an unsupported (non-numeric) --i value', async () => {
      const svgText = await readFile(path.join(VENDOR_DIR, DIRECT_GLYPHS['katakana-a']), 'utf-8')
      const tampered = svgText.replace('<path style="--i:0"', '<path style="--i:foo"')
      expect(() => parseGlyph('katakana-a', tampered)).toThrow(/missing "--i"/)
    })
  })

  // Issue #129 full-kana expansion: inventory-wide invariants proving
  // complete, correct coverage without one brittle test per glyph.
  describe('current-curriculum inventory coverage (Issue #129)', () => {
    const singleGlyphCharacters = CHARACTERS.filter((c) => [...c.kana].length === 1)
    const multiGlyphCharacters = CHARACTERS.filter((c) => [...c.kana].length > 1)
    const derivedIds = new Set(Object.keys(DERIVED_SMALL_TSU_GLYPHS))

    it('every current single-glyph CHARACTERS id has a STROKE_GLYPHS entry', () => {
      for (const character of singleGlyphCharacters) {
        expect(STROKE_GLYPHS[character.id], `missing STROKE_GLYPHS entry for ${character.id}`).toBeDefined()
      }
      expect(singleGlyphCharacters.length).toBe(145)
    })

    // Parses all 143 vendored SVGs individually (via jsdom) — comfortably
    // under a couple seconds standalone, but slow enough alongside the rest
    // of this suite to occasionally miss vitest's default 5s per-test
    // timeout, hence the explicit longer timeout here.
    it(
      'every non-derived single-glyph id has a DIRECT_GLYPHS source spec pointing at an existing vendored SVG that parses successfully',
      async () => {
        const nonDerived = singleGlyphCharacters.filter((c) => !derivedIds.has(c.id))
        expect(nonDerived.length).toBe(143)
        for (const character of nonDerived) {
          const relPath = DIRECT_GLYPHS[character.id]
          expect(relPath, `missing DIRECT_GLYPHS entry for ${character.id}`).toBeDefined()
          const svgText = await readFile(path.join(VENDOR_DIR, relPath), 'utf-8')
          expect(() => parseGlyph(character.id, svgText)).not.toThrow()
        }
      },
      15000,
    )

    it('every DIRECT_GLYPHS source path matches the character\'s actual kana and script (hiragana vs. katakana Unicode block)', () => {
      for (const character of singleGlyphCharacters) {
        if (derivedIds.has(character.id)) continue
        const relPath = DIRECT_GLYPHS[character.id]
        const codePoint = character.kana.codePointAt(0)!
        const expectedScript = codePoint >= 0x3040 && codePoint <= 0x309f ? 'hiragana' : 'katakana'
        expect(relPath).toBe(`${expectedScript}/${character.kana}.svg`)
      }
    })

    it('sokuon / katakana-sokuon retain their derived source + glyphTransform behavior and are excluded from DIRECT_GLYPHS', () => {
      expect(DIRECT_GLYPHS['sokuon']).toBeUndefined()
      expect(DIRECT_GLYPHS['katakana-sokuon']).toBeUndefined()
      expect(DERIVED_SMALL_TSU_GLYPHS['sokuon'].sourcePath).toBe('hiragana/つ.svg')
      expect(DERIVED_SMALL_TSU_GLYPHS['katakana-sokuon'].sourcePath).toBe('katakana/ツ.svg')
      expect(STROKE_GLYPHS['sokuon'].glyphTransform).toBeTruthy()
      expect(STROKE_GLYPHS['katakana-sokuon'].glyphTransform).toBeTruthy()
    })

    it('no multi-glyph yōon / Special Katakana characterId gets a direct combined STROKE_GLYPHS entry of its own', () => {
      expect(multiGlyphCharacters.length).toBe(78)
      for (const character of multiGlyphCharacters) {
        expect(DIRECT_GLYPHS[character.id], `unexpected DIRECT_GLYPHS entry for multi-glyph id ${character.id}`).toBeUndefined()
        // A multi-glyph id must never collide with a single-glyph STROKE_GLYPHS
        // key either — it only ever renders by composing its constituent
        // single glyphs via buildTracingUnit, never as a combined entry.
        expect(
          singleGlyphCharacters.some((c) => c.id === character.id),
          `multi-glyph id ${character.id} unexpectedly also appears as a single-glyph CHARACTERS entry`,
        ).toBe(false)
      }
    })

    it('every buildTracingUnit glyph for every current characterId resolves in STROKE_GLYPHS (no id falls back to an empty guide)', async () => {
      const { buildTracingUnit } = await import('../src/lib/tracingUnits')
      for (const character of CHARACTERS) {
        const unit = buildTracingUnit(character.id)
        for (const glyph of unit.glyphs) {
          expect(
            STROKE_GLYPHS[glyph.strokeSourceId],
            `${character.id} -> glyph strokeSourceId "${glyph.strokeSourceId}" has no STROKE_GLYPHS entry (would render an empty guide)`,
          ).toBeDefined()
        }
      }
    })

    // Representative high-risk structural cases (Issue #129's required list),
    // covered via buildTracingUnit so ordinary yōon and Special Katakana
    // small-vowel composition is exercised alongside direct glyphs.
    it('representative high-risk cases compose/resolve correctly', async () => {
      const { buildTracingUnit } = await import('../src/lib/tracingUnits')

      // あ: multi-part logical stroke preserved end-to-end.
      expect(STROKE_GLYPHS['a'].logicalStrokes.some((s) => s.parts.length > 1)).toBe(true)
      // ず: per-part transform preserved end-to-end.
      const zuMultiPart = STROKE_GLYPHS['zu'].logicalStrokes.find((s) => s.parts.length > 1)
      expect(zuMultiPart).toBeDefined()
      expect(zuMultiPart!.parts.every((p) => p.transform)).toBe(true)
      // っ/ッ: derived glyphTransform present.
      expect(STROKE_GLYPHS['sokuon'].glyphTransform).toBeTruthy()
      expect(STROKE_GLYPHS['katakana-sokuon'].glyphTransform).toBeTruthy()
      // ー: chōon long-vowel mark has a direct entry.
      expect(STROKE_GLYPHS['katakana-chouon']).toBeDefined()
      // シ/ツ: direction/order contrast, both present with distinct stroke counts.
      expect(STROKE_GLYPHS['katakana-shi'].logicalStrokes).toHaveLength(3)
      expect(STROKE_GLYPHS['katakana-tsu'].logicalStrokes).toHaveLength(3)
      // dakuten/handakuten: が (dakuten), ぱ (handakuten).
      expect(STROKE_GLYPHS['ga']).toBeDefined()
      expect(STROKE_GLYPHS['pa']).toBeDefined()
      // ん/ン
      expect(STROKE_GLYPHS['n']).toBeDefined()
      expect(STROKE_GLYPHS['katakana-n']).toBeDefined()
      // ordinary yōon (きゃ) composes into base き + small (borrowed や).
      const kya = buildTracingUnit('kya')
      expect(kya.glyphs).toHaveLength(2)
      expect(kya.glyphs[0].strokeSourceId).toBe('ki')
      expect(kya.glyphs[1].strokeSourceId).toBe('ya')
      // Special Katakana small-vowel example (ファ) composes into base フ + small ア.
      const fa = buildTracingUnit('katakana-fa')
      expect(fa.glyphs).toHaveLength(2)
      expect(fa.glyphs[0].strokeSourceId).toBe('katakana-fu')
      expect(fa.glyphs[1].strokeSourceId).toBe('katakana-a')
    })
  })

  // Derived small-tsu entries (Issue #126, Phase 1B): sokuon/katakana-sokuon
  // have no dedicated upstream strokesvg glyph and are generated from the
  // pinned full つ/ツ via one glyph-level affine transform instead (Option A
  // from the Issue #125 evidence spike). These tests cover the Acceptance
  // Criteria: correct logical-stroke counts and preserved source part
  // structure.
  describe('derived small-tsu entries: sokuon (from つ.svg), katakana-sokuon (from ツ.svg)', () => {
    it('sokuon: exists in STROKE_GLYPHS, has exactly 1 logical stroke, and carries a glyphTransform', () => {
      const glyph = STROKE_GLYPHS['sokuon']
      expect(glyph).toBeDefined()
      expect(glyph.logicalStrokes).toHaveLength(1)
      expect(glyph.glyphTransform).toBeTruthy()
    })

    it('katakana-sokuon: exists in STROKE_GLYPHS, has exactly 3 logical strokes, and carries a glyphTransform', () => {
      const glyph = STROKE_GLYPHS['katakana-sokuon']
      expect(glyph).toBeDefined()
      expect(glyph.logicalStrokes).toHaveLength(3)
      expect(glyph.glyphTransform).toBeTruthy()
    })

    it('sokuon preserves the source つ.svg part structure (1 part in its single logical stroke)', async () => {
      const sourceGlyph = await loadGlyphFromRelPath('sokuon', DERIVED_SMALL_TSU_GLYPHS['sokuon'].sourcePath)
      const derived = STROKE_GLYPHS['sokuon']
      expect(derived.logicalStrokes.map((s) => s.parts.length)).toEqual(sourceGlyph.logicalStrokes.map((s) => s.parts.length))
      expect(derived.logicalStrokes.map((s) => s.parts.map((p) => p.shadowD))).toEqual(
        sourceGlyph.logicalStrokes.map((s) => s.parts.map((p) => p.shadowD)),
      )
    })

    it('katakana-sokuon preserves the source ツ.svg part structure (1 part per logical stroke, 3 strokes)', async () => {
      const sourceGlyph = await loadGlyphFromRelPath('katakana-sokuon', DERIVED_SMALL_TSU_GLYPHS['katakana-sokuon'].sourcePath)
      const derived = STROKE_GLYPHS['katakana-sokuon']
      expect(derived.logicalStrokes.map((s) => s.parts.length)).toEqual(sourceGlyph.logicalStrokes.map((s) => s.parts.length))
      expect(derived.logicalStrokes.map((s) => s.parts.map((p) => p.shadowD))).toEqual(
        sourceGlyph.logicalStrokes.map((s) => s.parts.map((p) => p.shadowD)),
      )
    })

    it('ず\'s per-part transform semantics remain unchanged (stroke-only, no glyphTransform) alongside the new derived entries', () => {
      const zu = STROKE_GLYPHS['zu']
      expect(zu.glyphTransform).toBeUndefined()
      const multiPartStroke = zu.logicalStrokes.find((s) => s.parts.length > 1)
      expect(multiPartStroke).toBeDefined()
      for (const part of multiPartStroke!.parts) {
        expect(part.transform).toBe('translate(0 .01)')
      }
    })
  })

  describe('generated-output freshness check (--check mode support)', () => {
    // isFreshOutput — not raw string/toBe equality — is the exact
    // comparison the CLI's --check mode calls (see main() in
    // convertStrokesvg.ts), so this is the single shared comparison path
    // for both the CLI and every test below (Issue #132's requirement that
    // "the CLI --check and tests must use the same helper/function path").
    // A raw `generated === committed` (or `toBe`) comparison here would be
    // exactly the bug this issue fixes: on a Windows checkout with
    // core.autocrlf=true, the committed file round-trips through git with
    // CRLF line endings while generateOutput() always emits LF, so a byte-
    // for-byte comparison reports every up-to-date file as stale (confirmed
    // by measuring the actual first mismatch — index 70, generated `\n`
    // (0x0A) vs. committed `\r\n` (0x0D 0x0A) — and finding zero remaining
    // differences of any other kind after normalizing line endings on both
    // sides).
    // generateOutput() now reads all 143 vendored SVGs (Issue #129, up from
    // the original 6-glyph prototype set) — computed once via beforeAll and
    // shared across this describe block's assertions rather than re-run per
    // `it` (each full run takes long enough that 6 independent calls could
    // exceed vitest's default 5s per-test timeout).
    let generated: string
    beforeAll(async () => {
      generated = await generateOutput()
    })

    it('generateOutput() is fresh relative to the committed src/data/strokeGlyphs.ts, regardless of the committed file\'s checked-out line endings', async () => {
      const committed = await readFile(path.resolve(import.meta.dirname, '../src/data/strokeGlyphs.ts'), 'utf-8')
      expect(isFreshOutput(generated, committed)).toBe(true)
    })

    it('isFreshOutput: matches generateOutput() exactly -> fresh', () => {
      expect(isFreshOutput(generated, generated)).toBe(true)
    })

    // The platform-independence fix: the same content as `generated`, but
    // with every LF rewritten to CRLF (simulating a Windows/autocrlf
    // checkout of an otherwise up-to-date file), must still be fresh.
    it('isFreshOutput: the same content with CRLF line endings (simulated Windows checkout) -> still fresh', () => {
      const crlfVersion = generated.replace(/\n/g, '\r\n')
      expect(crlfVersion).not.toBe(generated)
      expect(isFreshOutput(generated, crlfVersion)).toBe(true)
    })

    // Line-ending normalization must never mask an actual content
    // difference — a non-newline tamper stays stale even though it also
    // happens to be compared through the same normalizing helper.
    it('isFreshOutput: a deliberate non-newline content tamper -> stale (normalization does not mask real content changes)', () => {
      const tampered = generated.replace('"sokuon"', '"sokuon-tampered"')
      expect(tampered).not.toBe(generated)
      expect(isFreshOutput(generated, tampered)).toBe(false)
    })

    // A content tamper combined with CRLF line endings (the realistic
    // Windows-checkout-of-a-stale-file case) must also stay stale — proves
    // normalization only collapses newline representation, never weakens
    // the underlying equality check.
    it('isFreshOutput: a non-newline content tamper with CRLF line endings -> still stale', () => {
      const tamperedCrlf = generated.replace('"sokuon"', '"sokuon-tampered"').replace(/\n/g, '\r\n')
      expect(isFreshOutput(generated, tamperedCrlf)).toBe(false)
    })

    it('isFreshOutput: a missing committed file (null) -> stale', () => {
      expect(isFreshOutput(generated, null)).toBe(false)
    })
  })
})

async function loadGlyphFromRelPath(characterId: string, relPath: string) {
  const svgText = await readFile(path.join(VENDOR_DIR, relPath), 'utf-8')
  return parseGlyph(characterId, svgText)
}
