import { describe, expect, it } from 'vitest'
import {
  checkAllowScriptsCoverage,
  checkAllowScriptsHasNoStalePackageEntries,
  checkAllowScriptsKeysAreExactVersions,
  checkNpmrcStrictAllowScripts,
  checkWorkflowActionsArePinnedToFullSha,
  checkWorkflowRejectsPullRequestTarget,
  extractWorkflowActionRefs,
  findLifecyclePackages,
  runSupplyChainSafetyAudit,
} from './checkSupplyChainSafety.mjs'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

describe('findLifecyclePackages', () => {
  it('finds top-level and scoped packages with hasInstallScript', () => {
    const lockfile = {
      packages: {
        '': { name: 'kana-game' },
        'node_modules/esbuild': { version: '0.28.1', hasInstallScript: true },
        'node_modules/@scope/pkg': { version: '1.2.3', hasInstallScript: true },
        'node_modules/no-script': { version: '9.9.9' },
      },
    }
    expect(findLifecyclePackages(lockfile)).toEqual([
      { name: '@scope/pkg', version: '1.2.3', key: '@scope/pkg@1.2.3' },
      { name: 'esbuild', version: '0.28.1', key: 'esbuild@0.28.1' },
    ])
  })

  it('resolves nested node_modules paths to the innermost package name', () => {
    const lockfile = {
      packages: {
        'node_modules/foo/node_modules/esbuild': { version: '0.28.1', hasInstallScript: true },
      },
    }
    expect(findLifecyclePackages(lockfile)).toEqual([
      { name: 'esbuild', version: '0.28.1', key: 'esbuild@0.28.1' },
    ])
  })
})

describe('checkAllowScriptsCoverage', () => {
  it('passes when every lifecycle package has a boolean exact-version entry', () => {
    const lifecyclePackages = [{ name: 'esbuild', version: '0.28.1', key: 'esbuild@0.28.1' }]
    expect(checkAllowScriptsCoverage(lifecyclePackages, { 'esbuild@0.28.1': true })).toEqual([])
  })

  it('fails when a lifecycle package has no allowScripts entry at all', () => {
    const lifecyclePackages = [{ name: 'fsevents', version: '2.3.3', key: 'fsevents@2.3.3' }]
    expect(checkAllowScriptsCoverage(lifecyclePackages, {})).toEqual([
      'package-lock.json has an install script for "fsevents@2.3.3" with no exact-version package.json '
      + 'allowScripts entry. Add "fsevents@2.3.3": true (or false to deny) after review.',
    ])
  })

  it('fails when an entry exists but is not a boolean', () => {
    const lifecyclePackages = [{ name: 'esbuild', version: '0.28.1', key: 'esbuild@0.28.1' }]
    expect(checkAllowScriptsCoverage(lifecyclePackages, { 'esbuild@0.28.1': 'true' })).toEqual([
      'package.json allowScripts["esbuild@0.28.1"] must be a boolean (true/false), not "true".',
    ])
  })

  it('treats an explicit false as covered (a reviewed denial)', () => {
    const lifecyclePackages = [{ name: 'fsevents', version: '2.3.3', key: 'fsevents@2.3.3' }]
    expect(checkAllowScriptsCoverage(lifecyclePackages, { 'fsevents@2.3.3': false })).toEqual([])
  })
})

describe('checkAllowScriptsKeysAreExactVersions', () => {
  it('accepts exact unscoped and scoped version pins', () => {
    expect(checkAllowScriptsKeysAreExactVersions({ 'esbuild@0.28.1': true, '@scope/pkg@1.2.3': false })).toEqual([])
  })

  it('rejects a bare package name with no version', () => {
    expect(checkAllowScriptsKeysAreExactVersions({ esbuild: true })).toEqual([
      'package.json allowScripts key "esbuild" is not an exact "name@version" pin. Broad, unversioned, or '
      + 'range-based lifecycle-script approvals are not allowed.',
    ])
  })

  it('rejects a semver range instead of an exact version', () => {
    expect(checkAllowScriptsKeysAreExactVersions({ 'esbuild@^0.28.1': true })).toEqual([
      'package.json allowScripts key "esbuild@^0.28.1" is not an exact "name@version" pin. Broad, unversioned, '
      + 'or range-based lifecycle-script approvals are not allowed.',
    ])
  })

  it('rejects a wildcard version', () => {
    expect(checkAllowScriptsKeysAreExactVersions({ 'esbuild@*': true })).toHaveLength(1)
  })
})


