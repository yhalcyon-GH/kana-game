import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Deterministic, offline commercial-readiness audit. This is intentionally
// narrow: it mechanically protects the currently declared commercial
// notice/provenance contract (Third-Party Notices route + declared license
// files + strokesvg/Klee One provenance), and nothing else. It does not
// fetch license data, does not judge license compatibility, and does not
// read/print server/config.php, .env, .env.local, or any other secret/
// production file — `npm run check:prelive` remains the sole secret/AI-
// runtime authority; this script must not duplicate or weaken it.

export function checkThirdPartyNoticesRoute(appTsxSource) {
  const failures = []
  if (!/from\s+['"]\.\/routes\/ThirdPartyNoticesPage['"]/.test(appTsxSource)) {
    failures.push('src/App.tsx no longer imports ThirdPartyNoticesPage.')
  }
  if (!/<Route\s+path=["']\/third-party-notices["']\s+element=\{<ThirdPartyNoticesPage\s*\/>\}\s*\/>/.test(appTsxSource)) {
    failures.push('The /third-party-notices route is no longer registered in src/App.tsx.')
  }
  return failures
}

export function checkThirdPartyNoticesReachableFromLegalArea(aboutContentSource) {
  if (/<Link\s+to=["']\/third-party-notices["']/.test(aboutContentSource)) return []
  return ['No link to /third-party-notices found in the in-app legal/about area (src/components/AboutContent.tsx).']
}

export function extractDeclaredLicenseFiles(thirdPartyNoticesSource) {
  const files = new Set()
  for (const match of thirdPartyNoticesSource.matchAll(/licenseFile:\s*'([^']+)'/g)) files.add(match[1])
  for (const match of thirdPartyNoticesSource.matchAll(/licenseHref\('([^']+)'\)/g)) files.add(match[1])
  return [...files].sort()
}

export function checkDeclaredLicenseFilesExist(declaredLicenseFiles, licensesDir) {
  const failures = []
  if (declaredLicenseFiles.length === 0) {
    failures.push('No licenseFile declarations were found in src/routes/ThirdPartyNoticesPage.tsx (self-check regression).')
    return failures
  }
  for (const file of declaredLicenseFiles) {
    if (!existsSync(join(licensesDir, file))) {
      failures.push(`Declared licenseFile "${file}" does not exist under public/licenses/.`)
    }
  }
  return failures
}

export function checkStrokesvgKleeProvenance({ vendorDir, licensesDir }) {
  const failures = []
  if (!existsSync(join(vendorDir, 'LICENSE'))) {
    failures.push('vendor/strokesvg/LICENSE (checked-in vendor license source for strokesvg/Klee One) is missing.')
  }
  if (!existsSync(join(vendorDir, 'PROVENANCE.md'))) {
    failures.push('vendor/strokesvg/PROVENANCE.md (checked-in vendor provenance source for strokesvg/Klee One) is missing.')
  }
  if (!existsSync(join(licensesDir, 'strokesvg-LICENSE.txt'))) {
    failures.push('public/licenses/strokesvg-LICENSE.txt (shipped notice file the UI links to) is missing.')
  }
  return failures
}

export function runCommercialReadinessAudit(root = process.cwd()) {
  const failures = []

  const appTsxSource = readFileSync(join(root, 'src/App.tsx'), 'utf8')
  failures.push(...checkThirdPartyNoticesRoute(appTsxSource))

  const aboutContentSource = readFileSync(join(root, 'src/components/AboutContent.tsx'), 'utf8')
  failures.push(...checkThirdPartyNoticesReachableFromLegalArea(aboutContentSource))

  const thirdPartyNoticesSource = readFileSync(join(root, 'src/routes/ThirdPartyNoticesPage.tsx'), 'utf8')
  const licensesDir = join(root, 'public/licenses')
  const declaredLicenseFiles = extractDeclaredLicenseFiles(thirdPartyNoticesSource)
  failures.push(...checkDeclaredLicenseFilesExist(declaredLicenseFiles, licensesDir))

  failures.push(...checkStrokesvgKleeProvenance({ vendorDir: join(root, 'vendor/strokesvg'), licensesDir }))

  return failures
}

// A regression here would make the audit silently vacuous, the same way
// checkPreLiveSafety.mjs guards its own matchers.
function selfCheck() {
  const failures = []
  if (checkThirdPartyNoticesRoute('').length !== 2) {
    failures.push('Internal regression: route matcher is not active.')
  }
  if (checkThirdPartyNoticesReachableFromLegalArea('').length !== 1) {
    failures.push('Internal regression: legal-area link matcher is not active.')
  }
  if (extractDeclaredLicenseFiles("licenseFile: 'x-LICENSE.txt'").length !== 1) {
    failures.push('Internal regression: licenseFile matcher is not active.')
  }
  return failures
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = [...selfCheck(), ...runCommercialReadinessAudit()]

  if (failures.length > 0) {
    console.error('Commercial-readiness audit failed:')
    for (const failure of failures) console.error('- ' + failure)
    process.exit(1)
  }

  console.log(
    'Commercial-readiness audit passed: the Third-Party Notices route is registered and reachable, every '
    + 'declared licenseFile exists under public/licenses/, and strokesvg/Klee One provenance is present. This '
    + 'is a narrow structural check, not a claim of exhaustive license compatibility.',
  )
}
