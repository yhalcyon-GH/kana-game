// Tracing-only "writing unit" model. Scoped to TracingPage/StrokeOrderAnimation
// layout — nowhere else in the app needs to know a characterId can expand
// into more than one drawable glyph.
//
// Every learning/quiz target in this app is one characterId (see
// data/characters.ts), and for almost all of them that's also exactly one
// drawable glyph. Yōon is the one exception: a yōon characterId's `kana` is
// genuinely 2 Unicode characters (e.g. 'kya' -> 'きゃ') spelling ONE mora
// with TWO glyphs that must be written in two visually distinct strokes/
// cells — see characters.ts's yōon section comment. This module expands a
// characterId into its real glyph sequence so tracing layout can be driven
// by curriculum units (characterIds), never by raw Unicode character count
// (see TracingPage's old `[...currentWord.kana].length` bug).
import { CHARACTERS, CHARACTERS_BY_ID } from '../data/characters'

export type TracingGlyph = {
  kana: string
  // characterId whose STROKE_PATHS entry this glyph's strokes should be
  // drawn from. For a normal character this is just its own id. For the
  // small ゃ/ゅ/ょ half of a yōon character, this points at the full-size
  // や/ゆ/よ character (there is no dedicated stroke entry for the small
  // form, and there must never be one hand-authored — see strokes.ts's
  // generated-file header and scripts/fetchStrokeData.ts's yōon guard) —
  // the small glyph is rendered by scaling those reused paths down, never
  // by inventing new stroke geometry.
  strokeSourceId: string
  isSmall: boolean
}

export type TracingUnit = {
  characterId: string
  glyphs: TracingGlyph[]
}

// Reverse lookup: single glyph -> the CHARACTERS entry for it. Only built
// from single-glyph entries (kana.length === 1) so a yōon id's 2-character
// `kana` never shadows its own base glyph's real id.
const CHARACTER_ID_BY_SINGLE_GLYPH: Record<string, string> = Object.fromEntries(
  CHARACTERS.filter((c) => [...c.kana].length === 1).map((c) => [c.kana, c.id]),
)

// Small ゃ/ゅ/ょ (and katakana ャ/ュ/ョ) each reuse the full-size や/ゆ/よ
// stroke data, scaled down at render time (see StrokeOrderAnimation's
// `scale` prop and TracingPage's small-glyph guide drawing) — a small,
// explicit map is clearer here than reusing mora.ts's broader small-
// combining-kana set (which also covers hiragana ぁぃぅぇぉ, never used by
// any characterId in this curriculum). Special Katakana (ファ/ティ/シェ/...,
// see curriculum.ts's SPECIAL_KATAKANA_CATEGORY_ID) reuses this exact same
// mechanism for its small vowel kana (ァィゥェォ -> full-size アイウエオ) —
// ゥ has no Special Katakana target today, but is included for completeness
// alongside its four siblings rather than added only once something needs
// it.
const SMALL_YOON_BASE_ID: Record<string, string> = {
  ゃ: 'ya',
  ゅ: 'yu',
  ょ: 'yo',
  ャ: 'katakana-ya',
  ュ: 'katakana-yu',
  ョ: 'katakana-yo',
  ァ: 'katakana-a',
  ィ: 'katakana-i',
  ゥ: 'katakana-u',
  ェ: 'katakana-e',
  ォ: 'katakana-o',
}

export function isYoonCharacterId(characterId: string): boolean {
  const kana = CHARACTERS_BY_ID[characterId]?.kana ?? ''
  return [...kana].length === 2
}

// Expands one characterId into its real drawable glyph sequence. Normal
// characters (including っ/ッ/ー, which are single glyphs like any other —
// see TracingPage's sokuon/chōon-unchanged requirement) return exactly one
// glyph. A yōon characterId returns exactly two: its base consonant glyph
// (own stroke data) followed by its small ゃ/ゅ/ょ glyph (borrowed
// や/ゆ/よ stroke data, isSmall: true).
export function buildTracingUnit(characterId: string): TracingUnit {
  const kana = CHARACTERS_BY_ID[characterId]?.kana ?? ''
  const chars = [...kana]
  if (chars.length <= 1) {
    return { characterId, glyphs: [{ kana, strokeSourceId: characterId, isSmall: false }] }
  }
  const [base, small] = chars
  const baseId = CHARACTER_ID_BY_SINGLE_GLYPH[base] ?? characterId
  const smallSourceId = SMALL_YOON_BASE_ID[small] ?? baseId
  return {
    characterId,
    glyphs: [
      { kana: base, strokeSourceId: baseId, isSmall: false },
      { kana: small, strokeSourceId: smallSourceId, isSmall: true },
    ],
  }
}

export function buildTracingUnits(characterIds: string[]): TracingUnit[] {
  return characterIds.map(buildTracingUnit)
}

// Writing-cell width of one unit: 1 for a normal character, 2 for a yōon
// unit (its base + small glyph each get their own cell — see TracingPage's
// "wide 2-cell writing area" requirement, Step 7).
export function unitCellWidth(unit: TracingUnit): number {
  return unit.glyphs.length
}

export type PackedRow = {
  units: TracingUnit[]
  cellCount: number
}

// Packs units into rows of at most `maxCellsPerRow` writing cells, never
// splitting a single unit's cells across two rows (Step 9): if a unit
// wouldn't fit in the remaining space of the current row, the WHOLE unit
// moves to a new row, even if that leaves the current row under capacity.
export function packTracingRows(units: TracingUnit[], maxCellsPerRow: number): PackedRow[] {
  const rows: PackedRow[] = []
  let current: TracingUnit[] = []
  let currentCells = 0

  for (const unit of units) {
    const width = unitCellWidth(unit)
    if (currentCells > 0 && currentCells + width > maxCellsPerRow) {
      rows.push({ units: current, cellCount: currentCells })
      current = []
      currentCells = 0
    }
    current.push(unit)
    currentCells += width
  }
  if (current.length > 0) rows.push({ units: current, cellCount: currentCells })
  return rows
}
