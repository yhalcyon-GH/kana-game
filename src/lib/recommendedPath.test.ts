import { describe, expect, it } from 'vitest'
import { getRecommendedActivity } from './recommendedPath'

const base = {
  learnStyle: 'character-set' as const,
  introCompleted: false,
  kanaQuizCompleted: false,
  listeningCompleted: false,
  wordBuilderCompleted: false,
}

describe('getRecommendedActivity: character-set', () => {
  it('recommends Learn when intro (Learn/Tracing) is not completed', () => {
    expect(getRecommendedActivity(base)).toBe('learn')
  })

  it('recommends Kana Quiz once intro is completed', () => {
    expect(getRecommendedActivity({ ...base, introCompleted: true })).toBe('kana-quiz')
  })

  it('recommends Listening once Kana Quiz is completed', () => {
    expect(getRecommendedActivity({ ...base, introCompleted: true, kanaQuizCompleted: true })).toBe('listening')
  })

  it('recommends Word Builder once Listening is completed', () => {
    expect(
      getRecommendedActivity({ ...base, introCompleted: true, kanaQuizCompleted: true, listeningCompleted: true }),
    ).toBe('word-builder')
  })

  it('is "done" once Word Builder is completed', () => {
    expect(
      getRecommendedActivity({
        ...base,
        introCompleted: true,
        kanaQuizCompleted: true,
        listeningCompleted: true,
        wordBuilderCompleted: true,
      }),
    ).toBe('done')
  })
})

describe('getRecommendedActivity: contrast-pairs (no Kana Quiz step)', () => {
  const contrastBase = { ...base, learnStyle: 'contrast-pairs' as const }

  it('recommends Learn when intro is not completed', () => {
    expect(getRecommendedActivity(contrastBase)).toBe('learn')
  })

  it('recommends Listening directly once intro is completed (Kana Quiz is skipped)', () => {
    expect(getRecommendedActivity({ ...contrastBase, introCompleted: true })).toBe('listening')
  })

  it('recommends Word Builder once Listening is completed', () => {
    expect(getRecommendedActivity({ ...contrastBase, introCompleted: true, listeningCompleted: true })).toBe(
      'word-builder',
    )
  })

  it('is "done" once Word Builder is completed, even though kanaQuizCompleted was never set', () => {
    expect(
      getRecommendedActivity({ ...contrastBase, introCompleted: true, listeningCompleted: true, wordBuilderCompleted: true }),
    ).toBe('done')
  })
})
