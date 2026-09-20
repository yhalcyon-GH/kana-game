import { spawnSync } from 'node:child_process'
import {
  buildCorsFixSshInvocation,
  readSafeCorsFixResult,
} from './productionReadOnlySsh.mjs'

const approved = process.argv.includes('--approve')
if (!approved) {
  console.error('Production CORS config fix refused: rerun with --approve after explicit human approval.')
  process.exit(2)
}

try {
  const invocation = buildCorsFixSshInvocation(process.env)
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    input: invocation.input,
    timeout: 20_000,
    windowsHide: true,
  })

  if (result.error) {
    throw new Error('SSH could not be started. Check the local key path and SSH client installation.')
  }
  if (result.signal) {
    throw new Error('SSH did not finish safely.')
  }

  const report = readSafeCorsFixResult(result.status, result.stdout, result.stderr)
  if (!report.ok) {
    console.error(`Production CORS config fix refused/rolled back: ${report.reason}`)
    process.exit(1)
  }

  console.log(
    `Production CORS config updated safely: beforeCount=${report.beforeCount} afterCount=${report.afterCount} backupCreated=${report.backupCreated}`,
  )
  process.exit(0)
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown failure.'
  console.error(`Production CORS config fix refused: ${message}`)
  process.exit(2)
}
