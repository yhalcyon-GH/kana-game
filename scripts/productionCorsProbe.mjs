import { spawnSync } from 'node:child_process'
import { buildCorsProbeSshInvocation, readSafeCorsProbeResult } from './productionReadOnlySsh.mjs'

try {
  const invocation = buildCorsProbeSshInvocation(process.env)
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

  const report = readSafeCorsProbeResult(result.status, result.stdout, result.stderr)
  if (!report.corsExact) {
    console.error(`Production CORS probe failed: corsExact=false originCount=${report.originCount}. Configured origin values were intentionally not displayed.`)
    process.exit(1)
  }

  console.log(`Production CORS probe passed: corsExact=true originCount=${report.originCount}`)
  process.exit(0)
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown failure.'
  console.error(`Production CORS probe refused: ${message}`)
  process.exit(2)
}
