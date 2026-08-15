import { describe, expect, it } from 'vitest'
import { CHARACTERS, CHARACTERS_BY_ID } from './characters'
import { CATEGORIES, CATEGORIES_BY_ID, getCumulativeCharacterIds, getNextRowId, getPreviousRowId, ROWS } from './curriculum'
import { WORDS_BY_ID, WORDS_BY_ROW } from './words'

describe('curriculum content integrity', () => {
  it('every character id referenced by a word exists in characters.ts', () => {
    for (const words of Object.values(WORDS_BY_ROW)) {
      for (const word of words) {
        for (const charId of word.characterIds) {
          expect(CHARACTERS_BY_ID[charId], `unknown character id "${charId}" in word "${word.id}"`).toBeDefined()
        }
      }
    }
  })

  it('every word only uses characters introduced at or before its row', () => {
    for (const row of ROWS) {
      const known = new Set(getCumulativeCharacterIds(row.id))
      for (const word of WORDS_BY_ROW[row.id] ?? []) {
        for (const charId of word.characterIds) {
          expect(
            known.has(charId),
            `word "${word.id}" (row "${row.id}") uses character "${charId}" before it is taught`,
          ).toBe(true)
        }
      }
    }
  })

  it('word kana string matches the concatenation of its characterIds', () => {
    for (const words of Object.values(WORDS_BY_ROW)) {
      for (const word of words) {
        // U+3040-30FF covers hiragana (3040-309F) AND katakana (30A0-30FF)
        // contiguously, so one range strips punctuation/kanji from a word's
        // audioText-adjacent `kana` field regardless of which script it's
        // in. A hiragana-only range here would silently zero out every
        // katakana word's comparison (all its characters would be
        // stripped, both sides would be '', and the check would pass
        // vacuously) — this bit a first draft of katakana support.
        const kanaOnly = word.kana.replace(/[^぀-ヿ]/g, '')
        const rebuilt = word.characterIds.map((id) => CHARACTERS_BY_ID[id].kana).join('')
        expect(rebuilt, `word "${word.id}" characterIds don't spell its kana`).toBe(kanaOnly)
      }
    }
  })

  it('each row has at least 4 words for the mini-games to draw from', () => {
    for (const row of ROWS) {
      expect((WORDS_BY_ROW[row.id] ?? []).length, `row "${row.id}" has too few words`).toBeGreaterThanOrEqual(4)
    }
  })

  it('every row references a real category', () => {
    for (const row of ROWS) {
      expect(CATEGORIES_BY_ID[row.categoryId], `row "${row.id}" references unknown category "${row.categoryId}"`).toBeDefined()
    }
  })
})

// Regression coverage for the category-scoped row-order helpers (see
// docs/curriculum-extensibility.md) — these all filter by categoryId before
// comparing `order`, so a second category's rows numbering their own order
// from 0 doesn't collide with or extend the first category's sequence.
describe('category-scoped row-order helpers', () => {
  it('getCumulativeCharacterIds only includes characters from earlier rows in the SAME category', () => {
    const cumulative = getCumulativeCharacterIds('ka-row')
    expect(cumulative).toEqual(expect.arrayContaining(['a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke', 'ko']))
    // ta-row comes after ka-row, so none of its characters should be included yet.
    expect(cumulative).not.toEqual(expect.arrayContaining(['ta', 'chi', 'tsu', 'te', 'to']))
  })

  it('getNextRowId/getPreviousRowId walk the sequence within the row\'s own category', () => {
    expect(getNextRowId('a-row')).toBe('ka-row')
    expect(getPreviousRowId('ka-row')).toBe('a-row')
    expect(getPreviousRowId('a-row')).toBeNull()
    expect(getNextRowId('wa-row')).toBeNull()
  })

  it('all three helpers return an empty/null result for an unknown row id rather than throwing', () => {
    expect(getCumulativeCharacterIds('not-a-real-row')).toEqual([])
    expect(getNextRowId('not-a-real-row')).toBeNull()
    expect(getPreviousRowId('not-a-real-row')).toBeNull()
  })
})

