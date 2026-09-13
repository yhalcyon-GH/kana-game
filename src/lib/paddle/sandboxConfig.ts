/** Shared Paddle Sandbox client-side config validation. */

export type SandboxConfigResult = { error: string } | { token: string; priceId: string }

export type SandboxConfigInput = {
  environment?: string
  token?: string
  priceId?: string
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
  if (environment !== 'sandbox') return { error: 'VITE_PADDLE_ENVIRONMENT must be sandbox for this PoC.' }
  if (!token?.startsWith('test_')) {
    return { error: 'VITE_PADDLE_CLIENT_TOKEN must be a sandbox client-side token (test_). Never use an API key.' }
  }
  if (!priceId?.startsWith('pri_')) return { error: 'VITE_PADDLE_PRICE_ID must be a Paddle price ID (pri_).' }
  return { token, priceId }
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
