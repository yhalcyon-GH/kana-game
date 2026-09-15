import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildReleaseIntegritySshInvocation, readSafeReleaseIntegrityResult } from './productionReadOnlySsh.mjs'

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function walkFiles(root, directory, files) {
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry)
    if (statSync(absolute).isDirectory()) {
      walkFiles(root, absolute, files)
    } else {
      files.push(relative(root, absolute).split(sep).join('/'))
    }
  }
}

export function calculateReleaseFingerprint(apiSourceRoot = join(process.cwd(), 'server')) {
  const manifest = JSON.parse(readFileSync(join(apiSourceRoot, 'ops/release-integrity-manifest.json'), 'utf8'))
  const files = []

  for (const directory of manifest.directories) {
    walkFiles(apiSourceRoot, join(apiSourceRoot, directory), files)
  }
  for (const file of manifest.files) {
    if (file.includes('..')) throw new Error('Unsafe release manifest path.')
    files.push(file)
  }

  const lines = [...new Set(files)].sort().map(file => `${file}:${hashFile(join(apiSourceRoot, file))}`)
  return createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex')
}

try {
  const expectedFingerprint = calculateReleaseFingerprint()
  const invocation = buildReleaseIntegritySshInvocation(process.env)
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true,
  })

  if (result.error) throw new Error('SSH could not be started. Check the local key path and SSH client installation.')
  if (result.signal) throw new Error('SSH did not finish safely.')

  const deployedFingerprint = readSafeReleaseIntegrityResult(result.status, result.stdout, result.stderr)
  if (deployedFingerprint !== expectedFingerprint) {
    throw new Error('The deployed API release does not match this reviewed checkout. Output was intentionally redacted.')
  }

  console.log('Production release-integrity check passed: deployed API code matches this reviewed checkout.')
  process.exit(0)
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown failure.'
  console.error(`Production release-integrity check refused: ${message}`)
  process.exit(2)
}
