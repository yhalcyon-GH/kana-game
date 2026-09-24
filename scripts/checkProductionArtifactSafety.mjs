// Deterministic, offline safety gate for the actual built PWA artifact
// (normally `dist/`, produced by `npm run build`) before it is uploaded to
// GitHub Pages. This is intentionally narrow and fail-closed: it only
// mechanically protects two specific properties —
//
//   1. Tamamizu is a PWA and must never ship a native installer/executable
//      (an .exe, .apk, .dmg, ... or a .bat/.cmd/.ps1 script launcher) as app
//      content, even by accident (e.g. a stray file copied into public/).
//   2. The built HTML and generated service-worker JS must not load an
//      executable script from a cross-origin host relative to the intended
//      Production origin (https://app.tamamizu.giganihongo.com) — this
//      would indicate a supply-chain/config regression, not a real product
//      need (see docs/security/pwa-security-incident-response.md).
//
// It never fetches anything and never mutates the artifact; see
// `npm run check:prelive` / `npm run audit:commercial` for the repository's
// other offline, deterministic release gates this complements.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// The Production origin this app is intended to be served from (see
// vite.config.ts's resolveBasePath() comment and
// docs/adr/0001-cross-site-auth-transport.md Phase 8). Any absolute or
// protocol-relative script/importScripts URL that resolves to a different
// origin than this is treated as an unexpected cross-origin executable
// script import. Same-origin absolute-path and relative URLs always resolve
// to this origin and are never flagged.
export const TAMAMIZU_ORIGIN = 'https://app.tamamizu.giganihongo.com'

// Native installer/executable extensions Tamamizu policy says it never
// distributes (it is a PWA, not a native app), plus script launchers a
// learner should never receive as app content. Deliberately does NOT
// include normal web assets (.js, .mjs, .css, .wasm, audio, images, fonts,
// .json, ...).
export const FORBIDDEN_EXTENSIONS = new Set([
  '.exe', '.msi', '.msix', '.appx', '.apk', '.dmg', '.pkg', '.scr', '.com',
  '.bat', '.cmd', '.ps1',
])

const HTML_EXTENSION_PATTERN = /\.html?$/i

// vite-plugin-pwa's `generateSW` mode — this project's mode; see
// vite.config.ts's VitePWA() call, which sets no `strategies`/`filename`
// override — emits a fixed-name `sw.js` entry plus a content-hashed
// `workbox-<hash>.js` runtime support file at the root of the build output.
const SERVICE_WORKER_FILENAME_PATTERN = /^(sw|workbox-[a-z0-9]+)\.js$/i

// Matches `<script ... src="...">` / `src='...'` / `src=unquoted`, requiring
// whitespace before `src` so `data-src`-style attributes are not matched.
const SCRIPT_SRC_PATTERN = /<script\b[^>]*\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^>]*>/gi

// Only matches a LITERAL string-argument importScripts() call, e.g.
// importScripts("https://evil.example/x.js"). Deliberately does not match
// importScripts(variable) or scan JS source for bare URL-shaped strings —
// workbox's own generated loader calls importScripts() with a computed
// variable (see dist/sw.js after a build), which must not be flagged.
const IMPORT_SCRIPTS_LITERAL_PATTERN = /importScripts\s*\(\s*(["'])(https?:\/\/[^"']*)\1\s*\)/gi

function walkFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry)
    if (statSync(absolutePath).isDirectory()) {
      walkFiles(absolutePath, files)
    } else {
      files.push(absolutePath)
    }
  }
  return files
}

function toRelativePath(root, absolutePath) {
  return relative(root, absolutePath).split(sep).join('/')
}

function resolveUrl(url) {
  try {
    return new URL(url, `${TAMAMIZU_ORIGIN}/`)
  } catch {
    return null
  }
}

function isCrossOrigin(url) {
  const resolved = resolveUrl(url)
  if (!resolved) return false
  // Only http(s) network fetches are in scope; data:/blob: script sources
  // resolve to an opaque origin and are not an external cross-origin fetch.
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return false
  return resolved.origin !== TAMAMIZU_ORIGIN
}

export function findForbiddenExtensionFiles(relativeFilePaths) {
  return relativeFilePaths.filter((path) => FORBIDDEN_EXTENSIONS.has(extname(path).toLowerCase()))
}

export function findCrossOriginHtmlScriptSrcs(htmlSource) {
  const offenders = []
  for (const match of htmlSource.matchAll(SCRIPT_SRC_PATTERN)) {
    const src = match[1] ?? match[2] ?? match[3] ?? ''
    if (isCrossOrigin(src)) offenders.push(src)
  }
  return offenders
}

export function findCrossOriginImportScripts(jsSource) {
  const offenders = []
  for (const match of jsSource.matchAll(IMPORT_SCRIPTS_LITERAL_PATTERN)) {
    const url = match[2]
    if (isCrossOrigin(url)) offenders.push(url)
  }
  return offenders
}

export function checkProductionArtifactSafety(targetDir) {
  if (!existsSync(targetDir)) {
    throw new Error(`Build artifact directory not found: ${targetDir} (run "npm run build" first).`)
  }
  if (!statSync(targetDir).isDirectory()) {
    throw new Error(`Build artifact path is not a directory: ${targetDir}`)
  }

  const absoluteFiles = walkFiles(targetDir)
  const relativeFiles = absoluteFiles.map((file) => toRelativePath(targetDir, file))
  const failures = []

  for (const offender of findForbiddenExtensionFiles(relativeFiles)) {
    failures.push(`Forbidden shipped file extension "${extname(offender).toLowerCase()}": ${offender}`)
  }

  let htmlFilesScanned = 0
  let serviceWorkerFilesScanned = 0

  for (const absoluteFile of absoluteFiles) {
    const relativeFile = toRelativePath(targetDir, absoluteFile)
    const basename = relativeFile.split('/').pop()

    if (HTML_EXTENSION_PATTERN.test(basename)) {
      htmlFilesScanned += 1
      const source = readFileSync(absoluteFile, 'utf8')
      for (const src of findCrossOriginHtmlScriptSrcs(source)) {
        failures.push(`Cross-origin <script src> in ${relativeFile}: ${src}`)
      }
    }

    if (SERVICE_WORKER_FILENAME_PATTERN.test(basename)) {
      serviceWorkerFilesScanned += 1
      const source = readFileSync(absoluteFile, 'utf8')
      for (const url of findCrossOriginImportScripts(source)) {
        failures.push(`Cross-origin importScripts() in ${relativeFile}: ${url}`)
      }
    }
  }

  return {
    failures,
    summary: {
      filesScanned: relativeFiles.length,
      htmlFilesScanned,
      serviceWorkerFilesScanned,
    },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targetDir = process.argv[2] || 'dist'
  try {
    const { failures, summary } = checkProductionArtifactSafety(targetDir)
    if (failures.length > 0) {
      console.error(`Production artifact safety check FAILED (${failures.length} issue(s)):`)
      for (const failure of failures) console.error(`  - ${failure}`)
      process.exit(1)
    }
    console.log(
      `Production artifact safety check passed: ${summary.filesScanned} file(s) scanned, `
      + `${summary.htmlFilesScanned} HTML file(s) checked for cross-origin <script src>, `
      + `${summary.serviceWorkerFilesScanned} service-worker file(s) checked for cross-origin importScripts().`,
    )
    process.exit(0)
  } catch (error) {
    console.error(`Production artifact safety check refused: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
