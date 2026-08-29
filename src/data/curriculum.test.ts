import { describe, expect, it } from 'vitest'
import { CHARACTERS, CHARACTERS_BY_ID } from './characters'
import { CATEGORIES, CATEGORIES_BY_ID, getCumulativeCharacterIds, getNextRowId, getPreviousRowId, ROWS, ROWS_BY_ID } from './curriculum'
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
    // Summary rows (see GojuonRow.isSummary) don't have their own
    // WORDS_BY_ROW entry — their word pool is assembled at runtime from
    // every real row in their category (see useCurriculum.ts), not stored
    // per-row, so this invariant doesn't apply to them. Similar Letters rows
    // (see GojuonRow.isSimilarLetters) are the same: their word pool is also
    // assembled at runtime (see useCurriculum's getScopeWords).
    for (const row of ROWS.filter((r) => !r.isSummary && !r.isSimilarLetters)) {
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
    // wa-row is the last REAL hiragana row, but hiragana-summary (⭐, see
    // GojuonRow.isSummary) now follows it in the same order sequence, so
    // it's the true end of the category, not wa-row.
    expect(getNextRowId('wa-row')).toBe('hiragana-summary')
    expect(getNextRowId('hiragana-summary')).toBeNull()
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
    for (const row of ROWS.filter((r) => !r.isSummary)) {
      if (!contrastPairsCategoryIds.has(row.categoryId)) continue
      expect((WORDS_BY_ROW[row.id] ?? []).length, `contrast-pairs row "${row.id}" has no words`).toBeGreaterThan(0)
    }
  })

  it('sokuon is a contrast-pairs category, and its row introduces the sokuon characters', () => {
    expect(CATEGORIES_BY_ID.sokuon?.learnStyle).toBe('contrast-pairs')
    expect(ROWS.find((r) => r.id === 'sokuon-row')?.characterIds).toEqual(['sokuon', 'katakana-sokuon'])
  })

  // 長音 (chōon) rows all have characterIds: [] — none introduce any new
  // characters at all (see curriculum.ts's chouon-*-row comment and
  // docs/curriculum-extensibility.md's "Remaining structural note"). This is
  // the one genuinely novel case in this category's content work, so it
  // gets its own explicit coverage here on top of the generic contrast-pairs
  // checks above (which already prove every row has words and every word
  // only uses already-taught characters). Split into 6 rows — one per
  // hiragana vowel-column rule (あ/い/う/え/お), plus a katakana review row —
  // per the user's own teaching material, rather than one flat lesson.
  it('chouon is a contrast-pairs category whose 6 rows introduce ZERO new characters between them', () => {
    expect(CATEGORIES_BY_ID.chouon?.learnStyle).toBe('contrast-pairs')
    const chouonRows = ROWS.filter((r) => r.categoryId === 'chouon')
    expect(chouonRows).toHaveLength(6)
    expect(chouonRows.every((r) => r.characterIds.length === 0)).toBe(true)
  })

  it('chouon still depends on hiragana+katakana, so its words can freely draw on both scripts despite having no characters of its own', () => {
    expect(CATEGORIES_BY_ID.chouon?.dependsOnCategoryIds).toEqual(
      expect.arrayContaining(['hiragana', 'katakana']),
    )
    const cumulative = getCumulativeCharacterIds('chouon-a-row')
    // The row's own characterIds contributes nothing, but the dependency
    // pool should still be the full hiragana + katakana character set.
    expect(cumulative).toEqual(expect.arrayContaining(['a', 'o', 'sa', 'n'])) // hiragana
    expect(cumulative).toEqual(expect.arrayContaining(['katakana-bi', 'katakana-ru', 'katakana-chouon'])) // katakana
  })

  it('no chouon word anywhere uses a yōon character, even though the source material\'s own examples did (とうきょう, ぎゅうにゅう) — chouon does not depend on youon', () => {
    // Every yōon character id is 3+ letters ending in a/u/o preceded by y
    // (kya/sha/cha/...) — simplest robust check: none of chouon's words use
    // any character id that belongs to a youon-category row.
    const youonCharIds = new Set(ROWS.filter((r) => r.categoryId === 'youon').flatMap((r) => r.characterIds))
    const chouonRows = ROWS.filter((r) => r.categoryId === 'chouon')
    for (const row of chouonRows) {
      for (const word of WORDS_BY_ROW[row.id] ?? []) {
        for (const charId of word.characterIds) {
          expect(youonCharIds.has(charId), `word "${word.id}" uses yōon character "${charId}"`).toBe(false)
        }
      }
    }
  })

  it('each of the 5 hiragana vowel-column rules is covered by its own row, with its rule explanation and real example words', () => {
    const expected: Record<string, { kana: string; explanationMatch: RegExp }> = {
      'chouon-a-row': { kana: 'おかあさん', explanationMatch: /①ア段/ },
      'chouon-i-row': { kana: 'おじいさん', explanationMatch: /②イ段/ },
      'chouon-u-row': { kana: 'ゆうき', explanationMatch: /③ウ段/ },
      'chouon-e-row': { kana: 'えいが', explanationMatch: /④エ段/ },
      'chouon-o-row': { kana: 'おとうと', explanationMatch: /⑤オ段/ },
    }
    for (const [rowId, { kana, explanationMatch }] of Object.entries(expected)) {
      const row = ROWS.find((r) => r.id === rowId)
      expect(row?.explanation, `${rowId} should have an explanation`).toMatch(explanationMatch)
      expect((WORDS_BY_ROW[rowId] ?? []).some((w) => w.kana === kana), `${rowId} should include ${kana}`).toBe(true)
    }
  })

  it('the え-row and お-row rows include their documented exception words (おねえさん, おおきい/とおい/こおり)', () => {
    expect((WORDS_BY_ROW['chouon-e-row'] ?? []).some((w) => w.kana === 'おねえさん')).toBe(true)
    const oRowKana = (WORDS_BY_ROW['chouon-o-row'] ?? []).map((w) => w.kana)
    expect(oRowKana).toEqual(expect.arrayContaining(['おおきい', 'とおい', 'こおり']))
  })

  it('the katakana review row (chouon-katakana-row) shows the ビル/ビール minimal pair', () => {
    const kana = (WORDS_BY_ROW['chouon-katakana-row'] ?? []).map((w) => w.kana)
    expect(kana).toEqual(expect.arrayContaining(['ビル', 'ビール']))
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

  // 14 rows -> 10 (2026-08-15): ちゃ/にゃ and みゃ/りゃ each merged into one
  // row per script (real everyday vocabulary for にゃ/みゃ/りゃ alone was
  // too thin to justify a dedicated row — see words.ts's comments).
  it('the hiragana yōon rows (order 0-4) and katakana yōon rows (order 5-9) share one monotonic order sequence within the category', () => {
    const youonRows = ROWS.filter((r) => r.categoryId === 'youon' && !r.isSummary).sort((a, b) => a.order - b.order)
    expect(youonRows).toHaveLength(10)
    expect(youonRows.map((r) => r.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(youonRows.slice(0, 5).every((r) => !r.id.includes('katakana'))).toBe(true)
    expect(youonRows.slice(5).every((r) => r.id.includes('katakana'))).toBe(true)
  })

  it('a later katakana yōon row\'s cumulative pool includes earlier hiragana yōon rows\' characters too (same-category, order-scoped)', () => {
    const cumulative = getCumulativeCharacterIds('youon-katakana-ma-ra-row')
    expect(cumulative).toEqual(expect.arrayContaining(['kya', 'rya'])) // hiragana yōon, earlier order
    expect(cumulative).toEqual(expect.arrayContaining(['katakana-kya', 'katakana-rya'])) // katakana yōon, own row
  })

  it('an early yōon row\'s cumulative pool does NOT include later yōon rows\' characters (order still matters within the category)', () => {
    const cumulative = getCumulativeCharacterIds('youon-ka-row')
    expect(cumulative).not.toEqual(expect.arrayContaining(['rya', 'katakana-kya']))
  })
})

// Micro-batches (see types.ts's GojuonRow.learnBatches) are a Learn-only
// presentation grouping — characterIds stays the single source of truth for
// unlock/mastery/Practice/Review, so a batch definition drifting out of
// sync with it (missing/duplicate/reordered ids) would only surface as a
// silently-wrong Learn flow, not a type error. These invariants keep that
// impossible.
describe('learnBatches (micro-batch Learn presentation)', () => {
  const rowsWithBatches = ROWS.filter((r) => !r.isSummary && r.learnBatches)

  it('at least one real row actually defines learnBatches (this suite isn\'t vacuous)', () => {
    expect(rowsWithBatches.length).toBeGreaterThan(0)
  })

  it('flattening learnBatches exactly reproduces characterIds, in order, for every row that has them', () => {
    for (const row of rowsWithBatches) {
      expect(row.learnBatches!.flat(), `row "${row.id}"`).toEqual(row.characterIds)
    }
  })

  it('no batch is empty, and every row with learnBatches has more than one batch (a single batch would be redundant with the unbatched flow)', () => {
    for (const row of rowsWithBatches) {
      expect(row.learnBatches!.length, `row "${row.id}"`).toBeGreaterThan(1)
      for (const batch of row.learnBatches!) {
        expect(batch.length, `an empty batch in row "${row.id}"`).toBeGreaterThan(0)
      }
    }
  })

  it('rows with 5 or fewer characters do not define learnBatches (no redundant intermediate recap)', () => {
    for (const row of ROWS) {
      if (row.isSummary || row.categoryId === 'youon') continue // yōon always batches, see below
      if (row.characterIds.length <= 5) {
        expect(row.learnBatches, `row "${row.id}" has ${row.characterIds.length} characters`).toBeUndefined()
      }
    }
  })

  it('ha-row uses three 5-character batches (は/ば/ぱ)', () => {
    const haRow = ROWS.find((r) => r.id === 'ha-row')!
    expect(haRow.learnBatches).toEqual([
      ['ha', 'hi', 'fu', 'he', 'ho'],
      ['ba', 'bi', 'bu', 'be', 'bo'],
      ['pa', 'pi', 'pu', 'pe', 'po'],
    ])
  })

  it('katakana-a-row uses 5/5/5/2 logical batches (ア行・カ行・ガ行・ン&ー)', () => {
    const row = ROWS.find((r) => r.id === 'katakana-a-row')!
    expect(row.learnBatches!.map((b) => b.length)).toEqual([5, 5, 5, 2])
  })

  it('every yōon row is batched into its 3-sound families, regardless of character count', () => {
    const youonRows = ROWS.filter((r) => r.categoryId === 'youon' && !r.isSummary)
    expect(youonRows.length).toBeGreaterThan(0)
    for (const row of youonRows) {
      expect(row.learnBatches, `row "${row.id}"`).toBeDefined()
      for (const batch of row.learnBatches!) {
        expect(batch, `a batch in row "${row.id}"`).toHaveLength(3)
      }
    }
  })

  it('contrast-pairs rows (sokuon/chōon) never define learnBatches — their Learn flow skips the flashcard step entirely', () => {
    const contrastPairsRows = ROWS.filter((r) => CATEGORIES_BY_ID[r.categoryId]?.learnStyle === 'contrast-pairs')
    expect(contrastPairsRows.length).toBeGreaterThan(0)
    for (const row of contrastPairsRows) {
      expect(row.learnBatches, `row "${row.id}"`).toBeUndefined()
    }
  })
})

describe('row-selection display lines (Issue #38)', () => {
  it('uses intentional groups for Hiragana and the combined first Katakana row', () => {
    expect(ROWS_BY_ID['ka-row'].label).toBe('か〜こ・が〜ご')
    expect(ROWS_BY_ID['ka-row'].displayLines).toEqual(['か〜こ', 'が〜ご'])
    expect(ROWS_BY_ID['ha-row'].displayLines).toEqual(['は〜ほ', 'ば〜ぼ', 'ぱ〜ぽ'])
    expect(ROWS_BY_ID['katakana-a-row'].displayLines).toEqual(['ア〜オ', 'カ〜コ', 'ガ〜ゴ', 'ン・ー'])
    expect(ROWS_BY_ID['katakana-ra-row'].displayLines).toEqual(['ラ〜ロ', 'ワ・ヲ'])
  })

  it('keeps each Yōon learning batch together, including its middle dots', () => {
    expect(ROWS_BY_ID['youon-ka-row'].displayLines).toEqual(['きゃ・きゅ・きょ', 'ぎゃ・ぎゅ・ぎょ'])
    expect(ROWS_BY_ID['youon-ha-row'].displayLines).toEqual([
      'ひゃ・ひゅ・ひょ',
      'びゃ・びゅ・びょ',
      'ぴゃ・ぴゅ・ぴょ',
    ])
    expect(ROWS_BY_ID['youon-katakana-ha-row'].displayLines).toEqual([
      'ヒャ・ヒュ・ヒョ',
      'ビャ・ビュ・ビョ',
      'ピャ・ピュ・ピョ',
    ])
  })

  it('leaves single-group rows on the label fallback', () => {
    expect(ROWS_BY_ID['a-row'].displayLines).toBeUndefined()
    expect(ROWS_BY_ID['na-row'].displayLines).toBeUndefined()
    expect(ROWS_BY_ID['sokuon-row'].displayLines).toBeUndefined()
  })
})

// Issue #13: がくせい/せんせい/いもうと were moved from plain hiragana rows
// to chōon rows, since their readings are actually long-vowel (chōon)
// patterns rather than "just" characters already taught by that row. The id
// prefix encodes the row, so the move changed their ids too (see
// progressStore.ts's v7 -> v8 migration for preserving existing Review
// state under the old ids).
describe('がくせい/せんせい/いもうと moved to chōon (Issue #13)', () => {
  it('are no longer present in their old hiragana rows', () => {
    expect(WORDS_BY_ROW['sa-row']?.some((w) => w.id === 'sa-gakusei')).toBe(false)
    expect(WORDS_BY_ROW['wa-row']?.some((w) => w.id === 'wa-sensei')).toBe(false)
    expect(WORDS_BY_ROW['ma-row']?.some((w) => w.id === 'ma-imouto')).toBe(false)
    expect(WORDS_BY_ID['sa-gakusei']).toBeUndefined()
    expect(WORDS_BY_ID['wa-sensei']).toBeUndefined()
    expect(WORDS_BY_ID['ma-imouto']).toBeUndefined()
  })

  it('all 3 words exist under their new ids in the chōon rows, with meaning/kana preserved', () => {
    expect(WORDS_BY_ID['chouon-e-gakusei']).toMatchObject({ kana: 'がくせい', meaning: 'student' })
    expect(WORDS_BY_ID['chouon-e-sensei']).toMatchObject({ kana: 'せんせい', meaning: 'teacher' })
    expect(WORDS_BY_ID['chouon-o-imouto']).toMatchObject({ kana: 'いもうと', meaning: 'younger sister' })
    expect(WORDS_BY_ROW['chouon-e-row']?.some((w) => w.id === 'chouon-e-gakusei')).toBe(true)
    expect(WORDS_BY_ROW['chouon-e-row']?.some((w) => w.id === 'chouon-e-sensei')).toBe(true)
    expect(WORDS_BY_ROW['chouon-o-row']?.some((w) => w.id === 'chouon-o-imouto')).toBe(true)
  })
})

// Special Katakana (see curriculum.ts's SPECIAL_KATAKANA_CATEGORY_ID) —
// own category, presented as a continuation of the SAME /youon page. See
// App.test.tsx for the actual page-rendering coverage of the bundling
// itself; this file covers the underlying data/helpers.
describe('Special Katakana category (curriculum data)', () => {
  it('is a character-set category depending on katakana + yōon + sokuon only (not hiragana or chōon)', () => {
    const category = CATEGORIES_BY_ID['special-katakana']
    expect(category).toBeDefined()
    expect(category.learnStyle).toBe('character-set')
    expect(category.dependsOnCategoryIds).toEqual(expect.arrayContaining(['katakana', 'youon', 'sokuon']))
    expect(category.dependsOnCategoryIds).not.toContain('hiragana')
    expect(category.dependsOnCategoryIds).not.toContain('chouon')
  })

  it('comes immediately after Yōon in CATEGORIES declaration order (Recommended Path walks this order)', () => {
    const ids = CATEGORIES.map((c) => c.id)
    const youonIndex = ids.indexOf('youon')
    expect(ids[youonIndex + 1]).toBe('special-katakana')
  })

  it('has exactly 2 sessions (own order 0 and 1), 6 characters each', () => {
    const rows = ROWS.filter((r) => r.categoryId === 'special-katakana' && !r.isSummary)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.order)).toEqual([0, 1])
    for (const row of rows) expect(row.characterIds).toHaveLength(6)
  })

  it('has exactly 12 characters total, each a 2-glyph mora (one learning target = one mora, same as yōon)', () => {
    const chars = CHARACTERS.filter((c) => c.rowId === 'special-katakana-fa-row' || c.rowId === 'special-katakana-she-row')
    expect(chars).toHaveLength(12)
    for (const c of chars) {
      expect([...c.kana], `"${c.id}" (${c.kana}) should be exactly 2 glyphs`).toHaveLength(2)
    }
  })

  it('has exactly 13 words in session 1 and 9 in session 2 (22 total, fixed scope)', () => {
    expect(WORDS_BY_ROW['special-katakana-fa-row']).toHaveLength(13)
    expect(WORDS_BY_ROW['special-katakana-she-row']).toHaveLength(9)
  })

  it('cumulative pool for session 1 includes katakana/yōon/sokuon characters it needs, but not hiragana', () => {
    const cumulative = getCumulativeCharacterIds('special-katakana-fa-row')
    expect(cumulative).toEqual(expect.arrayContaining(['katakana-a', 'katakana-gyu', 'sokuon', 'katakana-sokuon']))
    expect(cumulative).not.toEqual(expect.arrayContaining(['a', 'ka'])) // no hiragana
  })

  it('session 2\'s cumulative pool includes session 1\'s own characters too (same-category, order-scoped)', () => {
    const cumulative = getCumulativeCharacterIds('special-katakana-she-row')
    expect(cumulative).toEqual(expect.arrayContaining(['katakana-fa', 'katakana-ti']))
  })

  it('katakana-special-wo (ウォ) is a distinct id from the existing katakana-wo (ヲ)', () => {
    expect(CHARACTERS_BY_ID['katakana-special-wo']?.kana).toBe('ウォ')
    expect(CHARACTERS_BY_ID['katakana-wo']?.kana).toBe('ヲ')
    expect(CHARACTERS_BY_ID['katakana-special-wo']).not.toBe(CHARACTERS_BY_ID['katakana-wo'])
  })

  it('the existing All Yōon summary row is unchanged — still only aggregates the youon category, never special-katakana', () => {
    const youonSummary = ROWS_BY_ID['youon-summary']
    expect(youonSummary).toBeDefined()
    // None of the 12 Special Katakana character ids leaked into "All Yōon".
    const specialIds = CHARACTERS.filter(
      (c) => c.rowId === 'special-katakana-fa-row' || c.rowId === 'special-katakana-she-row',
    ).map((c) => c.id)
    for (const id of specialIds) expect(youonSummary.characterIds).not.toContain(id)
  })

  it('getNextRowId crosses from Yōon\'s last row into Special Katakana session 1 (the one confirmed cross-category exception)', () => {
    expect(getNextRowId('youon-katakana-ma-ra-row')).toBe('special-katakana-fa-row')
    expect(getPreviousRowId('special-katakana-fa-row')).toBe('youon-katakana-ma-ra-row')
  })

  it('getNextRowId still stops at every OTHER category boundary (no general cross-category walk reopened)', () => {
    // The true last row in each of these categories (summary rows included)
    // still has no next row — no OTHER category boundary gained a jump.
    expect(getNextRowId('katakana-summary')).toBeNull()
    expect(getNextRowId('other-summary')).toBeNull()
  })

  it('session 1 -> session 2 is a normal same-category link', () => {
    expect(getNextRowId('special-katakana-fa-row')).toBe('special-katakana-she-row')
    expect(getPreviousRowId('special-katakana-she-row')).toBe('special-katakana-fa-row')
  })

  it('special-katakana-she-row (the last row) has no next row', () => {
    expect(getNextRowId('special-katakana-she-row')).toBeNull()
  })
})

// Vocabulary illustrations, added 2026-08-29 (see design/images/word-
// illustrations/special-katakana-chatgpt-2026-08-29/) for 21 of the 22
// Special Katakana words — シェア is intentionally still image-less.
describe('Special Katakana word illustrations', () => {
  it('21 of the 22 words have an image; special-katakana-she-shea does not', () => {
    const words = [...WORDS_BY_ROW['special-katakana-fa-row'], ...WORDS_BY_ROW['special-katakana-she-row']]
    expect(words).toHaveLength(22)
    const withImage = words.filter((w) => !!w.image)
    expect(withImage).toHaveLength(21)
    expect(WORDS_BY_ID['special-katakana-she-shea'].image).toBeUndefined()
  })

  it('every image path points at word-icons/<own id>.webp', () => {
    const words = [...WORDS_BY_ROW['special-katakana-fa-row'], ...WORDS_BY_ROW['special-katakana-she-row']]
    for (const word of words.filter((w) => w.image)) {
      expect(word.image).toBe(`word-icons/${word.id}.webp`)
    }
  })
})
