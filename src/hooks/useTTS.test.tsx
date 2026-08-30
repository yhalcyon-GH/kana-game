import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProgressStore } from '../store/progressStore'

// Mock both providers at the module/constructor level. useTTS.ts now creates
// ONE StaticFileProvider and ONE WebSpeechProvider as module-level singletons
// (shared by every useTTS() consumer app-wide) instead of one per hook
// instance — see useTTS.ts's top-of-file comment for why. Because the
// singletons are constructed once at module-evaluation time, the constructor
// spies below are called exactly once for the whole test file's import of
// useTTS, no matter how many times renderHook()/useTTS() runs afterward —
// that constant count is itself the regression guard for the bug (many cards
// on screen each accumulating their own real <audio>/AudioContext).
// useTTS.ts now constructs its singleton providers eagerly at module-import
// time (see its top-of-file comment), so the mock factories below run before
// any of this test file's own top-level `const` statements would — hence
// `vi.hoisted` to define the spies ahead of even that eager import.
const { staticSpeak, staticStop, webSpeechSpeak, webSpeechStop } = vi.hoisted(() => ({
  staticSpeak: vi.fn(),
  staticStop: vi.fn(),
  webSpeechSpeak: vi.fn(),
  webSpeechStop: vi.fn(),
}))
vi.mock('../audio/staticFileProvider', () => ({
  StaticFileProvider: vi.fn(function () {
    return { speak: staticSpeak, stop: staticStop }
  }),
}))

vi.mock('../audio/webSpeechProvider', () => ({
  WebSpeechProvider: vi.fn(function () {
    return { speak: webSpeechSpeak, stop: webSpeechStop, voice: null }
  }),
  pickJapaneseVoice: vi.fn().mockReturnValue(null),
}))

import { StaticFileProvider } from '../audio/staticFileProvider'
import { useTTS } from './useTTS'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  staticSpeak.mockReset()
  staticStop.mockReset()
  webSpeechSpeak.mockReset()
  webSpeechStop.mockReset()
})

describe('useTTS (provider-level, PR #54 static-only regression guard)', () => {
  it('speakStaticOnly resolves false and never calls WebSpeechProvider.speak when StaticFileProvider rejects', async () => {
    staticSpeak.mockRejectedValue(new Error('no playable clip'))
    const { result } = renderHook(() => useTTS())

    const started = await result.current.speakStaticOnly('characters/a', 'a')

    expect(started).toBe(false)
    expect(staticSpeak).toHaveBeenCalledTimes(1)
    expect(webSpeechSpeak).not.toHaveBeenCalled()
  })

  it('speakStaticOnly resolves true and never calls WebSpeechProvider.speak when StaticFileProvider resolves', async () => {
    staticSpeak.mockResolvedValue(undefined)
    const { result } = renderHook(() => useTTS())

    const started = await result.current.speakStaticOnly('characters/a', 'a')

    expect(started).toBe(true)
    expect(staticSpeak).toHaveBeenCalledTimes(1)
    expect(webSpeechSpeak).not.toHaveBeenCalled()
  })

  it('normal speak() still falls back to WebSpeechProvider.speak (called once) when StaticFileProvider rejects', async () => {
    staticSpeak.mockRejectedValue(new Error('no playable clip'))
    webSpeechSpeak.mockResolvedValue(undefined)
    const { result } = renderHook(() => useTTS())

    result.current.speak('characters/a', 'a')

    expect(staticSpeak).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(webSpeechSpeak).toHaveBeenCalledTimes(1))
  })

  it('speakStaticOnly resolves false with no provider calls when audio is disabled', async () => {
    useProgressStore.getState().setAudioEnabled(false)
    const { result } = renderHook(() => useTTS())

    const started = await result.current.speakStaticOnly('characters/a', 'a')

    expect(started).toBe(false)
    expect(staticSpeak).not.toHaveBeenCalled()
    expect(webSpeechSpeak).not.toHaveBeenCalled()
  })
})

describe('useTTS (shared playback channel — rapid-tap regression guard)', () => {
  it('does not create a new StaticFileProvider per consumer: many independent hook instances share one instance', () => {
    // Simulate what a Learn/recap screen does: many independent components
    // (CharacterCard, WordCard, ...) each call useTTS() on their own.
    const consumers = Array.from({ length: 5 }, () => renderHook(() => useTTS()))

    // The constructor is only ever invoked once, at module import time above
    // — none of these renderHook() calls should have created another one.
    expect(vi.mocked(StaticFileProvider)).toHaveBeenCalledTimes(1)

    consumers.forEach(({ unmount }) => unmount())
  })

  it('a rapid cross-consumer speak (A then B before A settles) does not treat A as failed / trigger Web Speech', async () => {
    const a = deferred<void>()
    const b = deferred<void>()
    staticSpeak.mockImplementationOnce(() => a.promise).mockImplementationOnce(() => b.promise)

    const consumerA = renderHook(() => useTTS())
    const consumerB = renderHook(() => useTTS())

    consumerA.result.current.speak('characters/a', 'a')
    consumerB.result.current.speak('characters/i', 'i')

    expect(staticSpeak).toHaveBeenCalledTimes(2)

    // StaticFileProvider's own requestId guard (see staticFileProvider.ts and
    // its tests) already turns a superseded request's abort into a quiet
    // resolve rather than a rejection — that's what useTTS's speak() sees
    // here. The point of this test is that with the provider now SHARED
    // across consumers, that contract still holds: A's now-superseded
    // request resolving quietly must not be misread as "genuinely failed"
    // and must not trigger the Web Speech fallback.
    a.resolve()
    b.resolve()

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(webSpeechSpeak).not.toHaveBeenCalled()
  })

  it('tapping the same clip twice in a row issues a second real request rather than dropping it', async () => {
    staticSpeak.mockResolvedValue(undefined)
    const { result } = renderHook(() => useTTS())

    result.current.speak('characters/a', 'a')
    result.current.speak('characters/a', 'a')

    await waitFor(() => expect(staticSpeak).toHaveBeenCalledTimes(2))
  })

  it('20 sequential speak() calls across multiple consumers never grow provider/constructor count', async () => {
    staticSpeak.mockResolvedValue(undefined)
    const consumers = Array.from({ length: 4 }, () => renderHook(() => useTTS()))

    for (let i = 0; i < 20; i++) {
      const consumer = consumers[i % consumers.length]
      consumer.result.current.speak(`characters/${i}`, String(i))
    }

    await waitFor(() => expect(staticSpeak).toHaveBeenCalledTimes(20))
    // Still just the one singleton created at module import — infrastructure
    // does not scale with request count or consumer count.
    expect(vi.mocked(StaticFileProvider)).toHaveBeenCalledTimes(1)

    consumers.forEach(({ unmount }) => unmount())
  })
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
