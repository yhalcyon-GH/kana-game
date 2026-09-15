import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkDeclaredLicenseFilesExist,
  checkStrokesvgKleeProvenance,
  checkThirdPartyNoticesReachableFromLegalArea,
  checkThirdPartyNoticesRoute,
  extractDeclaredLicenseFiles,
  runCommercialReadinessAudit,
} from './auditCommercialReadiness.mjs'

const VALID_APP_TSX = `
import { ThirdPartyNoticesPage } from './routes/ThirdPartyNoticesPage'
<Route path="/third-party-notices" element={<ThirdPartyNoticesPage />} />
`

const VALID_ABOUT_CONTENT = `<Link to="/third-party-notices" className="underline">Third-Party Notices</Link>`

describe('checkThirdPartyNoticesRoute', () => {
  it('passes when the import and route are both present', () => {
    expect(checkThirdPartyNoticesRoute(VALID_APP_TSX)).toEqual([])
  })

  it('fails when the route import is removed', () => {
    const mutated = VALID_APP_TSX.replace(
      "import { ThirdPartyNoticesPage } from './routes/ThirdPartyNoticesPage'",
      '',
    )
    expect(checkThirdPartyNoticesRoute(mutated)).toEqual([
      'src/App.tsx no longer imports ThirdPartyNoticesPage.',
    ])
  })

  it('fails when the <Route> registration is removed', () => {
    const mutated = VALID_APP_TSX.replace(
      '<Route path="/third-party-notices" element={<ThirdPartyNoticesPage />} />',
      '',
    )
    expect(checkThirdPartyNoticesRoute(mutated)).toEqual([
      'The /third-party-notices route is no longer registered in src/App.tsx.',
    ])
  })
})

describe('checkThirdPartyNoticesReachableFromLegalArea', () => {
  it('passes when the legal/about area links to the notices page', () => {
    expect(checkThirdPartyNoticesReachableFromLegalArea(VALID_ABOUT_CONTENT)).toEqual([])
  })

  it('fails when the link is removed', () => {
    expect(checkThirdPartyNoticesReachableFromLegalArea('<p>No legal links here</p>')).toEqual([
      'No link to /third-party-notices found in the in-app legal/about area (src/components/AboutContent.tsx).',
    ])
  })
})

describe('extractDeclaredLicenseFiles', () => {
  it('captures both NoticeEntry.licenseFile values and direct licenseHref(...) literals', () => {
    const source = `
      licenseHref('strokesvg-LICENSE.txt')
      licenseHref('strokesvg-LICENSE.txt')
      { licenseFile: 'react-LICENSE.txt' }
      { licenseFile: 'zustand-LICENSE.txt' }
    `
    expect(extractDeclaredLicenseFiles(source)).toEqual([
      'react-LICENSE.txt',
      'strokesvg-LICENSE.txt',
      'zustand-LICENSE.txt',
    ])
  })

  it('returns an empty list when nothing is declared', () => {
    expect(extractDeclaredLicenseFiles('no declarations here')).toEqual([])
  })
})

describe('checkDeclaredLicenseFilesExist', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('passes when every declared file exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'audit-licenses-'))
    writeFileSync(join(dir, 'react-LICENSE.txt'), 'MIT')
    expect(checkDeclaredLicenseFilesExist(['react-LICENSE.txt'], dir)).toEqual([])
  })

  it('fails clearly when a declared license file is missing on disk', () => {
    dir = mkdtempSync(join(tmpdir(), 'audit-licenses-'))
    expect(checkDeclaredLicenseFilesExist(['missing-LICENSE.txt'], dir)).toEqual([
      'Declared licenseFile "missing-LICENSE.txt" does not exist under public/licenses/.',
    ])
  })

  it('fails with a self-check message when no licenseFile declarations are found at all', () => {
    expect(checkDeclaredLicenseFilesExist([], '/nonexistent')).toEqual([
      'No licenseFile declarations were found in src/routes/ThirdPartyNoticesPage.tsx (self-check regression).',
    ])
  })
})

describe('checkStrokesvgKleeProvenance', () => {
  let vendorDir: string
  let licensesDir: string

  afterEach(() => {
    if (vendorDir) rmSync(vendorDir, { recursive: true, force: true })
    if (licensesDir) rmSync(licensesDir, { recursive: true, force: true })
  })

  function makeDirs() {
    vendorDir = mkdtempSync(join(tmpdir(), 'audit-vendor-'))
    licensesDir = mkdtempSync(join(tmpdir(), 'audit-licenses-'))
  }

  it('passes when the vendor license/provenance and shipped notice file all exist', () => {
    makeDirs()
    writeFileSync(join(vendorDir, 'LICENSE'), 'OFL')
    writeFileSync(join(vendorDir, 'PROVENANCE.md'), '# provenance')
    writeFileSync(join(licensesDir, 'strokesvg-LICENSE.txt'), 'OFL')
    expect(checkStrokesvgKleeProvenance({ vendorDir, licensesDir })).toEqual([])
  })

  it('fails when the vendored LICENSE is missing', () => {
    makeDirs()
    writeFileSync(join(vendorDir, 'PROVENANCE.md'), '# provenance')
    writeFileSync(join(licensesDir, 'strokesvg-LICENSE.txt'), 'OFL')
    expect(checkStrokesvgKleeProvenance({ vendorDir, licensesDir })).toEqual([
      'vendor/strokesvg/LICENSE (checked-in vendor license source for strokesvg/Klee One) is missing.',
    ])
  })

  it('fails when the vendored PROVENANCE.md is missing', () => {
    makeDirs()
    writeFileSync(join(vendorDir, 'LICENSE'), 'OFL')
    writeFileSync(join(licensesDir, 'strokesvg-LICENSE.txt'), 'OFL')
    expect(checkStrokesvgKleeProvenance({ vendorDir, licensesDir })).toEqual([
      'vendor/strokesvg/PROVENANCE.md (checked-in vendor provenance source for strokesvg/Klee One) is missing.',
    ])
  })

  it('fails when the shipped notice file the UI links to is missing', () => {
    makeDirs()
    writeFileSync(join(vendorDir, 'LICENSE'), 'OFL')
    writeFileSync(join(vendorDir, 'PROVENANCE.md'), '# provenance')
    expect(checkStrokesvgKleeProvenance({ vendorDir, licensesDir })).toEqual([
      'public/licenses/strokesvg-LICENSE.txt (shipped notice file the UI links to) is missing.',
    ])
  })
})

describe('runCommercialReadinessAudit', () => {
  it('passes against the current repository checkout', () => {
    expect(runCommercialReadinessAudit()).toEqual([])
  })

  it('fails when pointed at an empty directory tree (no App.tsx to read)', () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'audit-empty-root-'))
    try {
      expect(() => runCommercialReadinessAudit(emptyRoot)).toThrow()
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true })
    }
  })
})
