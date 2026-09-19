import { describe, expect, it } from 'vitest'
import {
  buildPhpVersionProbeSshInvocation,
  buildReadOnlySshInvocation,
  buildReleaseIntegritySshInvocation,
  readSafePhpVersionProbeResult,
  readSafePreflightResult,
  readSafeReleaseIntegrityResult,
} from './productionReadOnlySsh.mjs'

const environment = {
  TAMAMIZU_PRODUCTION_SSH_TARGET: 'account@example.xserver.jp',
  TAMAMIZU_PRODUCTION_SSH_PORT: '10022',
  TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE: '/secure/tamamizu-readonly',
  TAMAMIZU_PRODUCTION_KNOWN_HOSTS: '/secure/known_hosts',
  TAMAMIZU_PRODUCTION_API_ROOT: '/home/account/tamamizu/api',
}

describe('production read-only SSH invocation', () => {
  it('permits only the fixed redacted readiness command with strict host verification', () => {
    const invocation = buildReadOnlySshInvocation(environment)

    expect(invocation.command).toBe('ssh')
    expect(invocation.args).toContain('StrictHostKeyChecking=yes')
    expect(invocation.args).toContain('BatchMode=yes')
    expect(invocation.args.at(-1)).toBe('cd -- /home/account/tamamizu/api && php ops/auth-readiness-check.php')
    expect(invocation.args.join(' ')).not.toMatch(/mysql|mariadb|paddle|migration|config\.php/)
  })

  it('permits only an allowlisted PHP CLI command for the fixed readiness check', () => {
    const invocation = buildReadOnlySshInvocation({ ...environment, TAMAMIZU_PRODUCTION_PHP_COMMAND: 'php8.1' })

    expect(invocation.args.at(-1)).toBe('cd -- /home/account/tamamizu/api && php8.1 ops/auth-readiness-check.php')
    expect(invocation.args.join(' ')).not.toMatch(/mysql|mariadb|paddle|migration|config\.php/)
  })

  it('permits only the fixed redacted release-integrity command', () => {
    const invocation = buildReleaseIntegritySshInvocation(environment)

    expect(invocation.args.at(-1)).toBe('cd -- /home/account/tamamizu/api && php ops/release-integrity-check.php')
    expect(invocation.args.join(' ')).not.toMatch(/find|cat|mysql|mariadb|config\.php/)
  })

  it('accepts safe Windows paths for local key material', () => {
    const invocation = buildReadOnlySshInvocation({
      ...environment,
      TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE: 'C:\\Users\\Yuki\\tamamizu-readonly\\id_ed25519',
      TAMAMIZU_PRODUCTION_KNOWN_HOSTS: 'C:\\Users\\Yuki\\tamamizu-readonly\\known_hosts',
    })

    expect(invocation.args).toContain('UserKnownHostsFile=C:\\Users\\Yuki\\tamamizu-readonly\\known_hosts')
    expect(invocation.args).toContain('C:\\Users\\Yuki\\tamamizu-readonly\\id_ed25519')
  })

  it.each([
    ['TAMAMIZU_PRODUCTION_SSH_TARGET', 'account@example.com; cat config.php'],
    ['TAMAMIZU_PRODUCTION_SSH_PORT', '22; id'],
    ['TAMAMIZU_PRODUCTION_PHP_COMMAND', 'php8.1; id'],
    ['TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE', '../private-key'],
    ['TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE', 'C:\\Users\\Yuki\\..\\private-key'],
    ['TAMAMIZU_PRODUCTION_API_ROOT', '/home/account/../other'],
  ])('rejects unsafe %s values', (key, value) => {
    expect(() => buildReadOnlySshInvocation({ ...environment, [key]: value })).toThrow(/Unsafe/)
  })

  it('accepts only explicitly redacted readiness output', () => {
    expect(readSafePreflightResult(
      0,
      'webCookieAuthActive=true productionMagicLinkMailerConfigured=true devHarnessEnabled=false emailCodeAuthEnabled=false loginCodePepperConfigured=false emailCodeAuthReady=false\nOK\n',
      '',
    )).toEqual({
      ok: true,
      webCookieAuthActive: true,
      productionMagicLinkMailerConfigured: true,
      devHarnessEnabled: false,
      emailCodeAuthEnabled: false,
      loginCodePepperConfigured: false,
      emailCodeAuthReady: false,
    })
  })

  it('treats an enabled development harness as a production blocker', () => {
    expect(readSafePreflightResult(
      0,
      'webCookieAuthActive=true productionMagicLinkMailerConfigured=true devHarnessEnabled=true emailCodeAuthEnabled=false loginCodePepperConfigured=false emailCodeAuthReady=false\nOK\n',
      '',
    )).toEqual({ ok: false, reason: 'dev-harness-enabled' })
  })

  it('reports Email OTP as intentionally off (not a misconfiguration) when the feature flag is off', () => {
    expect(readSafePreflightResult(
      0,
      'webCookieAuthActive=false productionMagicLinkMailerConfigured=false devHarnessEnabled=false emailCodeAuthEnabled=false loginCodePepperConfigured=false emailCodeAuthReady=false\nOK\n',
      '',
    )).toEqual({
      ok: true,
      webCookieAuthActive: false,
      productionMagicLinkMailerConfigured: false,
      devHarnessEnabled: false,
      emailCodeAuthEnabled: false,
      loginCodePepperConfigured: false,
      emailCodeAuthReady: false,
    })
  })

  it('reports Email OTP as fully ready when the flag is on and a pepper is configured', () => {
    expect(readSafePreflightResult(
      0,
      'webCookieAuthActive=false productionMagicLinkMailerConfigured=false devHarnessEnabled=false emailCodeAuthEnabled=true loginCodePepperConfigured=true emailCodeAuthReady=true\nOK\n',
      '',
    )).toMatchObject({ ok: true, emailCodeAuthEnabled: true, loginCodePepperConfigured: true, emailCodeAuthReady: true })
  })

  it('classifies a missing login-code pepper while Email OTP is enabled as its own reason, distinct from cookie-auth misconfiguration', () => {
    expect(readSafePreflightResult(
      1,
      'webCookieAuthActive=false productionMagicLinkMailerConfigured=false devHarnessEnabled=false emailCodeAuthEnabled=true loginCodePepperConfigured=false emailCodeAuthReady=false\n',
      'MISCONFIGURED: EMAIL_CODE_AUTH_ENABLED is on but LOGIN_CODE_PEPPER is not configured. Email OTP login cannot work.\n',
    )).toEqual({ ok: false, reason: 'email-code-auth-misconfigured' })
  })

  it('accepts only an explicitly redacted release fingerprint', () => {
    const fingerprint = 'a'.repeat(64)
    expect(readSafeReleaseIntegrityResult(0, `releaseContentSha256=${fingerprint}\nOK\n`, '')).toBe(fingerprint)
    expect(() => readSafeReleaseIntegrityResult(0, 'config.php\n', '')).toThrow(/redacted/)
  })

  it('redacts unexpected remote output instead of returning it to the caller', () => {
    expect(() => readSafePreflightResult(0, 'DB_PASSWORD=never-return-this\n', '')).toThrow(/redacted/)
  })

  it('permits only the fixed PHP CLI version probe with no api-root or file access', () => {
    const invocation = buildPhpVersionProbeSshInvocation(environment)

    expect(invocation.command).toBe('ssh')
    expect(invocation.args).toContain('StrictHostKeyChecking=yes')
    expect(invocation.args).toContain('BatchMode=yes')
    expect(invocation.args.at(-1)).toBe('php -v')
    expect(invocation.args.join(' ')).not.toMatch(/cd |mysql|mariadb|paddle|migration|config\.php|auth-readiness|release-integrity/)
  })

  it('permits only an allowlisted PHP CLI command for the version probe', () => {
    const invocation = buildPhpVersionProbeSshInvocation({ ...environment, TAMAMIZU_PRODUCTION_PHP_COMMAND: 'php8.3' })

    expect(invocation.args.at(-1)).toBe('php8.3 -v')
  })

  it.each([
    ['TAMAMIZU_PRODUCTION_SSH_TARGET', 'account@example.com; cat config.php'],
    ['TAMAMIZU_PRODUCTION_PHP_COMMAND', 'php8.1; id'],
  ])('rejects unsafe %s values for the version probe', (key, value) => {
    expect(() => buildPhpVersionProbeSshInvocation({ ...environment, [key]: value })).toThrow(/Unsafe/)
  })

  it('parses a normal PHP CLI version response into a normalized major.minor', () => {
    expect(readSafePhpVersionProbeResult(
      0,
      'PHP 8.2.12 (cli) (built: Sep  5 2023 08:00:00) (NTS)\nCopyright (c) The PHP Group\n',
      '',
    )).toEqual({ ok: true, phpMajorMinor: '8.2' })
  })

  it('classifies unsupported or invalid PHP CLI output without returning raw output', () => {
    expect(readSafePhpVersionProbeResult(127, '', 'bash: php8.5: command not found\n'))
      .toEqual({ ok: false, reason: 'php-cli-unavailable-or-unrecognized' })
    expect(readSafePhpVersionProbeResult(0, 'Zend Version Checker 1.0\n', ''))
      .toEqual({ ok: false, reason: 'php-cli-unavailable-or-unrecognized' })
  })

  it('classifies an SSH-level connection failure separately from PHP CLI output', () => {
    expect(readSafePhpVersionProbeResult(255, '', 'ssh: connect to host example.xserver.jp port 10022: Connection refused\n'))
      .toEqual({ ok: false, reason: 'ssh-connection-failed' })
  })
})