// Regression + new coverage for getCumulativeCharacterIds' cross-category
// behavior (see its comment in curriculum.ts): a category's cumulative pool
// also includes every character from a category explicitly listed in its
// `dependsOnCategoryIds`, which 促音 (sokuon) relies on since its words mix
// real hiragana/katakana syllables with っ/ッ, not just its own two
// characters. This is deliberately an explicit per-category fact, not
// inferred from CATEGORIES' declared order — an earlier version inferred it
// from order and incorrectly leaked all of hiragana into katakana's
// distractor pools (katakana depends on nothing, despite being declared
// after hiragana) — see the "independent categories" cases below, which
// exist specifically to catch that regression again.
describe('cross-category cumulative characters (促音 and beyond)', () => {
  it('a sokuon row\'s cumulative pool includes its own characters plus every hiragana AND katakana character', () => {
    const cumulative = getCumulativeCharacterIds('sokuon-row')
    expect(cumulative).toEqual(expect.arrayContaining(['sokuon', 'katakana-sokuon']))
    expect(cumulative).toEqual(expect.arrayContaining(['a', 'ka', 'n'])) // hiragana
    expect(cumulative).toEqual(expect.arrayContaining(['katakana-a', 'katakana-ka', 'katakana-chouon'])) // katakana
  })

  it('hiragana rows are unaffected by the cross-category change (no later category leaks backward)', () => {
    const cumulative = getCumulativeCharacterIds('ka-row')
    expect(cumulative).not.toEqual(expect.arrayContaining(['katakana-a', 'sokuon', 'katakana-sokuon']))
  })

  it('every category with no dependsOnCategoryIds stays fully independent, even if declared later', () => {
    for (const category of CATEGORIES) {
      if ((category.dependsOnCategoryIds ?? []).length > 0) continue
      for (const row of ROWS.filter((r) => r.categoryId === category.id)) {
        const cumulative = getCumulativeCharacterIds(row.id)
        for (const other of CATEGORIES) {
          if (other.id === category.id) continue
          const otherCharIds = ROWS.filter((r) => r.categoryId === other.id).flatMap((r) => r.characterIds)
          expect(
            cumulative.some((id) => otherCharIds.includes(id)),
            `"${row.id}" (category "${category.id}", no declared dependency) unexpectedly includes a character from "${other.id}"`,
          ).toBe(false)
        }
      }
    }
  })

  it('katakana specifically does not depend on hiragana, despite being declared right after it', () => {
    expect(CATEGORIES_BY_ID.katakana?.dependsOnCategoryIds ?? []).toEqual([])
    expect(getCumulativeCharacterIds('katakana-a-row')).not.toEqual(expect.arrayContaining(['a', 'i', 'u', 'e', 'o']))
  })
})

