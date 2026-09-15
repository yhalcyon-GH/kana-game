const targetPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/
const apiRootPattern = /^\/[a-zA-Z0-9._/-]*$/
const posixAbsolutePathPattern = /^\/[a-zA-Z0-9._/ -]+$/
const windowsAbsolutePathPattern = /^[a-zA-Z]:[\\/][a-zA-Z0-9._\\/ -]+$/
const portPattern = /^[1-9][0-9]{0,4}$/

function required(environment, key) {
  const value = environment[key]
  if (!value) throw new Error(`Missing ${key}.`)
  return value
}

function assertMatch(value, pattern, key) {
  if (!pattern.test(value) || value.includes('..')) {
    throw new Error(`Unsafe ${key}.`)
  }
  return value
}

function assertLocalAbsolutePath(value, key) {
  if (
    value.includes('..')
    || !(posixAbsolutePathPattern.test(value) || windowsAbsolutePathPattern.test(value))
  ) {
    throw new Error(`Unsafe ${key}.`)
  }
  return value
}

/**
 * Builds the only remote command this tool is permitted to execute.
 * It reads configuration through the repository's redacted readiness check;
 * it never opens a shell, displays files, or sends SQL.
 */
export function buildReadOnlySshInvocation(environment) {
  const target = assertMatch(required(environment, 'TAMAMIZU_PRODUCTION_SSH_TARGET'), targetPattern, 'SSH target')
  const port = assertMatch(required(environment, 'TAMAMIZU_PRODUCTION_SSH_PORT'), portPattern, 'SSH port')
  const identityFile = assertLocalAbsolutePath(required(environment, 'TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE'), 'identity-file path')
  const knownHosts = assertLocalAbsolutePath(required(environment, 'TAMAMIZU_PRODUCTION_KNOWN_HOSTS'), 'known-hosts path')
  const apiRoot = assertMatch(required(environment, 'TAMAMIZU_PRODUCTION_API_ROOT'), apiRootPattern, 'API root path')

  return {
    command: 'ssh',
    args: [
      '-T',
      '-o', 'BatchMode=yes',
      '-o', 'IdentitiesOnly=yes',
      '-o', 'StrictHostKeyChecking=yes',
      '-o', `UserKnownHostsFile=${knownHosts}`,
      '-i', identityFile,
      '-p', port,
      target,
      `cd -- ${apiRoot} && php ops/auth-readiness-check.php`,
    ],
  }
}

export function readSafePreflightResult(status, stdout, stderr) {
  const normalizedStdout = stdout.replace(/\r\n/g, '\n')
  const normalizedStderr = stderr.replace(/\r\n/g, '\n')
  const result = /^webCookieAuthActive=(true|false) productionMagicLinkMailerConfigured=(true|false) devHarnessEnabled=(true|false)\nOK\n?$/.exec(normalizedStdout)

  if (status === 0 && result && normalizedStderr === '') {
    const devHarnessEnabled = result[3] === 'true'
    if (devHarnessEnabled) return { ok: false, reason: 'dev-harness-enabled' }

    return {
      ok: true,
      webCookieAuthActive: result[1] === 'true',
      productionMagicLinkMailerConfigured: result[2] === 'true',
      devHarnessEnabled,
    }
  }

  if (
    status === 1
    && /^webCookieAuthActive=(true|false) productionMagicLinkMailerConfigured=(true|false) devHarnessEnabled=(true|false)\n$/.test(normalizedStdout)
    && /^MISCONFIGURED: WEB_SESSION_COOKIE_ENABLED is on but no real Magic Link mailer is configured \(RESEND_API_KEY \/ MAGIC_LINK_FROM_EMAIL \/ MAGIC_LINK_FROM_NAME incomplete\)\. Live sign-in cannot work\.\n$/.test(normalizedStderr)
  ) {
    return { ok: false, reason: 'auth-misconfigured' }
  }

  throw new Error('Remote command returned an unexpected response. Output was intentionally redacted.')
}
