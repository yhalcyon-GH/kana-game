/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PWA_MANIFEST } from '../vite.config'

// PNG signature (8 bytes) + IHDR length (4 bytes) + "IHDR" (4 bytes) is
// always immediately followed by big-endian width then height, regardless
// of color type/interlacing — this holds for every valid PNG.
function pngDimensions(path: string): { width: number; height: number } {
  const buf = readFileSync(path)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const publicDir = join(process.cwd(), 'public')

describe('PWA manifest icon files', () => {
  it('exist on disk and match their declared pixel dimensions', () => {
    for (const icon of PWA_MANIFEST.icons) {
      const path = join(publicDir, icon.src)
      expect(existsSync(path), `${icon.src} should exist under public/`).toBe(true)

      const [declaredWidth, declaredHeight] = icon.sizes.split('x').map(Number)
      expect(pngDimensions(path)).toEqual({ width: declaredWidth, height: declaredHeight })
    }
  })
})

describe('index.html icon references', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
  const favicon = html.match(/rel="icon"[^>]*href="([^"]+)"/)?.[1]
  const appleTouchIcon = html.match(/rel="apple-touch-icon"[^>]*href="([^"]+)"/)?.[1]

  it('references the favicon and apple-touch-icon as root-relative public paths, so Vite prefixes them with `base` at build time for either deployment', () => {
    expect(favicon).toBe('/favicon.svg')
    expect(appleTouchIcon).toBe('/icons/apple-touch-icon.png')
  })

  it('points those references at files that actually exist under public/', () => {
    expect(favicon && existsSync(join(publicDir, favicon.replace(/^\//, '')))).toBe(true)
    expect(appleTouchIcon && existsSync(join(publicDir, appleTouchIcon.replace(/^\//, '')))).toBe(true)
  })
})
