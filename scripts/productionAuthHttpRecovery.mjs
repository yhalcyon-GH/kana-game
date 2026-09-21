#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

function fail(reason) {
  throw new Error(reason)
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) fail(`missing-environment:${name}`)
  return value
}

export function parsePermissionReport(text) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim()
  const match = /^authDirMode=([0-7]{3,4}) phpFileCount=([0-9]+) symlinkCount=([0-9]+)$/m.exec(normalized)
  if (!match) fail('permission-report-unexpected')
  return {
    authDirMode: match[1],
    phpFileCount: Number(match[2]),
    symlinkCount: Number(match[3]),
  }
}

export function isWebTraversableMode(mode) {
  const octal = Number.parseInt(mode, 8)
  if (!Number.isInteger(octal)) return false
  return (octal & 0o001) !== 0
}

function checkedEnvironment() {
  const target = requiredEnv('TAMAMIZU_PRODUCTION_SSH_TARGET')
  const port = requiredEnv('TAMAMIZU_PRODUCTION_SSH_PORT')
  const identityFile = requiredEnv('TAMAMIZU_PRODUCTION_SSH_IDENTITY_FILE')
  const knownHosts = requiredEnv('TAMAMIZU_PRODUCTION_KNOWN_HOSTS')
  const apiRoot = requiredEnv('TAMAMIZU_PRODUCTION_API_ROOT')
  const php = process.env.TAMAMIZU_PRODUCTION_PHP_COMMAND || 'php'

  if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(target)) fail('unsafe-ssh-target')
  if (!/^[1-9][0-9]{0,4}$/.test(port)) fail('unsafe-ssh-port')
  if (!/^\/[A-Za-z0-9._/-]+$/.test(apiRoot) || apiRoot.includes('..')) fail('unsafe-api-root')
  if (!/^php(?:8\.(?:1|2|3|4))?$/.test(php)) fail('unsafe-php-command')

  return { target, port, identityFile, knownHosts, apiRoot, php }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  })
  if (result.error) fail(`command-start-failed:${command}`)
  if (result.signal) fail(`command-signalled:${command}`)
  return result
}

function ssh(config, remoteCommand, allowed = [0]) {
  const result = run('ssh', [
    '-T',
    '-o', 'BatchMode=yes',
    '-o', 'IdentitiesOnly=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${config.knownHosts}`,
    '-i', config.identityFile,
    '-p', config.port,
    config.target,
    remoteCommand,
  ], { timeout: 30_000 })

  if (!allowed.includes(result.status)) fail(`ssh-command-failed:exit-${result.status}`)
  return { status: result.status, stdout: String(result.stdout ?? '').trim() }
}

function runNodeScript(script) {
  const result = run(process.execPath, [script], { stdio: 'inherit', env: process.env })
  if (result.status !== 0) fail(`production-check-failed:${script}`)
}

function reconciliationCounts(config) {
  const result = ssh(
    config,
    `cd -- ${config.apiRoot} && ${config.php} ops/paddle-reconciliation-cutover.php --check`,
    [0, 1],
  )
  const lines = result.stdout.replace(/\r\n/g, '\n').split('\n').map(x => x.trim()).filter(Boolean)
  if (lines.length !== 2) fail('reconciliation-check-unexpected')

  const grants = /^grantBackedUnreconciledTransactions=([0-9]+)$/.exec(lines[0])
  const blocks = /^unresolvedReconciliationBlocks=([0-9]+)$/.exec(lines[1])
  if (!grants || !blocks) fail('reconciliation-check-unexpected')

  return {
    status: result.status,
    grants: Number(grants[1]),
    blocks: Number(blocks[1]),
  }
}

function permissionReport(config) {
  const command = [
    `cd -- ${config.apiRoot}`,
    'test -d auth',
    "mode=$(stat -c '%a' auth)",
    "php_count=$(find auth -maxdepth 1 -type f -name '*.php' | wc -l | tr -d ' ')",
    "symlink_count=$(find auth -type l | wc -l | tr -d ' ')",
    'printf "authDirMode=%s phpFileCount=%s symlinkCount=%s\\n" "$mode" "$php_count" "$symlink_count"',
  ].join(' && ')
  return parsePermissionReport(ssh(config, command).stdout)
}

function normalizeAuthPermissions(config) {
  const command = [
    `cd -- ${config.apiRoot}`,
    'test -d auth',
    "test $(find auth -type l | wc -l | tr -d ' ') -eq 0",
    "find auth -type d -exec chmod 0755 {} +",
    "find auth -type f -exec chmod 0644 {} +",
    "mode=$(stat -c '%a' auth)",
    "php_count=$(find auth -maxdepth 1 -type f -name '*.php' | wc -l | tr -d ' ')",
    "symlink_count=$(find auth -type l | wc -l | tr -d ' ')",
    'printf "authDirMode=%s phpFileCount=%s symlinkCount=%s\\n" "$mode" "$php_count" "$symlink_count"',
  ].join(' && ')

  return parsePermissionReport(ssh(config, command).stdout)
}