// learnStyle-specific content invariants — see docs/curriculum-extensibility.md.
describe('contrast-pairs category content', () => {
  const contrastPairsCategoryIds = new Set(
    CATEGORIES.filter((c) => c.learnStyle === 'contrast-pairs').map((c) => c.id),
  )

  it('every contrast-pairs row has at least one word (Learn/Practice both operate on words, not flashcards)', () => {
    for (const row of ROWS) {
      if (!contrastPairsCategoryIds.has(row.categoryId)) continue
      expect((WORDS_BY_ROW[row.id] ?? []).length, `contrast-pairs row "${row.id}" has no words`).toBeGreaterThan(0)
    }
  })

  it('sokuon is a contrast-pairs category, and its row introduces the sokuon characters', () => {
    expect(CATEGORIES_BY_ID.sokuon?.learnStyle).toBe('contrast-pairs')
    expect(ROWS.find((r) => r.id === 'sokuon-row')?.characterIds).toEqual(['sokuon', 'katakana-sokuon'])
  })

  // 長音 (chōon) is the first row of ANY category with characterIds: [] — it
  // introduces no new characters at all (see curriculum.ts's chouon-row
  // comment and docs/curriculum-extensibility.md's "Remaining structural
  // note"). This is the one genuinely novel case in this category's content
  // work, so it gets its own explicit coverage here on top of the generic
  // contrast-pairs checks above (which already prove chouon-row has words
  // and every word only uses already-taught characters).
  it('chouon is a contrast-pairs category whose row introduces ZERO new characters', () => {
    expect(CATEGORIES_BY_ID.chouon?.learnStyle).toBe('contrast-pairs')
    expect(ROWS.find((r) => r.id === 'chouon-row')?.characterIds).toEqual([])
  })

  it('chouon still depends on hiragana+katakana, so its words can freely draw on both scripts despite having no characters of its own', () => {
    expect(CATEGORIES_BY_ID.chouon?.dependsOnCategoryIds).toEqual(
      expect.arrayContaining(['hiragana', 'katakana']),
    )
    const cumulative = getCumulativeCharacterIds('chouon-row')
    // The row's own characterIds contributes nothing, but the dependency
    // pool should still be the full hiragana + katakana character set.
    expect(cumulative).toEqual(expect.arrayContaining(['a', 'o', 'sa', 'n'])) // hiragana
    expect(cumulative).toEqual(expect.arrayContaining(['katakana-bi', 'katakana-ru', 'katakana-chouon'])) // katakana
  })

  it('chouon-row words cover more than one hiragana long-vowel spelling pattern (not just あ-row repetition)', () => {
    const words = WORDS_BY_ROW['chouon-row'] ?? []
    // う-row (すうじ: う repeats), え-row spelled with い (せんせい), and
    // お-row spelled with う (おとうさん) should each show up at least once,
    // alongside the あ/い-row minimal pairs.
    expect(words.some((w) => w.kana === 'すうじ')).toBe(true)
    expect(words.some((w) => w.kana === 'せんせい')).toBe(true)
    expect(words.some((w) => w.kana === 'おとうさん')).toBe(true)
    // Katakana's ー is reviewed too, not just hiragana's patterns.
    expect(words.some((w) => w.characterIds.includes('katakana-chouon'))).toBe(true)
  })
})

