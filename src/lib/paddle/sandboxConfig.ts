/**
 * Shared Paddle client-side config validation.
 *
 * Phase H2: generalized from Sandbox-only to explicit Sandbox/Live
 * environment separation. Kept in this file (not renamed/moved) and
 * kept under its original exported names deliberately -- this module
 * and its ~860 lines of existing E2/E3 regression-test coverage
 * (across this file, sandboxCheckoutController.ts, and
 * useProductionSandboxPurchase.ts/.test.tsx) are the primary safety
 * asset to protect here; renaming would touch every import site for
 * no behavioral benefit. See docs/paddle-environment-separation.md.
 *
 * VITE_PADDLE_ENVIRONMENT now accepts exactly 'sandbox' or 'live' --
 * no other value, and no default/fallback between them, is accepted.
 * The expected client-side token prefix is derived from the
 * environment itself (test_ for sandbox, live_ for live), per
 * Paddle's official client-side token docs
 * (https://developer.paddle.com/paddle-js/about/client-side-tokens/):
 * "Client-side tokens always start with test_ or live_ to show the
 * environment they're used for." This is a config-consistency check,
 * not proof of a real token -- a malformed/wrong-environment token
 * fails closed here rather than reaching Paddle's SDK.
 */

export type PaddleCheckoutEnvironment = 'sandbox' | 'live'

export type SandboxConfigResult = { error: string } | { environment: PaddleCheckoutEnvironment; token: string; priceId: string }

export type SandboxConfigInput = {
  environment?: string
  token?: string
  priceId?: string
}

const CLIENT_TOKEN_PREFIX: Record<PaddleCheckoutEnvironment, string> = { sandbox: 'test_', live: 'live_' }

function isPaddleCheckoutEnvironment(value: string): value is PaddleCheckoutEnvironment {
  return value === 'sandbox' || value === 'live'
}

export function validateSandboxConfig(input: SandboxConfigInput): SandboxConfigResult {
  const environment = input.environment?.trim()
  const token = input.token?.trim()
  const priceId = input.priceId?.trim()
  const missing = [
    !environment && 'VITE_PADDLE_ENVIRONMENT',
    !token && 'VITE_PADDLE_CLIENT_TOKEN',
    !priceId && 'VITE_PADDLE_PRICE_ID',
  ].filter(Boolean)

  if (missing.length) {
    return { error: `Configuration missing: ${missing.join(', ')}. Set these in .env.local and restart the dev server.` }
  }
  if (!isPaddleCheckoutEnvironment(environment ?? '')) {
    return { error: 'VITE_PADDLE_ENVIRONMENT must be exactly "sandbox" or "live".' }
  }
  const resolvedEnvironment = environment as PaddleCheckoutEnvironment
  const expectedPrefix = CLIENT_TOKEN_PREFIX[resolvedEnvironment]
  if (!token?.startsWith(expectedPrefix)) {
    return { error: `VITE_PADDLE_CLIENT_TOKEN must be a ${resolvedEnvironment} client-side token (${expectedPrefix}). Never use an API key.` }
  }
  if (!priceId?.startsWith('pri_')) return { error: 'VITE_PADDLE_PRICE_ID must be a Paddle price ID (pri_).' }
  return { environment: resolvedEnvironment, token, priceId }
}

function readSandboxBuildValues(): SandboxConfigInput {
  return {
    environment: import.meta.env.VITE_PADDLE_ENVIRONMENT,
    token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN,
    priceId: import.meta.env.VITE_PADDLE_PRICE_ID,
  }
}

/** Development-harness reader; production callers must use readProductionSandboxConfig. */
export function readSandboxConfig(disabledMessage: string): SandboxConfigResult {
  if (!import.meta.env.DEV) return { error: disabledMessage }

  return validateSandboxConfig(readSandboxBuildValues())
}

/** Production-capable Sandbox reader. Invalid or absent values fail closed. */
export function readProductionSandboxConfig(): SandboxConfigResult {
  return validateSandboxConfig(readSandboxBuildValues())
}
