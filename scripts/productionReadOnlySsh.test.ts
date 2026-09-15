import { describe, expect, it } from 'vitest'
import { buildReadOnlySshInvocation, readSafePreflightResult } from './productionReadOnlySsh.mjs'

const environment = {
  TAMAMIZU_PRODUCTION_SSH_TARGET: 'account@example.xserver.jp',
  TAMAMIZU_PRODUCTION_SSH_PORT: '10022',
  TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE: '/secure/tamamizu-readonly',
  TAMAMIZU_PRODUCTION_KNOWN_HOSTS: '/secure/known_hosts',
  TAMAMIZU_PRODUCTION_APP_ROOT: '/home/account/tamamizu',
}

describe('production read-only SSH invocation', () => {
  it('permits only the fixed redacted readiness command with strict host verification', () => {
    const invocation = buildReadOnlySshInvocation(environment)

    expect(invocation.command).toBe('ssh')
    expect(invocation.args).toContain('StrictHostKeyChecking=yes')
    expect(invocation.args).toContain('BatchMode=yes')
    expect(invocation.args.at(-1)).toBe('cd -- /home/account/tamamizu && php server/ops/auth-readiness-check.php')
    expect(invocation.args.join(' ')).not.toMatch(/mysql|mariadb|paddle|migration|config\.php/)
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
    ['TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE', '../private-key'],
    ['TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE', 'C:\\Users\\Yuki\\..\\private-key'],
    ['TAMAMIZU_PRODUCTION_APP_ROOT', '/home/account/../other'],
  ])('rejects unsafe %s values', (key, value) => {
    expect(() => buildReadOnlySshInvocation({ ...environment, [key]: value })).toThrow(/Unsafe/)
  })

  it('accepts only explicitly redacted success output', () => {
    expect(readSafePreflightResult(
      0,
      'webCookieAuthActive=true productionMagicLinkMailerConfigured=true devHarnessEnabled=false\nOK\n',
      '',
    )).toEqual({
      ok: true,
      webCookieAuthActive: true,
      productionMagicLinkMailerConfigured: true,
      devHarnessEnabled: false,
    })
  })

  it('treats an enabled development harness as a production blocker', () => {
    expect(readSafePreflightResult(
      0,
      'webCookieAuthActive=true productionMagicLinkMailerConfigured=true devHarnessEnabled=true\nOK\n',
      '',
    )).toEqual({ ok: false, reason: 'dev-harness-enabled' })
  })

  it('redacts unexpected remote output instead of returning it to the caller', () => {
    expect(() => readSafePreflightResult(0, 'DB_PASSWORD=never-return-this\n', '')).toThrow(/redacted/)
  })
})
