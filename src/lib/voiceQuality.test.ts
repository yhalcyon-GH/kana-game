import { describe, expect, it } from 'vitest'
import { checkPronunciation, classifyScore, type VoiceCheckThresholds } from './voiceQuality'

const THRESHOLDS: VoiceCheckThresholds = { passScore: 90, warningScore: 70 }

describe('classifyScore', () => {
  // Same thresholds shape Azure's AccuracyScore is classified with in
  // scripts/checkVoiceQuality.ts, not just checkPronunciation's own score.
  const T: VoiceCheckThresholds = { passScore: 90, warningScore: 75 }

  it('PASSes at or above passScore', () => {
    expect(classifyScore(90, T)).toBe('PASS')
    expect(classifyScore(100, T)).toBe('PASS')
  })

  it('WARNs between warningScore and passScore', () => {
    expect(classifyScore(75, T)).toBe('WARNING')
    expect(classifyScore(89, T)).toBe('WARNING')
  })

  it('FAILs below warningScore', () => {
    expect(classifyScore(74, T)).toBe('FAIL')
    expect(classifyScore(0, T)).toBe('FAIL')
  })
})

describe('checkPronunciation', () => {
  it('PASSes an exact reading match', () => {
    const result = checkPronunciation('おばあさん', 'おばあさん', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('PASS')
    expect(result.pronunciationScore).toBe(100)
  })

  it('FAILs the documented お祖母さん misreading (おばあさん heard as おそぼさん)', () => {
    const result = checkPronunciation('おばあさん', 'おそぼさん', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('FAIL')
    expect(result.reasons[0]).toContain('おばあさん')
    expect(result.reasons[0]).toContain('おそぼさん')
  })

  it('FAILs a dakuten (voicing) misread — かき heard as がき', () => {
    const result = checkPronunciation('かき', 'がき', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('FAIL')
  })

  it('FAILs a sokuon minimal-pair confusion — おっと heard as おと', () => {
    const result = checkPronunciation('おっと', 'おと', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('FAIL')
  })

  it('FAILs a dropped hatsuon — かばん heard as かば', () => {
    const result = checkPronunciation('かばん', 'かば', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('FAIL')
  })

  it('FAILs a yōon confusion — きゃく heard as かく', () => {
    const result = checkPronunciation('きゃく', 'かく', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('FAIL')
  })

  it('WARNs on a chōon minimal-pair confusion in a longer word — おばあさん heard as おばさん', () => {
    const result = checkPronunciation('おばあさん', 'おばさん', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('WARNING')
  })

  it('normalizes a katakana expected reading to hiragana before comparing', () => {
    const result = checkPronunciation('タコ', 'たこ', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('PASS')
    expect(result.expectedReading).toBe('たこ')
  })

  it('does not throw on an empty detected reading (ASR found nothing)', () => {
    const result = checkPronunciation('ねこ', '', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('FAIL')
    expect(result.detectedReading).toBe('')
  })

  it('normalizes a katakana detected reading to hiragana before comparing', () => {
    const result = checkPronunciation('たこ', 'タコ', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('PASS')
    expect(result.detectedReading).toBe('たこ')
  })

  it('strips ASR punctuation from the detected reading before comparing', () => {
    const result = checkPronunciation('いえ', 'いえ。', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('PASS')
    expect(result.detectedReading).toBe('いえ')
  })
})
