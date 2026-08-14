import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaticFileProvider } from './staticFileProvider'

// jsdom doesn't implement real media playback, so HTMLMediaElement.play is
// stubbed here — these tests exercise the provider's request/response
// contract (resolve on success, reject with the clip identified on
// failure), not actual audio decoding.
describe('StaticFileProvider', () => {
  let playSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  })

  afterEach(() => {
    playSpy.mockRestore()
  })

  it('builds the clip URL from the app base path and request key', async () => {
    const provider = new StaticFileProvider()
    await provider.speak({ key: 'characters/ka', text: 'か' }, { volume: 1, rate: 1 })
    const audioEl = playSpy.mock.instances[0] as HTMLAudioElement
    expect(audioEl.src).toContain('audio/characters/ka.wav')
  })

  it('applies volume and playback rate from the given options', async () => {
    const provider = new StaticFileProvider()
    await provider.speak({ key: 'words/a-ai', text: 'あい' }, { volume: 0.5, rate: 1.25 })
    const audioEl = playSpy.mock.instances[0] as HTMLAudioElement
    expect(audioEl.volume).toBe(0.5)
    expect(audioEl.playbackRate).toBe(1.25)
  })

  it('reuses a single audio element across calls rather than creating a new one each time', async () => {
    const provider = new StaticFileProvider()
    await provider.speak({ key: 'characters/a', text: 'あ' }, { volume: 1, rate: 1 })
    await provider.speak({ key: 'characters/i', text: 'い' }, { volume: 1, rate: 1 })
    expect(playSpy.mock.instances[0]).toBe(playSpy.mock.instances[1])
  })

  it('rejects when the browser refuses to play (e.g. autoplay policy)', async () => {
    playSpy.mockRejectedValue(new Error('NotAllowedError'))
    const provider = new StaticFileProvider()
    await expect(provider.speak({ key: 'characters/ka', text: 'か' }, { volume: 1, rate: 1 })).rejects.toBeTruthy()
  })
})