// 拗音 (yōon) is back to 'character-set' — same Learn/Practice/Tracing shape
// as hiragana/katakana, unlike sokuon/chōon above — see
// docs/curriculum-extensibility.md and CLAUDE.md's category summary.
describe('character-set category content (拗音/yōon)', () => {
  it('youon is a character-set category (not contrast-pairs like sokuon/chōon)', () => {
    expect(CATEGORIES_BY_ID.youon?.learnStyle).toBe('character-set')
  })

  it('youon depends on hiragana + katakana, same as sokuon/chōon, since its words mix in already-taught plain kana', () => {
    expect(CATEGORIES_BY_ID.youon?.dependsOnCategoryIds).toEqual(expect.arrayContaining(['hiragana', 'katakana']))
    const cumulative = getCumulativeCharacterIds('youon-ka-row')
    expect(cumulative).toEqual(expect.arrayContaining(['a', 'ka', 'n'])) // hiragana
    expect(cumulative).toEqual(expect.arrayContaining(['katakana-a', 'katakana-ka', 'katakana-chouon'])) // katakana
  })

  it('introduces the standard 33-combination yōon set for each script (66 characters total)', () => {
    const hiraganaYouon = CHARACTERS.filter((c) => c.rowId.startsWith('youon-') && !c.rowId.includes('katakana'))
    const katakanaYouon = CHARACTERS.filter((c) => c.rowId.startsWith('youon-katakana-'))
    expect(hiraganaYouon).toHaveLength(33)
    expect(katakanaYouon).toHaveLength(33)
    // Spot-check a few well-known combinations exist with the right glyphs.
    expect(CHARACTERS_BY_ID.kya?.kana).toBe('きゃ')
    expect(CHARACTERS_BY_ID.rya?.kana).toBe('りゃ')
    expect(CHARACTERS_BY_ID['katakana-kya']?.kana).toBe('キャ')
    expect(CHARACTERS_BY_ID['katakana-rya']?.kana).toBe('リャ')
  })

  it('every yōon character is a 2-glyph, 1-character-id mora (the documented "one glyph = one mora" break)', () => {
    const youonChars = CHARACTERS.filter((c) => c.rowId.startsWith('youon-'))
    expect(youonChars.length).toBeGreaterThan(0)
    for (const c of youonChars) {
      expect([...c.kana], `"${c.id}" (${c.kana}) should be exactly 2 glyphs`).toHaveLength(2)
    }
  })

  it('a real yōon word\'s characterIds is shorter than its glyph count — the exact mismatch AccentedKana/buildAccentData.mjs guard against', () => {
    // きゃく (kyaku): 2 characterIds (kya, ku) but 3 glyphs (き/ゃ/く) — see
    // WordCard.test.tsx for the rendering-level proof this is handled
    // safely, and buildAccentData.mjs's length-mismatch guard.
    const word = WORDS_BY_ID['youon-ka-kyaku']
    expect(word).toBeDefined()
    expect(word.characterIds).toHaveLength(2)
    expect([...word.kana]).toHaveLength(3)
  })

  it('the hiragana yōon rows (order 0-6) and katakana yōon rows (order 7-13) share one monotonic order sequence within the category', () => {
    const youonRows = ROWS.filter((r) => r.categoryId === 'youon').sort((a, b) => a.order - b.order)
    expect(youonRows).toHaveLength(14)
    expect(youonRows.map((r) => r.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(youonRows.slice(0, 7).every((r) => !r.id.includes('katakana'))).toBe(true)
    expect(youonRows.slice(7).every((r) => r.id.includes('katakana'))).toBe(true)
  })

  it('a later katakana yōon row\'s cumulative pool includes earlier hiragana yōon rows\' characters too (same-category, order-scoped)', () => {
    const cumulative = getCumulativeCharacterIds('youon-katakana-ra-row')
    expect(cumulative).toEqual(expect.arrayContaining(['kya', 'rya'])) // hiragana yōon, earlier order
    expect(cumulative).toEqual(expect.arrayContaining(['katakana-kya', 'katakana-rya'])) // katakana yōon, own row
  })

  it('an early yōon row\'s cumulative pool does NOT include later yōon rows\' characters (order still matters within the category)', () => {
    const cumulative = getCumulativeCharacterIds('youon-ka-row')
    expect(cumulative).not.toEqual(expect.arrayContaining(['rya', 'katakana-kya']))
  })
})

// 特殊音 (tokushuon) — the sixth and final planned category, also
// 'character-set' like 拗音/カタカナ, but genuinely katakana-only (no
// hiragana-id counterpart at all) and depends on sokuon (not just katakana)
// since real vocabulary needs っ/ッ — see curriculum.ts's TOKUSHUON_CATEGORY_ID
// comment and characters.ts's ===== 特殊音 ===== block.
describe('character-set category content (特殊音/tokushuon)', () => {
  it('tokushuon is a character-set category', () => {
    expect(CATEGORIES_BY_ID.tokushuon?.learnStyle).toBe('character-set')
  })

  it('tokushuon depends on katakana + sokuon, but NOT hiragana (it is genuinely katakana-only)', () => {
    expect(CATEGORIES_BY_ID.tokushuon?.dependsOnCategoryIds).toEqual(expect.arrayContaining(['katakana', 'sokuon']))
    expect(CATEGORIES_BY_ID.tokushuon?.dependsOnCategoryIds).not.toEqual(expect.arrayContaining(['hiragana']))
    const cumulative = getCumulativeCharacterIds('tokushuon-fa-row')
    expect(cumulative).toEqual(expect.arrayContaining(['katakana-a', 'katakana-ka', 'katakana-chouon'])) // katakana
    expect(cumulative).toEqual(expect.arrayContaining(['katakana-sokuon'])) // sokuon (needed for words like ウォッチ)
    expect(cumulative).not.toEqual(expect.arrayContaining(['a', 'ka', 'n'])) // NOT hiragana
  })

  it('introduces the documented 23-combination set, all katakana-prefixed, across 6 rows', () => {
    const tokushuonChars = CHARACTERS.filter((c) => c.rowId.startsWith('tokushuon-'))
    expect(tokushuonChars).toHaveLength(23)
    expect(tokushuonChars.every((c) => c.id.startsWith('katakana-'))).toBe(true)
    // Spot-check a few well-known combinations exist with the right glyphs.
    expect(CHARACTERS_BY_ID['katakana-fa']?.kana).toBe('ファ')
    expect(CHARACTERS_BY_ID['katakana-ti']?.kana).toBe('ティ')
    expect(CHARACTERS_BY_ID['katakana-va']?.kana).toBe('ヴァ')
    expect(CHARACTERS_BY_ID['katakana-she']?.kana).toBe('シェ')
  })

  it('ウォ deliberately does NOT collide with ヲ\'s id, despite sharing the same conventional romaji', () => {
    // Both are real, distinct characters ('katakana-uo' = ウォ, 'katakana-wo'
    // = ヲ) that happen to romanize the same way — see characters.ts's
    // comment on why 'katakana-uo' was chosen instead of the more obvious
    // (but already-taken) 'katakana-wo'.
    expect(CHARACTERS_BY_ID['katakana-uo']?.kana).toBe('ウォ')
    expect(CHARACTERS_BY_ID['katakana-wo']?.kana).toBe('ヲ')
    expect(CHARACTERS_BY_ID['katakana-uo']?.romaji).toBe('wo')
    expect(CHARACTERS_BY_ID['katakana-wo']?.romaji).toBe('wo')
  })

  it('every tokushuon character is 2 glyphs, EXCEPT ヴ (katakana-vu) which is a genuine 1-glyph character', () => {
    const tokushuonChars = CHARACTERS.filter((c) => c.rowId.startsWith('tokushuon-'))
    for (const c of tokushuonChars) {
      const expectedLength = c.id === 'katakana-vu' ? 1 : 2
      expect([...c.kana], `"${c.id}" (${c.kana}) should be exactly ${expectedLength} glyph(s)`).toHaveLength(expectedLength)
    }
  })

  it('a real tokushuon word\'s characterIds is shorter than its glyph count — the exact mismatch AccentedKana/buildAccentData.mjs guard against', () => {
    // ファイル (fairu): 3 characterIds (fa, i, ru) but 4 glyphs (フ/ァ/イ/ル).
    const word = WORDS_BY_ID['tokushuon-fa-fairu']
    expect(word).toBeDefined()
    expect(word.characterIds).toHaveLength(3)
    expect([...word.kana]).toHaveLength(4)
  })

  it('the 6 tokushuon rows share one monotonic order sequence within the category, grouped by base-consonant family', () => {
    const tokushuonRows = ROWS.filter((r) => r.categoryId === 'tokushuon').sort((a, b) => a.order - b.order)
    expect(tokushuonRows).toHaveLength(6)
    expect(tokushuonRows.map((r) => r.order)).toEqual([0, 1, 2, 3, 4, 5])
    expect(tokushuonRows.map((r) => r.id)).toEqual([
      'tokushuon-fa-row',
      'tokushuon-ti-row',
      'tokushuon-wi-row',
      'tokushuon-va-row',
      'tokushuon-che-row',
      'tokushuon-tsa-row',
    ])
  })

  it('a later tokushuon row\'s cumulative pool includes earlier tokushuon rows\' characters too (order still matters within the category)', () => {
    const cumulative = getCumulativeCharacterIds('tokushuon-tsa-row')
    expect(cumulative).toEqual(expect.arrayContaining(['katakana-fa', 'katakana-va', 'katakana-che'])) // earlier rows
    expect(cumulative).toEqual(expect.arrayContaining(['katakana-tsa'])) // own row
  })

  it('an early tokushuon row\'s cumulative pool does NOT include later tokushuon rows\' characters', () => {
    const cumulative = getCumulativeCharacterIds('tokushuon-fa-row')
    expect(cumulative).not.toEqual(expect.arrayContaining(['katakana-va', 'katakana-tsa']))
  })

  it('yōon behavior is unaffected by tokushuon existing (regression): yōon does not depend on sokuon or gain tokushuon characters', () => {
    expect(CATEGORIES_BY_ID.youon?.dependsOnCategoryIds).not.toEqual(expect.arrayContaining(['sokuon']))
    const cumulative = getCumulativeCharacterIds('youon-ka-row')
    expect(cumulative).not.toEqual(expect.arrayContaining(['katakana-fa', 'katakana-sokuon']))
  })
})
