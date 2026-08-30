import { describe, expect, it } from 'vitest'
import type { AnchorWord } from '../data/types'
import { pickDistractorCharIds, pickDistractorWords } from './distractorPicker'

describe('pickDistractorCharIds', () => {
  it('never includes a target character id', () => {
    const pool = ['nu', 'me', 'wa', 're', 'ne', 'a', 'i', 'u']
    for (let i = 0; i < 20; i++) {
      const picks = pickDistractorCharIds(['nu'], pool, 3)
      expect(picks).not.toContain('nu')
    }
  })

  it('returns up to `count` distinct ids drawn from the pool', () => {
    const pool = ['nu', 'me', 'wa', 're', 'ne', 'a', 'i', 'u']
    const picks = pickDistractorCharIds(['nu'], pool, 3)
    expect(picks.length).toBe(3)
    expect(new Set(picks).size).toBe(picks.length)
    for (const id of picks) expect(pool).toContain(id)
  })

  it('returns fewer than `count` when the pool (minus targets) is smaller than count', () => {
    const picks = pickDistractorCharIds(['a'], ['a', 'i'], 5)
    expect(picks).toEqual(['i'])
  })

  it('prefers confusable ids over unrelated ones when both are available', () => {
    // nu's confusable set (me/wa/re/ne) all sit in the pool alongside clearly
    // unrelated characters — with count capped to the confusable set's size,
    // only confusable ids should come back.
    const pool = ['nu', 'me', 'wa', 're', 'ne', 'a', 'i', 'u', 'e', 'o']
    const picks = pickDistractorCharIds(['nu'], pool, 4)
    expect(new Set(picks)).toEqual(new Set(['me', 'wa', 're', 'ne']))
  })
})

function word(id: string, characterIds: string[]): AnchorWord {
  return { id, kana: '', romaji: '', meaning: '', image: '', characterIds }
}

describe('pickDistractorWords', () => {
  it('never includes the target word itself', () => {
    const target = word('target', ['a'])
    const candidates = [target, word('b', ['i']), word('c', ['u']), word('d', ['e'])]
    for (let i = 0; i < 20; i++) {
      const picks = pickDistractorWords(target, candidates, 3)
      expect(picks.map((w) => w.id)).not.toContain('target')
    }
  })

  it('prefers words sharing a confusable character over words that do not', () => {
    const target = word('target', ['nu'])
    const confusable = word('confusable', ['me']) // me is confusable with nu
    const unrelated = word('unrelated', ['a'])
    const picks = pickDistractorWords(target, [target, confusable, unrelated], 1)
    expect(picks.map((w) => w.id)).toEqual(['confusable'])
  })

  it('caps results at `count`', () => {
    const target = word('target', ['a'])
    const candidates = [target, word('b', ['i']), word('c', ['u']), word('d', ['e'])]
    expect(pickDistractorWords(target, candidates, 2)).toHaveLength(2)
  })
})
