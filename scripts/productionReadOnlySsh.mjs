const targetPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/
const apiRootPattern = /^\/[a-zA-Z0-9._/-]*$/
const posixAbsolutePathPattern = /^\/[a-zA-Z0-9._/ -]+$/
const windowsAbsolutePathPattern = /^[a-zA-Z]:[\\/][a-zA-Z0-9._\\/ -]+$/
const portPattern = /^[1-9][0-9]{0,4}$/
const phpCommandPattern = /^php(?:8\.(?:1|2|3|4))?$/

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

function buildFixedReadOnlySshInvocation(environment, remoteCommand) {
  const target = assertMatch(required(environment, 'TAMAMIZU_PRODUCTION_SSH_TARGET'), targetPattern, 'SSH target')
  const port = assertMatch(required(environment, 'TAMAMIZU_PRODUCTION_SSH_PORT'), portPattern, 'SSH port')
  const identityFile = assertLocalAbsolutePath(required(environment, 'TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE'), 'identity-file path')
  const knownHosts = assertLocalAbsolutePath(required(environment, 'TAMAMIZU_PRODUCTION_KNOWN_HOSTS'), 'known-hosts path')
  const apiRoot = assertMatch(required(environment, 'TAMAMIZU_PRODUCTION_API_ROOT'), apiRootPattern, 'API root path')
  const phpCommand = assertMatch(environment.TAMAMIZU_PRODUCTION_PHP_COMMAND || 'php', phpCommandPattern, 'PHP command')

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
      `cd -- ${apiRoot} && ${phpCommand} ${remoteCommand}`,
    ],
  }
}

/**
 * Builds the fixed, redacted configuration-readiness command. It never opens
 * a shell, displays files, or sends SQL.
 */
export function buildReadOnlySshInvocation(environment) {
  return buildFixedReadOnlySshInvocation(environment, 'ops/auth-readiness-check.php')
}

/**
 * Builds the fixed, redacted code-release fingerprint command. It reads only
 * hashes of the reviewed, non-secret deployment files listed in its manifest.
 */
export function buildReleaseIntegritySshInvocation(environment) {
  return buildFixedReadOnlySshInvocation(environment, 'ops/release-integrity-check.php')
}

/**
 * Builds a fixed, redacted Production CORS allowlist probe. The remote PHP
 * snippet reads the effective server-side Config (including env overrides)
 * but prints only whether it exactly matches the one intended Production
 * frontend origin plus the number of configured origins. It never prints an
 * origin string or any other configuration value.
 */
export function buildCorsProbeSshInvocation(environment) {
  const php = [
    'require "src/Config.php";',
    '$config=\\KanaGame\\Paddle\\Config::load();',
    '$origins=$config->allowedOrigins();',
    'sort($origins);',
    '$expected=array("https://app.tamamizu.giganihongo.com");',
    'echo "corsExact=".($origins===$expected?"true":"false")." originCount=".count($origins).PHP_EOL;',
  ].join(' ')
  return buildFixedReadOnlySshInvocation(environment, `-r '${php}'`)
}

const READINESS_LINE_PATTERN = /^webCookieAuthActive=(true|false) productionMagicLinkMailerConfigured=(true|false) devHarnessEnabled=(true|false) emailCodeAuthEnabled=(true|false) loginCodePepperConfigured=(true|false) emailCodeAuthReady=(true|false)$/

/**
 * Parses the fixed, redacted readiness line into safe booleans only --
 * never raw config/secret values. Includes Email OTP sign-in readiness
 * (emailCodeAuthEnabled / loginCodePepperConfigured / emailCodeAuthReady)
 * alongside the original Web cookie/Magic Link fields, so a caller can
 * mechanically distinguish "OTP intentionally/configurationally
 * disabled" (emailCodeAuthEnabled=false) from a stale frontend without
 * ever seeing the login-code pepper value itself.
 */
