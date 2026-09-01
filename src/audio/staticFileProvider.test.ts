import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaticFileProvider } from './staticFileProvider'

// jsdom doesn't implement real media playback, so HTMLMediaElement.play is
// stubbed here — these tests exercise the provider's request/response
// contract (resolve on success, reject with the clip identified on
// failure), not actual audio decoding.
describe('StaticFileProvider', () => {
  let playSpy: ReturnType<typeof vi.spyOn>

  function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise
      reject = rejectPromise
    })
    return { promise, resolve, reject }
  }

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
    expect(audioEl.src).toContain('audio/characters/ka.mp3')
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

  it('quietly resolves an old play rejection after a newer request supersedes it', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    playSpy.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    const provider = new StaticFileProvider()

    const oldRequest = provider.speak({ key: 'characters/a', text: 'あ' }, { volume: 1, rate: 1 })
    const currentRequest = provider.speak({ key: 'characters/i', text: 'い' }, { volume: 1, rate: 1 })
    first.reject(new DOMException('superseded', 'AbortError'))

    await expect(oldRequest).resolves.toBeUndefined()
    second.resolve()
    await expect(currentRequest).resolves.toBeUndefined()
  })

  it('still rejects when the current request fails', async () => {
    playSpy.mockRejectedValueOnce(new Error('decode failed'))
    const provider = new StaticFileProvider()
    await expect(provider.speak({ key: 'characters/a', text: 'あ' }, { volume: 1, rate: 1 })).rejects.toThrow('decode failed')
  })

  it('stops playback, rewinds, and neutralizes a pending request', async () => {
    const pending = deferred<void>()
    playSpy.mockReturnValueOnce(pending.promise)
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const provider = new StaticFileProvider()
    const request = provider.speak({ key: 'characters/a', text: 'あ' }, { volume: 1, rate: 1 })
    const audioEl = playSpy.mock.instances[0] as HTMLAudioElement
    provider.stop()
    expect(pauseSpy).toHaveBeenCalledWith()
    expect(audioEl.currentTime).toBe(0)
    pending.reject(new Error('stopped'))
    await expect(request).resolves.toBeUndefined()
    pauseSpy.mockRestore()
  })

  it('settles a completion waiter when playback is stopped', async () => {
    const provider = new StaticFileProvider()
    await provider.speak({ key: 'characters/a', text: 'あ' }, { volume: 1, rate: 1 })
    const completion = provider.waitForEnd()
    provider.stop()
    await expect(completion).resolves.toBeUndefined()
  })
})