async function verifyPublicHttp() {
  const capabilities = await fetch('https://tamamizu.giganihongo.com/api/auth/capabilities.php', {
    cache: 'no-store',
    redirect: 'follow',
  })
  if (capabilities.status !== 200) fail(`capabilities-http-status:${capabilities.status}`)

  const body = await capabilities.json()
  if (body?.email_code_auth !== true) fail('capabilities-email-code-auth-not-true')

  for (const [name, expected] of [
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['referrer-policy', 'no-referrer'],
  ]) {
    const actual = capabilities.headers.get(name)
    if (!actual || !actual.includes(expected)) fail(`security-header-missing-or-wrong:${name}`)
  }

  for (const name of ['permissions-policy', 'content-security-policy']) {
    if (!capabilities.headers.get(name)) fail(`security-header-missing:${name}`)
  }

  const me = await fetch('https://tamamizu.giganihongo.com/api/auth/me.php', {
    cache: 'no-store',
    redirect: 'manual',
  })
  if (me.status !== 401) fail(`auth-me-http-status:${me.status}`)

  const ops = await fetch('https://tamamizu.giganihongo.com/api/ops/auth-readiness-check.php', {
    cache: 'no-store',
    redirect: 'manual',
  })
  const opsBody = await ops.text()
  if (ops.status < 400 || ops.status >= 500) fail(`ops-http-denial-not-verified:${ops.status}`)
  if (opsBody.includes('webCookieAuthActive=')) fail('ops-readiness-output-exposed')
}

async function main() {
  if (!process.argv.includes('--approved')) {
    console.error('AUTH_HTTP_RECOVERY_REFUSED reason=approval-flag-missing')
    process.exitCode = 2
    return
  }

  let phase = 'environment'

  try {
    const config = checkedEnvironment()

    phase = 'release-integrity-before'
    runNodeScript('scripts/productionReleaseIntegrity.mjs')
    console.log('RELEASE_INTEGRITY_BEFORE_OK')

    phase = 'reconciliation-zero-before'
    const counts = reconciliationCounts(config)
    if (counts.status !== 0 || counts.grants !== 0 || counts.blocks !== 0) {
      fail(`reconciliation-not-zero:grant=${counts.grants},blocks=${counts.blocks}`)
    }
    console.log('RECONCILIATION_ZERO_OK')

    phase = 'permission-diagnostic'
    const before = permissionReport(config)
    if (before.symlinkCount !== 0) fail('auth-symlink-refused')
    if (before.phpFileCount !== 8) fail(`unexpected-auth-php-file-count:${before.phpFileCount}`)
    console.log(`AUTH_PERMISSION_BEFORE mode=${before.authDirMode} phpFileCount=${before.phpFileCount}`)

    phase = 'permission-normalization'
    const after = normalizeAuthPermissions(config)
    if (after.symlinkCount !== 0) fail('auth-symlink-after-repair')
    if (after.phpFileCount !== 8) fail(`unexpected-auth-php-file-count-after:${after.phpFileCount}`)
    if (after.authDirMode !== '755' || !isWebTraversableMode(after.authDirMode)) {
      fail(`auth-permission-normalization-failed:${after.authDirMode}`)
    }
    console.log(`AUTH_PERMISSION_AFTER mode=${after.authDirMode} phpFileCount=${after.phpFileCount}`)

    phase = 'public-http-verification'
    await verifyPublicHttp()
    console.log('PUBLIC_AUTH_HTTP_OK')

    phase = 'release-integrity-after'
    runNodeScript('scripts/productionReleaseIntegrity.mjs')
    console.log('RELEASE_INTEGRITY_AFTER_OK')

    phase = 'auth-preflight'
    runNodeScript('scripts/productionReadOnlyPreflight.mjs')
    console.log('AUTH_PREFLIGHT_OK')

    phase = 'cors-probe'
    runNodeScript('scripts/productionCorsProbe.mjs')
    console.log('CORS_OK')

    phase = 'reconciliation-zero-after'
    const finalCounts = reconciliationCounts(config)
    if (finalCounts.status !== 0 || finalCounts.grants !== 0 || finalCounts.blocks !== 0) {
      fail(`reconciliation-not-zero-after:grant=${finalCounts.grants},blocks=${finalCounts.blocks}`)
    }
    console.log('ZERO_COUNT_OK')

    console.log('HTTP_SECURITY_OK')
    console.log('POSTCHECK_OK')
    console.log('CUTOVER_COMPLETE')
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    console.error(`AUTH_HTTP_RECOVERY_STOPPED phase=${phase} reason=${reason}`)
    process.exitCode = 1
  }
}

if (process.argv[1]) {
  const current = new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href
  if (import.meta.url === current) {
    await main()
  }
}
