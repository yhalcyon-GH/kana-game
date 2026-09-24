import { afterEach, describe, expect, it, vi } from 'vitest'
import { readProductionAuthApiBase } from './productionAuthApiBase'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('readProductionAuthApiBase', () => {
  it('uses the production API default in production builds', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', '')

    expect(readProductionAuthApiBase()).toBe('https://tamamizu.giganihongo.com/api')
  })

  it('does not fall back to the production API in development', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', '   ')

    expect(readProductionAuthApiBase()).toBeUndefined()
  })

  it('uses an explicitly configured development auth API and trims its trailing slash', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', ' https://auth-dev.example.com/api/ ')

    expect(readProductionAuthApiBase()).toBe('https://auth-dev.example.com/api')
  })

  it('accepts the exact canonical production base when explicitly configured', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', 'https://tamamizu.giganihongo.com/api')

    expect(readProductionAuthApiBase()).toBe('https://tamamizu.giganihongo.com/api')
  })

  it('accepts the canonical production base with a trailing slash', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', 'https://tamamizu.giganihongo.com/api/')

    expect(readProductionAuthApiBase()).toBe('https://tamamizu.giganihongo.com/api')
  })

  it('fails closed in production for a different origin', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', 'https://evil.example.com/api')

    expect(readProductionAuthApiBase()).toBeUndefined()
  })

  it('fails closed in production for http instead of https', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', 'http://tamamizu.giganihongo.com/api')

    expect(readProductionAuthApiBase()).toBeUndefined()
  })

  it('fails closed in production for the wrong path', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', 'https://tamamizu.giganihongo.com/other-api')

    expect(readProductionAuthApiBase()).toBeUndefined()
  })

  it('fails closed in production for the wrong port', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PRODUCTION_AUTH_API_BASE_URL', 'https://tamamizu.giganihongo.com:8443/api')

    expect(readProductionAuthApiBase()).toBeUndefined()
  })
})