export function readSafePreflightResult(status, stdout, stderr) {
  const normalizedStdout = stdout.replace(/\r\n/g, '\n')
  const normalizedStderr = stderr.replace(/\r\n/g, '\n')
  const lines = normalizedStdout.split('\n')
  const result = lines.length > 0 ? READINESS_LINE_PATTERN.exec(lines[0]) : null

  if (status === 0 && result && lines[1] === 'OK' && (lines[2] ?? '') === '' && normalizedStderr === '') {
    const devHarnessEnabled = result[3] === 'true'
    if (devHarnessEnabled) return { ok: false, reason: 'dev-harness-enabled' }

    return {
      ok: true,
      webCookieAuthActive: result[1] === 'true',
      productionMagicLinkMailerConfigured: result[2] === 'true',
      devHarnessEnabled,
      emailCodeAuthEnabled: result[4] === 'true',
      loginCodePepperConfigured: result[5] === 'true',
      emailCodeAuthReady: result[6] === 'true',
    }
  }

  if (
    status === 1
    && result
    && lines[1] === ''
    && (lines[2] ?? '') === ''
  ) {
    if (/^MISCONFIGURED: WEB_SESSION_COOKIE_ENABLED is on but no real Magic Link mailer is configured \(RESEND_API_KEY \/ MAGIC_LINK_FROM_EMAIL \/ MAGIC_LINK_FROM_NAME incomplete\)\. Live sign-in cannot work\.\n$/.test(normalizedStderr)) {
      return { ok: false, reason: 'auth-misconfigured' }
    }
    if (/^MISCONFIGURED: EMAIL_CODE_AUTH_ENABLED is on but LOGIN_CODE_PEPPER is not configured\. Email OTP login cannot work\.\n$/.test(normalizedStderr)) {
      return { ok: false, reason: 'email-code-auth-misconfigured' }
    }
  }

  throw new Error('Remote command returned an unexpected response. Output was intentionally redacted.')
}

export function readSafeReleaseIntegrityResult(status, stdout, stderr) {
  const normalizedStdout = stdout.replace(/\r\n/g, '\n')
  const normalizedStderr = stderr.replace(/\r\n/g, '\n')
  const result = /^releaseContentSha256=([a-f0-9]{64})\nOK\n?$/.exec(normalizedStdout)

  if (status === 0 && result && normalizedStderr === '') {
    return result[1]
  }

  throw new Error('Remote command returned an unexpected response. Output was intentionally redacted.')
}

export function readSafeCorsProbeResult(status, stdout, stderr) {
  const normalizedStdout = stdout.replace(/\r\n/g, '\n')
  const normalizedStderr = stderr.replace(/\r\n/g, '\n')
  const result = /^corsExact=(true|false) originCount=([0-9]{1,3})\n?$/.exec(normalizedStdout)

  if (status === 0 && result && normalizedStderr === '') {
    return {
      corsExact: result[1] === 'true',
      originCount: Number(result[2]),
    }
  }

  throw new Error('Remote command returned an unexpected response. Output was intentionally redacted.')
}

/**
 * Builds the fixed PHP CLI version probe. It never changes directory into
 * the API root, reads a file, accesses a database, or accepts an arbitrary
 * remote command — only the allowlisted PHP CLI binary itself is invoked
 * with the built-in `-v` flag.
 */
export function buildPhpVersionProbeSshInvocation(environment) {
  const target = assertMatch(required(environment, 'TAMAMIZU_PRODUCTION_SSH_TARGET'), targetPattern, 'SSH target')
  const port = assertMatch(required(environment, 'TAMAMIZU_PRODUCTION_SSH_PORT'), portPattern, 'SSH port')
  const identityFile = assertLocalAbsolutePath(required(environment, 'TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE'), 'identity-file path')
  const knownHosts = assertLocalAbsolutePath(required(environment, 'TAMAMIZU_PRODUCTION_KNOWN_HOSTS'), 'known-hosts path')
  const phpCommand = assertMatch(environment.TAMAMIZU_PRODUCTION_PHP_COMMAND || 'php', phpCommandPattern, 'PHP command')

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
      `${phpCommand} -v`,
    ],
  }
}

/**
 * Parses the PHP CLI version probe response into only a normalized
 * major.minor version or a safe classification. It never returns raw
 * remote stdout/stderr to the caller.
 */
export function readSafePhpVersionProbeResult(status, stdout, stderr) {
  const normalizedStdout = stdout.replace(/\r\n/g, '\n')
  const normalizedStderr = stderr.replace(/\r\n/g, '\n')

  if (status === 255) {
    return { ok: false, reason: 'ssh-connection-failed' }
  }

  const versionMatch = /^PHP (\d{1,2})\.(\d{1,2})\.\d+/.exec(normalizedStdout)
  if (status === 0 && versionMatch && normalizedStderr === '') {
    return { ok: true, phpMajorMinor: `${versionMatch[1]}.${versionMatch[2]}` }
  }

  return { ok: false, reason: 'php-cli-unavailable-or-unrecognized' }
}
