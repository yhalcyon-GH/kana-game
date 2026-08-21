import { afterEach, describe, expect, it, vi } from 'vitest'
import { PWA_RUNTIME_CACHING } from './vite.config'

const audioRoute = PWA_RUNTIME_CACHING.find((entry) => {
  const pattern = entry.urlPattern
  return typeof pattern === 'function' && pattern({ url: new URL('https://example.test/kana-game/audio/example.wav') } as never)
})

describe('PWA audio runtime cache', () => {
  it('reuses the legacy media cache and refreshes online before falling back offline', () => {
    expect(audioRoute?.handler).toBe('NetworkFirst')
    expect(audioRoute?.options?.cacheName).toBe('kana-game-media')
    expect(audioRoute?.options?.networkTimeoutSeconds).toBe(4)
    expect(audioRoute?.options?.cacheableResponse?.statuses).toEqual([0, 200])
  })

  it('serves legacy cached audio offline and replaces it after an online response', async () => {
    if (!audioRoute || !('networkTimeoutSeconds' in audioRoute.options)) {
      throw new Error('Audio runtime route is missing')
    }

    const cacheBuckets = new Map<string, Map<string, Response>>()
    const requestUrl = 'https://example.test/kana-game/audio/example.wav'
    const requestKey = (request: RequestInfo | URL) =>
      typeof request === 'string' ? request : request instanceof URL ? request.href : request.url
    const cacheStorage = {
      async open(cacheName: string) {
        const bucket = cacheBuckets.get(cacheName) ?? new Map<string, Response>()
        cacheBuckets.set(cacheName, bucket)
        return {
          async match(request: RequestInfo | URL) {
            return bucket.get(requestKey(request))?.clone()
          },
          async put(request: RequestInfo | URL, response: Response) {
            bucket.set(requestKey(request), response.clone())
          },
        }
      },
      async match(request: RequestInfo | URL, options?: { cacheName?: string }) {
        if (options?.cacheName) {
          return (await this.open(options.cacheName)).match(request)
        }
        for (const bucket of cacheBuckets.values()) {
          const response = bucket.get(requestKey(request))
          if (response) return response.clone()
        }
      },
    }

    class TestExtendableEvent {
      waitUntil(_promise: Promise<unknown>) {}
    }
    class TestFetchEvent extends TestExtendableEvent {}

    vi.stubGlobal('ExtendableEvent', TestExtendableEvent)
    vi.stubGlobal('FetchEvent', TestFetchEvent)
    vi.stubGlobal('caches', cacheStorage)

    const { CacheableResponsePlugin } = await import('workbox-cacheable-response')
    const { NetworkFirst } = await import('workbox-strategies')
    const strategy = new NetworkFirst({
      cacheName: audioRoute.options.cacheName,
      networkTimeoutSeconds: audioRoute.options.networkTimeoutSeconds,
      plugins: [
        new CacheableResponsePlugin({
          statuses: audioRoute.options.cacheableResponse.statuses,
        }),
      ],
    })
    const legacyCache = await cacheStorage.open('kana-game-media')
    await legacyCache.put(requestUrl, new Response('legacy-audio', { status: 200 }))

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const offlineResponse = await strategy.handle({
      event: new TestFetchEvent() as never,
      request: new Request(requestUrl),
    })
    expect(await offlineResponse.text()).toBe('legacy-audio')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('new-audio', { status: 200 })))
    const [onlineResponse, onlineDone] = strategy.handleAll({
      event: new TestFetchEvent() as never,
      request: new Request(requestUrl),
    })
    expect(await (await onlineResponse).text()).toBe('new-audio')
    await onlineDone
    expect(await (await legacyCache.match(requestUrl))?.text()).toBe('new-audio')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
