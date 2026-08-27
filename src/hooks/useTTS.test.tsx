import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProgressStore } from '../store/progressStore'

// Mock both providers at the module/constructor level — useTTS instantiates
// each with `useState(() => new X())`, so the mock constructors just need to
// return an object with spy-able `speak`/`stop` methods (and `voice` for
// WebSpeechProvider, since useTTS assigns to it).
const staticSpeak = vi.fn()
const staticStop = vi.fn()
vi.mock('../audio/staticFileProvider', () => ({
  StaticFileProvider: vi.fn(function () {
    return { speak: staticSpeak, stop: staticStop }
  }),
}))

const webSpeechSpeak = vi.fn()
const webSpeechStop = vi.fn()
vi.mock('../audio/webSpeechProvider', () => ({
  WebSpeechProvider: vi.fn(function () {
    return { speak: webSpeechSpeak, stop: webSpeechStop, voice: null }
  }),
  pickJapaneseVoice: vi.fn().mockReturnValue(null),
}))

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
