import { describe, expect, it } from 'vitest'
import { buildTracingUnit, buildTracingUnits, packTracingRows, unitCellWidth } from './tracingUnits'

describe('buildTracingUnit', () => {
  it('normal hiragana character: 1 glyph, not small', () => {
    const unit = buildTracingUnit('a')
    expect(unit.glyphs).toEqual([{ kana: 'あ', strokeSourceId: 'a', isSmall: false }])
  })

  it('sokuon (っ): 1 glyph, unchanged behavior', () => {
    const unit = buildTracingUnit('sokuon')
    expect(unit.glyphs).toEqual([{ kana: 'っ', strokeSourceId: 'sokuon', isSmall: false }])
  })

  it('katakana chōon (ー): 1 glyph, unchanged behavior', () => {
    const unit = buildTracingUnit('katakana-chouon')
    expect(unit.glyphs).toEqual([{ kana: 'ー', strokeSourceId: 'katakana-chouon', isSmall: false }])
  })

  it('yōon きゃ (kya): expands to き + small ゃ, ゃ reuses や\'s stroke source', () => {
    const unit = buildTracingUnit('kya')
    expect(unit.glyphs).toEqual([
      { kana: 'き', strokeSourceId: 'ki', isSmall: false },
      { kana: 'ゃ', strokeSourceId: 'ya', isSmall: true },
    ])
  })

  it('yōon しゅ (shu): expands to し + small ゅ (yu source)', () => {
    const unit = buildTracingUnit('shu')
    expect(unit.glyphs).toEqual([
      { kana: 'し', strokeSourceId: 'shi', isSmall: false },
      { kana: 'ゅ', strokeSourceId: 'yu', isSmall: true },
    ])
  })

  it('yōon ちょ (cho): expands to ち + small ょ (yo source)', () => {
    const unit = buildTracingUnit('cho')
    expect(unit.glyphs).toEqual([
      { kana: 'ち', strokeSourceId: 'chi', isSmall: false },
      { kana: 'ょ', strokeSourceId: 'yo', isSmall: true },
    ])
  })

  it('katakana yōon キャ (katakana-kya): expands to キ + small ャ (katakana-ya source)', () => {
    const unit = buildTracingUnit('katakana-kya')
    expect(unit.glyphs).toEqual([
      { kana: 'キ', strokeSourceId: 'katakana-ki', isSmall: false },
      { kana: 'ャ', strokeSourceId: 'katakana-ya', isSmall: true },
    ])
  })
})

describe('unitCellWidth', () => {
  it('is 1 for a normal unit and 2 for a yōon unit', () => {
    expect(unitCellWidth(buildTracingUnit('a'))).toBe(1)
    expect(unitCellWidth(buildTracingUnit('sokuon'))).toBe(1)
    expect(unitCellWidth(buildTracingUnit('kya'))).toBe(2)
  })
})

describe('packTracingRows', () => {
  it('3 normal glyphs pack into a single row of 3 cells', () => {
    const units = buildTracingUnits(['a', 'i', 'u'])
    const rows = packTracingRows(units, 3)
    expect(rows).toHaveLength(1)
    expect(rows[0].cellCount).toBe(3)
    expect(rows[0].units.map((u) => u.characterId)).toEqual(['a', 'i', 'u'])
  })

  it('4 normal glyphs pack as 3 + 1', () => {
    const units = buildTracingUnits(['a', 'i', 'u', 'e'])
    const rows = packTracingRows(units, 3)
    expect(rows.map((r) => r.cellCount)).toEqual([3, 1])
  })

  it('5 normal glyphs pack as 3 + 2', () => {
    const units = buildTracingUnits(['a', 'i', 'u', 'e', 'o'])
    const rows = packTracingRows(units, 3)
    expect(rows.map((r) => r.cellCount)).toEqual([3, 2])
  })

  it('6 normal glyphs pack as 3 + 3', () => {
    const units = buildTracingUnits(['a', 'i', 'u', 'e', 'o', 'ka'])
    const rows = packTracingRows(units, 3)
    expect(rows.map((r) => r.cellCount)).toEqual([3, 3])
  })

  it('きゃく (kya + ku): yōon unit never split across cells within its own unit, packs as 2+1 in one row', () => {
    const units = buildTracingUnits(['kya', 'ku'])
    const rows = packTracingRows(units, 3)
    expect(rows).toHaveLength(1)
    expect(rows[0].cellCount).toBe(3)
    expect(rows[0].units.map((u) => u.characterId)).toEqual(['kya', 'ku'])
  })

  it('row-boundary case: 1 cell of space left, next unit is a 2-cell yōon unit -> whole unit moves to next row (Step 9)', () => {
    // 'a' (1 cell) leaves 2 of 3 cells free; 'kya' (2 cells) still fits
    // there, so add a second 1-cell filler first to leave exactly 1 cell.
    const units = buildTracingUnits(['a', 'i', 'kya'])
    const rows = packTracingRows(units, 3)
    // 'a' + 'i' = 2 cells, 1 cell remains; 'kya' needs 2 -> must NOT place
    // just its first glyph and leave the small glyph behind — the whole
    // unit moves to row 2.
    expect(rows).toHaveLength(2)
    expect(rows[0].units.map((u) => u.characterId)).toEqual(['a', 'i'])
    expect(rows[1].units.map((u) => u.characterId)).toEqual(['kya'])
    expect(rows[1].cellCount).toBe(2)
  })
})
