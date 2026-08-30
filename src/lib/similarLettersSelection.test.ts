import { describe, expect, it } from 'vitest'
import {
  buildGroupBalancedPicks,
  buildSimilarLettersSpellingChoices,
  buildSimilarLettersTargetQueue,
  buildSimilarLettersWordQueue,
  getGroupMates,
  pickSimilarLettersDistractorCharIds,
  type Rng,
} from './similarLettersSelection'

// Deterministic PRNG (mulberry32) so every test below asserts an exact,
// reproducible sequence instead of relying on statistical fuzziness — see
// the Issue's "seeded RNG / injected RNG / deterministic sampler" rule.
function seededRng(seed: number): Rng {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GROUPS = [
  ['shi', 'tsu'],
  ['su', 'nu'],
  ['ko', 'yu'],
]

describe('buildGroupBalancedPicks', () => {
  it('cycles every group before repeating any group, across multiple full cycles', () => {
    const rng = seededRng(1)
    const picks = buildGroupBalancedPicks(GROUPS, 30, rng)
    // Every pick must belong to one of the known groups.
    const known = new Set(GROUPS.flat())
    for (const p of picks) expect(known.has(p)).toBe(true)

    // Split into chunks of 3 (one full cycle each, since there are 3
    // groups) and verify each chunk touches all 3 groups at least once —
    // "no group can dominate or go missing within a cycle."
    for (let i = 0; i < picks.length; i += 3) {
      const chunk = picks.slice(i, i + 3)
      if (chunk.length < 3) continue
      const groupsTouched = new Set(chunk.map((c) => GROUPS.findIndex((g) => g.includes(c))))
      expect(groupsTouched.size, `cycle starting at index ${i}`).toBe(3)
    }
  })

  it('is reproducible for the same seed (deterministic, not flaky)', () => {
    const picksA = buildGroupBalancedPicks(GROUPS, 12, seededRng(42))
    const picksB = buildGroupBalancedPicks(GROUPS, 12, seededRng(42))
    expect(picksA).toEqual(picksB)
  })

  it('skips empty groups entirely', () => {
    const withEmpty = [['a'], [], ['b']]
    const picks = buildGroupBalancedPicks(withEmpty, 20, seededRng(7))
    expect(picks.every((p) => p === 'a' || p === 'b')).toBe(true)
  })

  it('avoids an immediate repeat of the same character when the group offers an alternative', () => {
    const rng = seededRng(3)
    const picks = buildGroupBalancedPicks([['x', 'y']], 50, rng)
    for (let i = 1; i < picks.length; i++) {
      expect(picks[i], `index ${i}`).not.toBe(picks[i - 1])
    }
  })
})

describe('buildSimilarLettersTargetQueue', () => {
  it('is approximately 80% group members / 20% normal pool over a large sample', () => {
    const normalPool = ['normal-1', 'normal-2', 'normal-3']
    const queue = buildSimilarLettersTargetQueue(GROUPS, normalPool, 200, seededRng(11))
    const groupIds = new Set(GROUPS.flat())
    const similarCount = queue.filter((id) => groupIds.has(id)).length
    const ratio = similarCount / queue.length
    expect(ratio).toBeGreaterThan(0.7)
    expect(ratio).toBeLessThan(0.9)
  })

  it('every confusion group appears somewhere in a reasonably long queue (no group starved)', () => {
    const queue = buildSimilarLettersTargetQueue(GROUPS, ['normal-1'], 60, seededRng(5))
    for (const group of GROUPS) {
      expect(group.some((id) => queue.includes(id)), `group ${group.join('/')}`).toBe(true)
    }
  })

  it('has no immediate repeats', () => {
    const queue = buildSimilarLettersTargetQueue(GROUPS, ['normal-1', 'normal-2'], 40, seededRng(9))
    for (let i = 1; i < queue.length; i++) expect(queue[i]).not.toBe(queue[i - 1])
  })

  it('is deterministic for a given seed', () => {
    const a = buildSimilarLettersTargetQueue(GROUPS, ['normal-1'], 15, seededRng(99))
    const b = buildSimilarLettersTargetQueue(GROUPS, ['normal-1'], 15, seededRng(99))
    expect(a).toEqual(b)
  })
})

describe('buildSimilarLettersWordQueue', () => {
  type W = { id: string; characterIds: string[] }
  const targetWords: W[] = [
    { id: 'w-shi', characterIds: ['shi'] },
    { id: 'w-tsu', characterIds: ['tsu'] },
    { id: 'w-su', characterIds: ['su'] },
  ]
  const normalWords: W[] = [{ id: 'w-normal-1', characterIds: ['x'] }]

  it('is approximately 80/20 target/normal', () => {
    const queue = buildSimilarLettersWordQueue(GROUPS, targetWords, normalWords, 200, seededRng(2))
    const targetIds = new Set(targetWords.map((w) => w.id))
    const ratio = queue.filter((id) => targetIds.has(id)).length / queue.length
    expect(ratio).toBeGreaterThan(0.7)
    expect(ratio).toBeLessThan(0.9)
  })

  it('falls back gracefully when a group has no matching words at all', () => {
    const queue = buildSimilarLettersWordQueue(GROUPS, targetWords, normalWords, 20, seededRng(4))
    expect(queue.length).toBeGreaterThan(0)
  })

  it('always returns exactly `count` items, even when one side of the pool is empty', () => {
    expect(buildSimilarLettersWordQueue(GROUPS, targetWords, [], 15, seededRng(1)).length).toBe(15)
    expect(buildSimilarLettersWordQueue(GROUPS, targetWords, [], 8, seededRng(2)).length).toBe(8)
    expect(buildSimilarLettersWordQueue(GROUPS, [], normalWords, 8, seededRng(3)).length).toBe(8)
  })
})

describe('buildSimilarLettersTargetQueue round-length guarantee', () => {
  it('always returns exactly `count` items, even with an empty normal pool', () => {
    expect(buildSimilarLettersTargetQueue(GROUPS, [], 15, seededRng(1)).length).toBe(15)
    expect(buildSimilarLettersTargetQueue(GROUPS, [], 8, seededRng(2)).length).toBe(8)
  })
})

// Asserts the actual bug fix: the final queue must never reshuffle the
// group-cycle order buildGroupBalancedPicks produced for the Similar-target
// items — filtering the final queue down to just those items must exactly
// reproduce that order, with Normal-target items freely interleaved
// anywhere around/between them.
describe('buildSimilarLettersTargetQueue preserves group-cycle order in the final queue', () => {
  function groupIndexOf(id: string): number {
    return GROUPS.findIndex((g) => g.includes(id))
  }

  it('the Similar-target subsequence of the final queue is periodic by full group-cycles', () => {
    const normalPool = ['normal-1', 'normal-2']
    const queue = buildSimilarLettersTargetQueue(GROUPS, normalPool, 60, seededRng(17))
    const groupIds = new Set(GROUPS.flat())
    const similarSubsequence = queue.filter((id) => groupIds.has(id))

    // Every full cycle (chunk of GROUPS.length) touches each group exactly
    // once — matching buildGroupBalancedPicks's own per-cycle shuffle
    // behavior (a full permutation of all group indices per cycle).
    for (let i = 0; i < similarSubsequence.length; i += GROUPS.length) {
      const chunk = similarSubsequence.slice(i, i + GROUPS.length)
      if (chunk.length < GROUPS.length) continue
      const indices = chunk.map(groupIndexOf)
      expect(new Set(indices).size, `cycle starting at index ${i}`).toBe(GROUPS.length)
    }
  })

  it('matches buildGroupBalancedPicks called directly with the same rng seed/sequence', () => {
    // Build the Similar sequence directly via buildGroupBalancedPicks with a
    // fresh seeded rng, then build the final interleaved queue with a fresh
    // rng of the same seed. Because the queue is empty of normal picks (pool
    // empty), the two should consume the rng identically and produce the
    // exact same Similar-only sequence.
    const count = 24
    const direct = buildGroupBalancedPicks(GROUPS, count, seededRng(31))
    const queue = buildSimilarLettersTargetQueue(GROUPS, [], count, seededRng(31))
    expect(queue).toEqual(direct)
  })

  it('padding when the normal pool is insufficient extends the group cycle rather than going flat-random', () => {
    // No normal pool at all -> the entire queue is Similar-target items,
    // and must still respect full group-cycle ordering even though this
    // exceeds one buildGroupBalancedPicks cycle.
    const queue = buildSimilarLettersTargetQueue(GROUPS, [], 90, seededRng(41))
    expect(queue.length).toBe(90)
    const groupIds = new Set(GROUPS.flat())
    expect(queue.every((id) => groupIds.has(id))).toBe(true)
    for (let i = 0; i < queue.length; i += GROUPS.length) {
      const chunk = queue.slice(i, i + GROUPS.length)
      if (chunk.length < GROUPS.length) continue
      expect(new Set(chunk.map(groupIndexOf)).size, `cycle starting at index ${i}`).toBe(GROUPS.length)
    }
  })
})

describe('buildSimilarLettersWordQueue preserves group-cycle order in the final queue', () => {
  type W = { id: string; characterIds: string[] }
  // One word per character across all 3 groups, so every group has exactly
  // one matching word — makes the word-id -> group-index mapping unambiguous.
  const wordGroups: W[] = [
    { id: 'w-shi', characterIds: ['shi'] },
    { id: 'w-tsu', characterIds: ['tsu'] },
    { id: 'w-su', characterIds: ['su'] },
    { id: 'w-nu', characterIds: ['nu'] },
    { id: 'w-ko', characterIds: ['ko'] },
    { id: 'w-yu', characterIds: ['yu'] },
  ]
  const normalWords: W[] = [
    { id: 'w-normal-1', characterIds: ['x'] },
    { id: 'w-normal-2', characterIds: ['y'] },
  ]

  function groupIndexOfWord(id: string): number {
    const charId = wordGroups.find((w) => w.id === id)?.characterIds[0]
    if (charId === undefined) return -1
    return GROUPS.findIndex((g) => g.includes(charId))
  }

  it('the target-word subsequence of the final queue is periodic by full group-cycles', () => {
    const queue = buildSimilarLettersWordQueue(GROUPS, wordGroups, normalWords, 60, seededRng(23))
    const targetIds = new Set(wordGroups.map((w) => w.id))
    const targetSubsequence = queue.filter((id) => targetIds.has(id))

    for (let i = 0; i < targetSubsequence.length; i += GROUPS.length) {
      const chunk = targetSubsequence.slice(i, i + GROUPS.length)
      if (chunk.length < GROUPS.length) continue
      const indices = chunk.map(groupIndexOfWord)
      expect(new Set(indices).size, `cycle starting at index ${i}`).toBe(GROUPS.length)
    }
  })

  it('padding when the normal word pool is insufficient extends the group cycle rather than going flat-random', () => {
    const queue = buildSimilarLettersWordQueue(GROUPS, wordGroups, [], 90, seededRng(29))
    expect(queue.length).toBe(90)
    const targetIds = new Set(wordGroups.map((w) => w.id))
    expect(queue.every((id) => targetIds.has(id))).toBe(true)
    for (let i = 0; i < queue.length; i += GROUPS.length) {
      const chunk = queue.slice(i, i + GROUPS.length)
      if (chunk.length < GROUPS.length) continue
      expect(new Set(chunk.map(groupIndexOfWord)).size, `cycle starting at index ${i}`).toBe(GROUPS.length)
    }
  })
})

describe('getGroupMates', () => {
  it('returns every OTHER member of the same group', () => {
    expect(getGroupMates(GROUPS, 'shi')).toEqual(['tsu'])
    expect(getGroupMates(GROUPS, 'ko')).toEqual(['yu'])
  })

  it('returns an empty array for an id not in any group', () => {
    expect(getGroupMates(GROUPS, 'unrelated')).toEqual([])
  })
})

describe('pickSimilarLettersDistractorCharIds', () => {
  it('always includes at least one same-group mate when one is available in the pool', () => {
    const pool = ['shi', 'tsu', 'su', 'nu', 'ko', 'yu']
    for (let seed = 0; seed < 20; seed++) {
      const distractors = pickSimilarLettersDistractorCharIds(['shi'], GROUPS, pool, 3, seededRng(seed))
      expect(distractors, `seed ${seed}`).toContain('tsu')
    }
  })

  it('never includes the target itself', () => {
    const pool = ['shi', 'tsu', 'su', 'nu']
    const distractors = pickSimilarLettersDistractorCharIds(['shi'], GROUPS, pool, 3, seededRng(1))
    expect(distractors).not.toContain('shi')
  })

  it('prioritizes: own group mate, then other confusion-group characters, then normal characters', () => {
    const pool = ['shi', 'tsu', 'su', 'nu', 'ko', 'yu', 'normal-1', 'normal-2']
    const distractors = pickSimilarLettersDistractorCharIds(['shi'], GROUPS, pool, 3, seededRng(5))
    // Exactly 3 slots: the one mate (tsu) must come first-tier, then two
    // other-group characters (su/nu/ko/yu) must fill before any normal char.
    expect(distractors).toContain('tsu')
    expect(distractors).not.toContain('normal-1')
    expect(distractors).not.toContain('normal-2')
  })

  it('falls back to normal characters once mates and other-group characters are exhausted', () => {
    const pool = ['shi', 'tsu', 'normal-1', 'normal-2']
    const distractors = pickSimilarLettersDistractorCharIds(['shi'], GROUPS, pool, 3, seededRng(6))
    expect(distractors).toContain('tsu')
    expect(distractors).toContain('normal-1')
    expect(distractors).toContain('normal-2')
  })
})

describe('buildSimilarLettersSpellingChoices', () => {
  // おこのみやき — o/ko/no/mi/ya/ki — confusion groups involved: お/あ (o/a),
  // か/や (ka/ya), き/さ/ち (ki/sa/chi). Uses the real hiragana groups (not
  // the toy GROUPS fixture above) since the point is exercising real
  // same-group substitution candidates for this exact word.
  const HIRAGANA_GROUPS = [
    ['a', 'o'],
    ['ki', 'sa', 'chi'],
    ['nu', 'me'],
    ['ne', 'wa', 're'],
    ['ha', 'ho', 'ma'],
    ['ka', 'ya'],
    ['ru', 'ro'],
  ]
  const KANA_BY_ID: Record<string, string> = {
    a: 'あ',
    o: 'お',
    ko: 'こ',
    no: 'の',
    mi: 'み',
    ya: 'や',
    ki: 'き',
    sa: 'さ',
    chi: 'ち',
    ka: 'か',
  }
  const kanaById = (id: string) => KANA_BY_ID[id] ?? ''
  const okonomiyaki = { id: 'fixture-okonomiyaki', characterIds: ['o', 'ko', 'no', 'mi', 'ya', 'ki'] }
  const hiraganaPool = Object.keys(KANA_BY_ID)

  it('generates plausible same-group substitutions (a, b: correct spelling in fixture data)', () => {
    const seenKana = new Set<string>()
    for (let seed = 0; seed < 30; seed++) {
      const choices = buildSimilarLettersSpellingChoices(okonomiyaki, HIRAGANA_GROUPS, kanaById, hiraganaPool, 4, seededRng(seed))
      choices.forEach((c) => seenKana.add(c.kana))
    }
    // Same-group substitutions should be preferred over random fallback —
    // at least one of the classic same-group variants should appear.
    const plausible = ['あこのみやき', 'おこのみかき', 'おこのみやさ', 'おこのみやち']
    expect(plausible.some((p) => seenKana.has(p))).toBe(true)
  })

  it('produces exactly 1 correct + 3 unique wrong = 4 unique choices (b, c, d, f)', () => {
    const choices = buildSimilarLettersSpellingChoices(okonomiyaki, HIRAGANA_GROUPS, kanaById, hiraganaPool, 4, seededRng(1))
    expect(choices.length).toBe(4)
    expect(choices.filter((c) => c.isCorrect).length).toBe(1)
    const correctKana = choices.find((c) => c.isCorrect)!.kana
    expect(correctKana).toBe('おこのみやき')
    const wrong = choices.filter((c) => !c.isCorrect)
    expect(wrong.length).toBe(3)
    wrong.forEach((w) => expect(w.kana).not.toBe(correctKana))
    const allKana = choices.map((c) => c.kana)
    expect(new Set(allKana).size).toBe(allKana.length)
  })

  it('every choice has the same kana length as the correct spelling (e)', () => {
    const choices = buildSimilarLettersSpellingChoices(okonomiyaki, HIRAGANA_GROUPS, kanaById, hiraganaPool, 4, seededRng(2))
    choices.forEach((c) => expect(Array.from(c.kana).length).toBe(Array.from('おこのみやき').length))
  })

  it('falls back to same-script random substitution when same-group candidates are insufficient (g)', () => {
    // A word with no confusion-group characters at all forces straight to
    // tier 3/4 (no group mates available for any position).
    const plainWord = { id: 'fixture-plain', characterIds: ['no', 'mi'] }
    const choices = buildSimilarLettersSpellingChoices(plainWord, HIRAGANA_GROUPS, kanaById, hiraganaPool, 4, seededRng(3))
    expect(choices.length).toBe(4)
    expect(choices.filter((c) => c.isCorrect).length).toBe(1)
  })

  it('never substitutes in a katakana character for a hiragana word (h)', () => {
    const choices = buildSimilarLettersSpellingChoices(okonomiyaki, HIRAGANA_GROUPS, kanaById, hiraganaPool, 4, seededRng(4))
    const katakanaRange = /[゠-ヿ]/
    choices.forEach((c) => expect(katakanaRange.test(c.kana)).toBe(false))
  })

  it('never substitutes in a hiragana character for a katakana word (i)', () => {
    const KATAKANA_KANA_BY_ID: Record<string, string> = {
      'katakana-a': 'ア',
      'katakana-ma': 'マ',
      'katakana-ta': 'タ',
      'katakana-ku': 'ク',
    }
    const katakanaGroups = [['katakana-a', 'katakana-ma'], ['katakana-ta', 'katakana-ku']]
    const katakanaWord = { id: 'fixture-katakana', characterIds: ['katakana-a', 'katakana-ta'] }
    const choices = buildSimilarLettersSpellingChoices(
      katakanaWord,
      katakanaGroups,
      (id) => KATAKANA_KANA_BY_ID[id] ?? '',
      Object.keys(KATAKANA_KANA_BY_ID),
      4,
      seededRng(5),
    )
    const hiraganaRange = /[぀-ゟ]/
    choices.forEach((c) => expect(hiraganaRange.test(c.kana)).toBe(false))
  })

  it('creates no fake AnchorWord/id object — choices are plain {key, kana, isCorrect} (j)', () => {
    const choices = buildSimilarLettersSpellingChoices(okonomiyaki, HIRAGANA_GROUPS, kanaById, hiraganaPool, 4, seededRng(6))
    choices.forEach((c) => {
      expect(Object.keys(c).sort()).toEqual(['isCorrect', 'kana', 'key'])
      expect(c.key).not.toBe(okonomiyaki.id)
    })
  })

  it('is deterministic for a given seed', () => {
    const a = buildSimilarLettersSpellingChoices(okonomiyaki, HIRAGANA_GROUPS, kanaById, hiraganaPool, 4, seededRng(77))
    const b = buildSimilarLettersSpellingChoices(okonomiyaki, HIRAGANA_GROUPS, kanaById, hiraganaPool, 4, seededRng(77))
    expect(a).toEqual(b)
  })

  // Regression: the Tier 3/4 fallback pool used to include composite yōon
  // characters (きゃ/しゃ/キャ/シャ etc. — `kana` spanning more than one
  // Unicode code point). Substituting one of those into a single-glyph
  // position (or substituting a single-glyph candidate into a composite
  // yōon position) changes the fabricated spelling's code-point length
  // relative to the correct spelling, breaking the "same length as correct"
  // invariant every choice must satisfy — e.g. の → きゃ turning "のみ" into
  // "きゃみ". These tests force straight into tiers 3/4 (no confusion-group
  // mates for any position) and assert no length-changing choice is ever
  // produced, across many seeds.
  describe('composite yōon exclusion from Tier 3/4 substitution (no confusion groups available)', () => {
    it('Hiragana: target "のみ" with a pool containing あ/か/きゃ never produces a length-changing choice like "きゃみ"', () => {
      const NOMI_KANA_BY_ID: Record<string, string> = {
        no: 'の',
        mi: 'み',
        a: 'あ',
        ka: 'か',
        kya: 'きゃ',
      }
      const nomi = { id: 'fixture-nomi', characterIds: ['no', 'mi'] }
      const pool = Object.keys(NOMI_KANA_BY_ID)
      for (let seed = 0; seed < 50; seed++) {
        const choices = buildSimilarLettersSpellingChoices(nomi, [], (id) => NOMI_KANA_BY_ID[id] ?? '', pool, 4, seededRng(seed))
        const correctLength = Array.from('のみ').length
        choices.forEach((c) => {
          expect(c.kana).not.toBe('きゃみ')
          expect(c.kana).not.toBe('のきゃ')
          expect(Array.from(c.kana).length, `choice "${c.kana}" (seed ${seed})`).toBe(correctLength)
        })
      }
    })

    it('Katakana: target "ノミ" with a pool containing ア/カ/キャ never produces a length-changing choice like "キャミ"', () => {
      const NOMI_KATAKANA_BY_ID: Record<string, string> = {
        'katakana-no': 'ノ',
        'katakana-mi': 'ミ',
        'katakana-a': 'ア',
        'katakana-ka': 'カ',
        'katakana-kya': 'キャ',
      }
      const nomi = { id: 'fixture-katakana-nomi', characterIds: ['katakana-no', 'katakana-mi'] }
      const pool = Object.keys(NOMI_KATAKANA_BY_ID)
      for (let seed = 0; seed < 50; seed++) {
        const choices = buildSimilarLettersSpellingChoices(
          nomi,
          [],
          (id) => NOMI_KATAKANA_BY_ID[id] ?? '',
          pool,
          4,
          seededRng(seed),
        )
        const correctLength = Array.from('ノミ').length
        choices.forEach((c) => {
          expect(c.kana).not.toBe('キャミ')
          expect(c.kana).not.toBe('ノキャ')
          expect(Array.from(c.kana).length, `choice "${c.kana}" (seed ${seed})`).toBe(correctLength)
        })
      }
    })

    it('never uses a composite yōon character from the "other Similar Letters" groups pool (Tier 3) as a substitution value', () => {
      // A confusion group itself containing a composite character (should
      // never happen by construction for real data, but exercised here
      // defensively) must still never be substituted in for a single-glyph
      // position.
      const KANA_BY_ID: Record<string, string> = { no: 'の', mi: 'み', kya: 'きゃ', a: 'あ' }
      const groupsWithComposite = [['kya', 'a']]
      const nomi = { id: 'fixture-nomi-2', characterIds: ['no', 'mi'] }
      for (let seed = 0; seed < 30; seed++) {
        const choices = buildSimilarLettersSpellingChoices(
          nomi,
          groupsWithComposite,
          (id) => KANA_BY_ID[id] ?? '',
          Object.keys(KANA_BY_ID),
          4,
          seededRng(seed),
        )
        choices.forEach((c) => expect(Array.from(c.kana).length).toBe(Array.from('のみ').length))
      }
    })
  })
})
