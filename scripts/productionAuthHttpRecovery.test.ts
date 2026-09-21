import { describe, expect, it } from 'vitest'
import {
  isWebTraversableMode,
  parsePermissionReport,
} from './productionAuthHttpRecovery.mjs'

describe('production auth HTTP recovery', () => {
  it('parses the fixed permission report', () => {
    expect(parsePermissionReport(
      'authDirMode=700 phpFileCount=8 symlinkCount=0\n',
    )).toEqual({
      authDirMode: '700',
      phpFileCount: 8,
      symlinkCount: 0,
    })
  })

  it('accepts CRLF and ordinary web-readable modes', () => {
    expect(parsePermissionReport(
      'authDirMode=755 phpFileCount=8 symlinkCount=0\r\n',
    ).authDirMode).toBe('755')

    expect(isWebTraversableMode('755')).toBe(true)
    expect(isWebTraversableMode('705')).toBe(true)
    expect(isWebTraversableMode('700')).toBe(false)
    expect(isWebTraversableMode('750')).toBe(false)
  })

  it('fails closed on malformed diagnostic output', () => {
    expect(() => parsePermissionReport('')).toThrow()
    expect(() => parsePermissionReport(
      'authDirMode=755 phpFileCount=x symlinkCount=0',
    )).toThrow()
    expect(() => parsePermissionReport(
      'authDirMode=755 phpFileCount=8',
    )).toThrow()
  })
})
