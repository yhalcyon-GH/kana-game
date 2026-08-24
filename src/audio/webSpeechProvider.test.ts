import { describe, expect, it, vi } from 'vitest'
import { pickJapaneseVoice, WebSpeechProvider } from './webSpeechProvider'

function fakeVoice(lang: string, name: string): SpeechSynthesisVoice {
  return { lang, name } as SpeechSynthesisVoice
}

describe('pickJapaneseVoice', () => {
  it('prefers a Natural/Online voice over a plain Japanese voice', () => {
    const voices = [fakeVoice('ja-JP', 'Microsoft Ayumi Desktop'), fakeVoice('ja-JP', 'Microsoft Nanami Online')]
    expect(pickJapaneseVoice(voices)?.name).toBe('Microsoft Nanami Online')
  })

  it('falls back to any Japanese voice when no Natural/Online voice exists', () => {
    const voices = [fakeVoice('en-US', 'Zira'), fakeVoice('ja-JP', 'Ayumi Desktop')]
    expect(pickJapaneseVoice(voices)?.name).toBe('Ayumi Desktop')
  })

  it('returns null when no Japanese voice is available at all', () => {
    expect(pickJapaneseVoice([fakeVoice('en-US', 'Zira')])).toBeNull()
  })

  it('matches any ja-* locale, not just ja-JP', () => {
    expect(pickJapaneseVoice([fakeVoice('ja-JP-x-whatever', 'Some Voice')])).not.toBeNull()
  })
})

describe('WebSpeechProvider', () => {
  it('cancels browser speech when stopped', () => {
    const cancel = vi.fn()
    // @ts-expect-error test API shim
    window.speechSynthesis = { cancel }
    new WebSpeechProvider().stop()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('rejects when the Web Speech API is unavailable', async () => {
    // jsdom does not implement window.speechSynthesis, so this exercises the
    // real "unsupported browser" path without needing to delete anything.
    const provider = new WebSpeechProvider()
    await expect(provider.speak({ key: 'characters/ka', text: 'か' }, { volume: 1, rate: 1 })).rejects.toBeTruthy()
  })

  // Issue #29 (Tamamizu Guide): the fallback must correctly speak English
  // narration, not silently mispronounce it with the app's picked Japanese
  // voice/lang.
  describe('lang handling', () => {
    function withFakeSpeechSynthesis() {
      const spoken: SpeechSynthesisUtterance[] = []
      const fakeSynthesis = { speak: (u: SpeechSynthesisUtterance) => spoken.push(u), cancel: () => {} }
      // @ts-expect-error jsdom has no real speechSynthesis to type against
      window.speechSynthesis = fakeSynthesis
      // @ts-expect-error jsdom has no real SpeechSynthesisUtterance
      window.SpeechSynthesisUtterance = class {
        text: string
        lang = ''
        volume = 1
        rate = 1
        voice: SpeechSynthesisVoice | null = null
        constructor(text: string) {
          this.text = text
        }
      }
      return spoken
    }

    it('defaults to ja-JP and applies the picked Japanese voice when no lang is given (existing behavior)', async () => {
      const spoken = withFakeSpeechSynthesis()
      const provider = new WebSpeechProvider()
      provider.voice = fakeVoice('ja-JP', 'Nanami')
      await provider.speak({ key: 'characters/ka', text: 'か' }, { volume: 1, rate: 1 })
      expect(spoken[0].lang).toBe('ja-JP')
      expect(spoken[0].voice).toBe(provider.voice)
    })

    it('uses the given lang and does NOT apply the Japanese voice for a non-Japanese request', async () => {
      const spoken = withFakeSpeechSynthesis()
      const provider = new WebSpeechProvider()
      provider.voice = fakeVoice('ja-JP', 'Nanami')
      await provider.speak({ key: 'guide/intro-welcome', text: 'Hi!', lang: 'en-US' }, { volume: 1, rate: 1 })
      expect(spoken[0].lang).toBe('en-US')
      expect(spoken[0].voice).toBeNull()
    })
  })
})
