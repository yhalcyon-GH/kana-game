#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

function fail(reason) {
  throw new Error(reason)
}

function lines(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

export function parseCheckOutput(text) {
  const values = new Map()
  for (const line of lines(text)) {
    const match = /^([A-Za-z][A-Za-z0-9]+)=([0-9]+)$/.exec(line)
    if (!match) fail('check-output-unexpected')
    values.set(match[1], Number(match[2]))
  }

  if (
    values.size !== 2
    || !values.has('grantBackedUnreconciledTransactions')
    || !values.has('unresolvedReconciliationBlocks')
  ) {
    fail('check-output-unexpected')
  }

  return {
    grantBackedUnreconciledTransactions: values.get('grantBackedUnreconciledTransactions'),
    unresolvedReconciliationBlocks: values.get('unresolvedReconciliationBlocks'),
  }
}

export function parseApplyOutput(text) {
  const outputLines = lines(text)
  if (outputLines.length !== 3) fail('apply-output-unexpected')

  const beforeGrant = /^grantBackedUnreconciledTransactions=([0-9]+)$/.exec(outputLines[0])
  const beforeBlocks = /^unresolvedReconciliationBlocks=([0-9]+)$/.exec(outputLines[1])
  const after = /^reconciledTransactions=([0-9]+) remainingGrantBackedUnreconciledTransactions=([0-9]+) unresolvedReconciliationBlocks=([0-9]+)$/.exec(outputLines[2])

  if (!beforeGrant || !beforeBlocks || !after) fail('apply-output-unexpected')

  return {
    grantBackedUnreconciledTransactionsBefore: Number(beforeGrant[1]),
    unresolvedReconciliationBlocksBefore: Number(beforeBlocks[1]),
    reconciledTransactions: Number(after[1]),
    remainingGrantBackedUnreconciledTransactions: Number(after[2]),
    unresolvedReconciliationBlocksAfter: Number(after[3]),
  }
}

export function decideReconciliation(check) {
  if (check.unresolvedReconciliationBlocks > 0) return 'blocked'
  if (check.grantBackedUnreconciledTransactions > 0) return 'apply'
  return 'skip'
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) fail(`missing-environment:${name}`)
  return value
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
  return { status: result.status, stdout: result.stdout.trim() }
}

export function productionCheckScript(name) {
  const scripts = {
    'production:release-integrity': 'scripts/productionReleaseIntegrity.mjs',
    'production:preflight': 'scripts/productionReadOnlyPreflight.mjs',
    'production:cors-probe': 'scripts/productionCorsProbe.mjs',
  }
  const script = scripts[name]
  if (!script) fail(`unknown-production-check:${name}`)
  return script
}

function runProductionCheck(name) {
  const script = productionCheckScript(name)
  const result = run(process.execPath, [script], { stdio: 'inherit', env: process.env })
  if (result.status !== 0) fail(`production-check-failed:${name}`)
}

async function verifyHttpSecurity() {
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
    console.error('CUTOVER_FINALIZER_REFUSED reason=approval-flag-missing')
    process.exitCode = 2
    return
  }

  let phase = 'environment'

  try {
    const config = checkedEnvironment()

    phase = 'release-integrity'
    runProductionCheck('production:release-integrity')
    console.log('RELEASE_INTEGRITY_OK')

    phase = 'current-reconciliation-check'
    const checkResult = ssh(
      config,
      `cd -- ${config.apiRoot} && ${config.php} ops/paddle-reconciliation-cutover.php --check`,
      [0, 1],
    )
    const check = parseCheckOutput(checkResult.stdout)
    console.log(
      `CURRENT_RECONCILIATION grantBackedUnreconciledTransactions=${check.grantBackedUnreconciledTransactions} unresolvedReconciliationBlocks=${check.unresolvedReconciliationBlocks}`,
    )

    const decision = decideReconciliation(check)
    if (decision === 'blocked') {
      fail(`unresolved-reconciliation-blocks:${check.unresolvedReconciliationBlocks}`)
    }

    if (decision === 'apply') {
      phase = 'idempotent-reconciliation-apply'
      const applyResult = ssh(
        config,
        `cd -- ${config.apiRoot} && ${config.php} ops/paddle-reconciliation-cutover.php --apply --human-approved-security-cutover`,
        [0, 1, 2],
      )
      if (applyResult.status === 2) fail('reconciliation-apply-failed-closed')

      const applied = parseApplyOutput(applyResult.stdout)
      if (
        applyResult.status !== 0
        || applied.remainingGrantBackedUnreconciledTransactions !== 0
        || applied.unresolvedReconciliationBlocksAfter !== 0
      ) {
        fail('reconciliation-not-zero')
      }
      console.log(
        `RECONCILIATION_APPLY_OK reconciledTransactions=${applied.reconciledTransactions}`,
      )
    } else {
      console.log('RECONCILIATION_APPLY_SKIPPED already-zero')
    }

    phase = 'zero-count-verification'
    const postResult = ssh(
      config,
      `cd -- ${config.apiRoot} && ${config.php} ops/paddle-reconciliation-cutover.php --check`,
      [0, 1],
    )
    const post = parseCheckOutput(postResult.stdout)
    if (
      postResult.status !== 0
      || post.grantBackedUnreconciledTransactions !== 0
      || post.unresolvedReconciliationBlocks !== 0
    ) {
      fail(`zero-count-failed:grant=${post.grantBackedUnreconciledTransactions},blocks=${post.unresolvedReconciliationBlocks}`)
    }
    console.log('ZERO_COUNT_OK')

    phase = 'auth-preflight'
    runProductionCheck('production:preflight')
    console.log('AUTH_PREFLIGHT_OK')

    phase = 'cors-probe'
    runProductionCheck('production:cors-probe')
    console.log('CORS_OK')

    phase = 'http-security'
    await verifyHttpSecurity()
    console.log('HTTP_SECURITY_OK')

    console.log('POSTCHECK_OK')
    console.log('CUTOVER_COMPLETE')
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    console.error(`CUTOVER_FINALIZER_STOPPED phase=${phase} reason=${reason}`)
    process.exitCode = 1
  }
}

if (process.argv[1]) {
  const current = new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href
  if (import.meta.url === current) {
    await main()
  }
}
