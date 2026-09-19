import { spawnSync } from 'node:child_process'
import { buildReadOnlySshInvocation, readSafePreflightResult } from './productionReadOnlySsh.mjs'

try {
  const invocation = buildReadOnlySshInvocation(process.env)
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true,
  })

  if (result.error) {
    throw new Error('SSH could not be started. Check the local key path and SSH client installation.')
  }
  if (result.signal) {
    throw new Error('SSH did not finish safely.')
  }

  const report = readSafePreflightResult(result.status, result.stdout, result.stderr)
  if (!report.ok) {
    const messages = {
      'dev-harness-enabled': 'Production read-only preflight: the development harness is enabled. No secret values were displayed.',
      'email-code-auth-misconfigured': 'Production read-only preflight: Email OTP sign-in (EMAIL_CODE_AUTH_ENABLED) is on but no login-code pepper is configured. No secret values were displayed.',
    }
    console.error(messages[report.reason] ?? 'Production read-only preflight: authentication configuration is incomplete. No secret values were displayed.')
    process.exit(1)
  }

  console.log(`Production read-only preflight passed: webCookieAuthActive=${report.webCookieAuthActive} productionMagicLinkMailerConfigured=${report.productionMagicLinkMailerConfigured} devHarnessEnabled=${report.devHarnessEnabled} emailCodeAuthEnabled=${report.emailCodeAuthEnabled} loginCodePepperConfigured=${report.loginCodePepperConfigured} emailCodeAuthReady=${report.emailCodeAuthReady}`)
  process.exit(0)
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown failure.'
  console.error(`Production read-only preflight refused: ${message}`)
  process.exit(2)
}