describe('checkNpmrcStrictAllowScripts', () => {
  it('passes only when strict-allow-scripts is explicitly true', () => {
    expect(checkNpmrcStrictAllowScripts('strict-allow-scripts=true\n')).toEqual([])
  })

  it('fails when the setting is missing', () => {
    expect(checkNpmrcStrictAllowScripts('fund=false\n')).toHaveLength(1)
  })

  it('fails when the setting is explicitly false', () => {
    expect(checkNpmrcStrictAllowScripts('strict-allow-scripts=false\n')).toHaveLength(1)
  })
})

describe('checkAllowScriptsHasNoStalePackageEntries', () => {
  it('passes when every exact-version entry matches a current lifecycle package', () => {
    const lifecyclePackages = [{ name: 'esbuild', version: '0.28.1', key: 'esbuild@0.28.1' }]
    expect(checkAllowScriptsHasNoStalePackageEntries(lifecyclePackages, { 'esbuild@0.28.1': true })).toEqual([])
  })

  it('fails when an approval no longer matches any lockfile package (stale/superseded version)', () => {
    const lifecyclePackages = [{ name: 'esbuild', version: '0.28.2', key: 'esbuild@0.28.2' }]
    expect(checkAllowScriptsHasNoStalePackageEntries(lifecyclePackages, { 'esbuild@0.28.1': true })).toEqual([
      'package.json allowScripts["esbuild@0.28.1"] no longer matches any hasInstallScript package in '
      + 'package-lock.json. Remove the stale entry so approvals stay reviewed against real lifecycle scripts.',
    ])
  })
})

describe('extractWorkflowActionRefs', () => {
  it('ignores local composite actions and docker actions', () => {
    const source = 'steps:\n  - uses: ./.github/actions/local\n  - uses: docker://alpine:3\n'
    expect(extractWorkflowActionRefs(source)).toEqual([])
  })

  it('extracts action and ref from a pinned external action', () => {
    const source = '      - uses: actions/checkout@' + SHA_A + ' # v7.0.1\n'
    expect(extractWorkflowActionRefs(source)).toEqual([{ action: 'actions/checkout', ref: SHA_A }])
  })
})

describe('checkWorkflowActionsArePinnedToFullSha', () => {
  it('passes when every external action ref is a full 40-hex SHA', () => {
    const source = '- uses: actions/checkout@' + SHA_A + ' # v7.0.1\n'
    expect(checkWorkflowActionsArePinnedToFullSha(source, '.github/workflows/x.yml')).toEqual([])
  })

  it('fails on a floating tag ref', () => {
    const source = '- uses: actions/checkout@v4\n'
    expect(checkWorkflowActionsArePinnedToFullSha(source, '.github/workflows/x.yml')).toEqual([
      '.github/workflows/x.yml uses "actions/checkout@v4", which is not pinned to a full 40-hex commit SHA.',
    ])
  })

  it('fails on a branch ref', () => {
    const source = '- uses: some-org/some-action@main\n'
    expect(checkWorkflowActionsArePinnedToFullSha(source, '.github/workflows/x.yml')).toHaveLength(1)
  })

  it('accepts a pinned reusable workflow with a subpath', () => {
    const source = 'uses: google/osv-scanner-action/.github/workflows/osv-scanner-reusable.yml@' + SHA_B + ' # v2.6.0\n'
    expect(checkWorkflowActionsArePinnedToFullSha(source, '.github/workflows/x.yml')).toEqual([])
  })
})

describe('checkWorkflowRejectsPullRequestTarget', () => {
  it('passes for a workflow using pull_request', () => {
    expect(checkWorkflowRejectsPullRequestTarget('on:\n  pull_request:\n', '.github/workflows/x.yml')).toEqual([])
  })

  it('fails for a workflow using pull_request_target', () => {
    expect(checkWorkflowRejectsPullRequestTarget('on:\n  pull_request_target:\n', '.github/workflows/x.yml')).toEqual([
      '.github/workflows/x.yml uses the pull_request_target trigger, which is not allowed in this repository.',
    ])
  })
})

describe('runSupplyChainSafetyAudit', () => {
  it('passes against the current repository checkout', () => {
    expect(runSupplyChainSafetyAudit()).toEqual([])
  })
})
