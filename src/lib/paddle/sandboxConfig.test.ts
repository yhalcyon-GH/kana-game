import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  readProductionSandboxConfig,
  readSandboxConfig,
  validateSandboxConfig,
} from './sandboxConfig'

const validSandboxConfig = {
  environment: 'sandbox',
  token: 'test_fixture',
  priceId: 'pri_fixture',
}

const validLiveConfig = {
  environment: 'live',
  token: 'live_fixture',
  priceId: 'pri_fixture',
}

beforeEach(() => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'sandbox')
  vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_fixture')
  vi.stubEnv('VITE_PADDLE_PRICE_ID', 'pri_fixture')
})

afterEach(() => vi.unstubAllEnvs())

describe('readSandboxConfig', () => {
  it('returns the environment/token/priceId when fully configured for sandbox', () => {
    expect(readSandboxConfig('disabled')).toEqual({ environment: 'sandbox', token: 'test_fixture', priceId: 'pri_fixture' })
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

  it('rejects an unknown environment (no default, no fallback)', () => {
    vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'production')
    expect(readSandboxConfig('disabled')).toEqual({ error: 'VITE_PADDLE_ENVIRONMENT must be exactly "sandbox" or "live".' })
  })

  it('rejects a client token that is not a sandbox test_ prefix', () => {
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

describe('validateSandboxConfig', () => {
  it('returns trimmed public Sandbox values including the resolved environment', () => {
    expect(validateSandboxConfig({
      environment: ' sandbox ',
      token: ' test_fixture ',
      priceId: ' pri_fixture ',
    })).toEqual({ environment: 'sandbox', token: 'test_fixture', priceId: 'pri_fixture' })
  })

  it('returns trimmed public Live values including the resolved environment', () => {
    expect(validateSandboxConfig({
      environment: ' live ',
      token: ' live_fixture ',
      priceId: ' pri_fixture ',
    })).toEqual({ environment: 'live', token: 'live_fixture', priceId: 'pri_fixture' })
  })

  it('fails closed when the environment is missing', () => {
    const result = validateSandboxConfig({ ...validSandboxConfig, environment: undefined })

    expect('error' in result && result.error).toContain('VITE_PADDLE_ENVIRONMENT')
  })

  it.each(['production', 'Sandbox', 'LIVE', 'staging'])(
    'rejects the unknown/malformed environment %j (only exactly "sandbox" or "live" are valid, no fallback)',
    (environment) => {
      expect(validateSandboxConfig({ ...validSandboxConfig, environment })).toEqual({
        error: 'VITE_PADDLE_ENVIRONMENT must be exactly "sandbox" or "live".',
      })
    },
  )

  it.each(['live_fixture', 'pdl_sdbx_apikey_fixture'])(
    'rejects a non-test_ client token when sandbox is selected: %s',
    (token) => {
      const result = validateSandboxConfig({ ...validSandboxConfig, token })

      expect('error' in result && result.error).toMatch(/sandbox client-side token \(test_\)/)
    },
  )

  it.each(['test_fixture', 'pdl_live_apikey_fixture'])(
    'rejects a non-live_ client token when live is selected: %s',
    (token) => {
      const result = validateSandboxConfig({ ...validLiveConfig, token })

      expect('error' in result && result.error).toMatch(/live client-side token \(live_\)/)
    },
  )

  it.each(['pro_fixture', 'price_fixture'])(
    'rejects the malformed price id %s regardless of environment',
    (priceId) => {
      const result = validateSandboxConfig({ ...validSandboxConfig, priceId })

      expect('error' in result && result.error).toMatch(/pri_/)
    },
  )

  // -- Phase H2: mechanical environment-mixing guarantees --

  it('a sandbox environment selection with an incompatible live_ token is rejected, not silently accepted', () => {
    const result = validateSandboxConfig({ environment: 'sandbox', token: 'live_should_not_work_here', priceId: 'pri_fixture' })
    expect('error' in result).toBe(true)
  })

  it('a live environment selection with an incompatible test_ token is rejected, not silently accepted', () => {
    const result = validateSandboxConfig({ environment: 'live', token: 'test_should_not_work_here', priceId: 'pri_fixture' })
    expect('error' in result).toBe(true)
  })

  it('never returns a config result naming an environment other than the one it validated', () => {
    const sandboxResult = validateSandboxConfig(validSandboxConfig)
    expect('error' in sandboxResult ? null : sandboxResult.environment).toBe('sandbox')
    const liveResult = validateSandboxConfig(validLiveConfig)
    expect('error' in liveResult ? null : liveResult.environment).toBe('live')
  })
})

describe('readProductionSandboxConfig', () => {
  it('returns valid Sandbox config outside development', () => {
    vi.stubEnv('DEV', false)

    expect(readProductionSandboxConfig()).toEqual({ environment: 'sandbox', token: 'test_fixture', priceId: 'pri_fixture' })
  })

  it('returns valid Live config outside development', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'live')
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'live_fixture')

    expect(readProductionSandboxConfig()).toEqual({ environment: 'live', token: 'live_fixture', priceId: 'pri_fixture' })
  })

  it('fails closed without an environment instead of using a fallback', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PADDLE_ENVIRONMENT', '')

    const result = readProductionSandboxConfig()
    expect('error' in result && result.error).toContain('VITE_PADDLE_ENVIRONMENT')
  })

  it('fails closed on an unrecognized environment value instead of guessing', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'not-a-real-environment')

    const result = readProductionSandboxConfig()
    expect('error' in result).toBe(true)
  })

  it('fails closed on a sandbox environment paired with a live_ token (mixed config)', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'live_mismatched')

    const result = readProductionSandboxConfig()
    expect('error' in result).toBe(true)
  })

  it('fails closed on a live environment paired with a test_ token (mixed config)', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_PADDLE_ENVIRONMENT', 'live')
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_mismatched')

    const result = readProductionSandboxConfig()
    expect('error' in result).toBe(true)
  })
})
