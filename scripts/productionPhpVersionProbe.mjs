import { spawnSync } from 'node:child_process'
import { buildPhpVersionProbeSshInvocation, readSafePhpVersionProbeResult } from './productionReadOnlySsh.mjs'

try {
  const invocation = buildPhpVersionProbeSshInvocation(process.env)
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

  const report = readSafePhpVersionProbeResult(result.status, result.stdout, result.stderr)
  if (!report.ok) {
    const message = report.reason === 'ssh-connection-failed'
      ? 'Production PHP version probe: SSH could not connect. No remote output was displayed.'
      : 'Production PHP version probe: the selected PHP CLI command is missing or returned an unrecognized response. No remote output was displayed.'
    console.error(message)
    process.exit(1)
  }

  console.log(`Production PHP version probe passed: php=${report.phpMajorMinor}`)
  process.exit(0)
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown failure.'
  console.error(`Production PHP version probe refused: ${message}`)
  process.exit(2)
}
