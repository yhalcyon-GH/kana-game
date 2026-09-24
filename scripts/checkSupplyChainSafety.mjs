import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Deterministic, offline supply-chain guard. It does not run or fetch
// anything; it only reads package-lock.json, package.json, and the
// workflow YAML already checked into this repository and mechanically
// enforces a narrow, exact-version install-script review policy plus a
// CI Actions pinning policy. It must stay offline and side-effect-free,
// the same way checkPreLiveSafety.mjs and auditCommercialReadiness.mjs
// are offline and side-effect-free.

const EXACT_VERSION_KEY = /^(@[^/@]+\/[^@]+|[^@]+)@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const FULL_SHA = /^[0-9a-f]{40}$/i

/**
 * Every package-lock.json v2/v3 "packages" entry is keyed by its
 * node_modules install path. The package name is always the last path
 * segment after the final "node_modules/", including the scope for
 * scoped packages (e.g. "node_modules/@scope/pkg" -> "@scope/pkg").
 */
export function findLifecyclePackages(lockfile) {
  const packages = lockfile.packages || {}
  const found = []
  for (const [path, info] of Object.entries(packages)) {
    if (!info || !info.hasInstallScript) continue
    const marker = 'node_modules/'
    const index = path.lastIndexOf(marker)
    if (index === -1) continue
    const name = path.slice(index + marker.length)
    const version = info.version
    if (!name || !version) continue
    found.push({ name, version, key: name + '@' + version })
  }
  found.sort((a, b) => a.key.localeCompare(b.key))
  return found
}

export function checkAllowScriptsCoverage(lifecyclePackages, allowScripts) {
  const failures = []
  const approvals = allowScripts || {}
  for (const { key } of lifecyclePackages) {
    if (!(key in approvals)) {
      failures.push(
        'package-lock.json has an install script for "' + key + '" with no exact-version '
        + 'package.json allowScripts entry. Add "' + key + '": true (or false to deny) after review.',
      )
      continue
    }
    if (typeof approvals[key] !== 'boolean') {
      failures.push('package.json allowScripts["' + key + '"] must be a boolean (true/false), not ' + JSON.stringify(approvals[key]) + '.')
    }
  }
  return failures
}

export function checkAllowScriptsKeysAreExactVersions(allowScripts) {
  const failures = []
  for (const key of Object.keys(allowScripts || {})) {
    if (!EXACT_VERSION_KEY.test(key)) {
      failures.push(
        'package.json allowScripts key "' + key + '" is not an exact "name@version" pin. '
        + 'Broad, unversioned, or range-based lifecycle-script approvals are not allowed.',
      )
    }
  }
  return failures
}

export function checkAllowScriptsHasNoStalePackageEntries(lifecyclePackages, allowScripts) {
  const failures = []
  const currentKeys = new Set(lifecyclePackages.map((p) => p.key))
  for (const key of Object.keys(allowScripts || {})) {
    if (!EXACT_VERSION_KEY.test(key)) continue
    if (!currentKeys.has(key)) {
      failures.push(
        'package.json allowScripts["' + key + '"] no longer matches any hasInstallScript package in '
        + 'package-lock.json. Remove the stale entry so approvals stay reviewed against real lifecycle scripts.',
      )
    }
  }
  return failures
}

export function extractWorkflowActionRefs(workflowSource) {
  const refs = []
  for (const match of workflowSource.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)) {
    const value = match[1].replace(/^['"]|['"]$/g, '')
    if (value.startsWith('./') || value.startsWith('docker://')) continue
    const atIndex = value.lastIndexOf('@')
    if (atIndex === -1) continue
    refs.push({ action: value.slice(0, atIndex), ref: value.slice(atIndex + 1) })
  }
  return refs
}

export function checkWorkflowActionsArePinnedToFullSha(workflowSource, path) {
  const failures = []
  for (const { action, ref } of extractWorkflowActionRefs(workflowSource)) {
    if (!FULL_SHA.test(ref)) {
      failures.push(path + ' uses "' + action + '@' + ref + '", which is not pinned to a full 40-hex commit SHA.')
    }
  }
  return failures
}

export function checkWorkflowRejectsPullRequestTarget(workflowSource, path) {
  if (/^\s*pull_request_target\s*:/m.test(workflowSource)) {
    return [path + ' uses the pull_request_target trigger, which is not allowed in this repository.']
  }
  return []
}

function listWorkflowFileNames(root) {
  const dir = join(root, '.github/workflows')
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  return entries
    .filter((entry) => /\.ya?ml$/i.test(entry))
    .filter((entry) => statSync(join(dir, entry)).isFile())
    .sort()
}

export function runSupplyChainSafetyAudit(root = process.cwd()) {
  const failures = []

  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const lockfile = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  const allowScripts = packageJson.allowScripts || {}

  const lifecyclePackages = findLifecyclePackages(lockfile)
  failures.push(...checkAllowScriptsCoverage(lifecyclePackages, allowScripts))
  failures.push(...checkAllowScriptsKeysAreExactVersions(allowScripts))
  failures.push(...checkAllowScriptsHasNoStalePackageEntries(lifecyclePackages, allowScripts))

  for (const fileName of listWorkflowFileNames(root)) {
    const path = '.github/workflows/' + fileName
    const source = readFileSync(join(root, '.github/workflows', fileName), 'utf8')
    failures.push(...checkWorkflowActionsArePinnedToFullSha(source, path))
    failures.push(...checkWorkflowRejectsPullRequestTarget(source, path))
  }

  return failures
}

// A regression here would make the audit silently vacuous, the same way
// checkPreLiveSafety.mjs and auditCommercialReadiness.mjs guard their own
// matchers.
function selfCheck() {
  const failures = []
  if (!EXACT_VERSION_KEY.test('esbuild@0.28.1') || EXACT_VERSION_KEY.test('esbuild')) {
    failures.push('Internal regression: exact-version key matcher is not active.')
  }
  if (!FULL_SHA.test('a'.repeat(40)) || FULL_SHA.test('v4')) {
    failures.push('Internal regression: full-SHA matcher is not active.')
  }
  if (checkWorkflowActionsArePinnedToFullSha('uses: actions/checkout@v4', 'x').length !== 1) {
    failures.push('Internal regression: workflow action-pin matcher is not active.')
  }
  if (checkWorkflowRejectsPullRequestTarget('on:\n  pull_request_target:\n', 'x').length !== 1) {
    failures.push('Internal regression: pull_request_target matcher is not active.')
  }
  if (findLifecyclePackages({ packages: { 'node_modules/foo': { version: '1.0.0', hasInstallScript: true } } }).length !== 1) {
    failures.push('Internal regression: lockfile hasInstallScript matcher is not active.')
  }
  return failures
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = [...selfCheck(), ...runSupplyChainSafetyAudit()]

  if (failures.length > 0) {
    console.error('Supply-chain safety check failed:')
    for (const failure of failures) console.error('- ' + failure)
    process.exit(1)
  }

  console.log(
    'Supply-chain safety check passed: every package-lock.json lifecycle script has an exact-version '
    + 'package.json allowScripts entry, no broad/unversioned/stale approvals exist, and every external '
    + 'GitHub Actions "uses:" reference is pinned to a full commit SHA with no pull_request_target trigger.',
  )
}
