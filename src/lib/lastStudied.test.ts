import { describe, expect, it } from 'vitest'
import { matchResumableRoute, resumeHref } from './lastStudied'

describe('matchResumableRoute (Issue #23)', () => {
  it('matches Learn for a real row', () => {
    expect(matchResumableRoute('/learn/hiragana/a-row')).toEqual({
      categoryId: 'hiragana',
      rowId: 'a-row',
      activity: 'learn',
    })
  })

  it.each([
    ['tracing', 'tracing'],
    ['kana-quiz', 'kanaQuiz'],
    ['listening', 'listening'],
    ['word-builder', 'wordBuilder'],
    ['kana-typing', 'kanaTyping'],
  ])('matches %s for a real row', (segment, activity) => {
    expect(matchResumableRoute(`/practice/hiragana/a-row/${segment}`)).toEqual({
      categoryId: 'hiragana',
      rowId: 'a-row',
      activity,
    })
  })

  it('does not match the Practice Hub itself (a menu, not an activity)', () => {
    expect(matchResumableRoute('/practice/hiragana/a-row')).toBeNull()
  })

  it('does not match any Review route', () => {
    expect(matchResumableRoute('/practice/review')).toBeNull()
    expect(matchResumableRoute('/practice/review/kana-quiz')).toBeNull()
    expect(matchResumableRoute('/practice/review/listening')).toBeNull()
    expect(matchResumableRoute('/practice/review/word-builder')).toBeNull()
    expect(matchResumableRoute('/practice/review/kana-typing')).toBeNull()
    expect(matchResumableRoute('/practice/review/learn-chars')).toBeNull()
  })

  it('does not match a summary row', () => {
    expect(matchResumableRoute('/learn/hiragana/hiragana-summary')).toBeNull()
    expect(matchResumableRoute('/practice/hiragana/hiragana-summary/listening')).toBeNull()
  })

  it('does not match an unknown row id', () => {
    expect(matchResumableRoute('/learn/hiragana/not-a-real-row')).toBeNull()
  })

  it('does not match a categoryId that disagrees with the row\'s actual category', () => {
    expect(matchResumableRoute('/learn/katakana/a-row')).toBeNull()
  })

  it('does not match unrelated screens', () => {
    expect(matchResumableRoute('/')).toBeNull()
    expect(matchResumableRoute('/settings')).toBeNull()
    expect(matchResumableRoute('/about')).toBeNull()
    expect(matchResumableRoute('/hiragana')).toBeNull()
    expect(matchResumableRoute('/review')).toBeNull()
  })
})

describe('resumeHref', () => {
  it('links Learn back to /learn/:categoryId/:rowId', () => {
    expect(resumeHref({ categoryId: 'hiragana', rowId: 'a-row', activity: 'learn' })).toBe('/learn/hiragana/a-row')
  })

  it('links each game activity back to its own practice route', () => {
    expect(resumeHref({ categoryId: 'hiragana', rowId: 'a-row', activity: 'kanaQuiz' })).toBe(
      '/practice/hiragana/a-row/kana-quiz',
    )
    expect(resumeHref({ categoryId: 'hiragana', rowId: 'a-row', activity: 'wordBuilder' })).toBe(
      '/practice/hiragana/a-row/word-builder',
    )
  })
})
