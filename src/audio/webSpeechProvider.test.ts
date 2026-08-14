import { describe, expect, it } from 'vitest'
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
  it('rejects when the Web Speech API is unavailable', async () => {
    // jsdom does not implement window.speechSynthesis, so this exercises the
    // real "unsupported browser" path without needing to delete anything.
    const provider = new WebSpeechProvider()
    await expect(provider.speak({ key: 'characters/ka', text: 'か' }, { volume: 1, rate: 1 })).rejects.toBeTruthy()
  })
})
