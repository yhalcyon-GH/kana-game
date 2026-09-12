import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSandboxConfig } from './sandboxConfig'

beforeEach(() => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'sandbox')
  vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_fixture')
  vi.stubEnv('VITE_PADDLE_PRICE_ID', 'pri_fixture')
})

afterEach(() => vi.unstubAllEnvs())

describe('readSandboxConfig', () => {
  it('returns the token/priceId when fully configured for sandbox', () => {
    expect(readSandboxConfig('disabled')).toEqual({ token: 'test_fixture', priceId: 'pri_fixture' })
  })

  it('returns the disabled message outside development, before checking any env var', () => {
    vi.stubEnv('DEV', false)
    expect(readSandboxConfig('only in development')).toEqual({ error: 'only in development' })
  })

  it.each(['VITE_PADDLE_ENVIRONMENT', 'VITE_PADDLE_CLIENT_TOKEN', 'VITE_PADDLE_PRICE_ID'] as const)(
    'names the missing %s', (key) => {
      vi.stubEnv(key, '   ')
      const result = readSandboxConfig('disabled')
      expect('error' in result && result.error).toContain(key)
    },
  )

  it('rejects a non-sandbox environment', () => {
    vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'production')
    expect(readSandboxConfig('disabled')).toEqual({ error: 'VITE_PADDLE_ENVIRONMENT must be sandbox for this PoC.' })
  })

  it('rejects a client token that is not a sandbox token_ prefix', () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'live_invalid')
    const result = readSandboxConfig('disabled')
    expect('error' in result && result.error).toMatch(/sandbox client-side token/)
  })

  it('rejects a price id without the pri_ prefix', () => {
    vi.stubEnv('VITE_PADDLE_PRICE_ID', 'pro_invalid')
    const result = readSandboxConfig('disabled')
    expect('error' in result && result.error).toMatch(/pri_/)
  })
})
