import { describe, expect, it } from 'vitest'
import {
  decideReconciliation,
  parseApplyOutput,
  parseCheckOutput,
  productionCheckScript,
} from './productionSecurityCutoverFinalizer.mjs'

describe('production security cutover finalizer parsing', () => {
  it('accepts zero reconciliation counts with LF and CRLF', () => {
    expect(parseCheckOutput(
      'grantBackedUnreconciledTransactions=0\nunresolvedReconciliationBlocks=0\n',
    )).toEqual({
      grantBackedUnreconciledTransactions: 0,
      unresolvedReconciliationBlocks: 0,
    })

    expect(parseCheckOutput(
      'grantBackedUnreconciledTransactions=2\r\nunresolvedReconciliationBlocks=0\r\n',
    )).toEqual({
      grantBackedUnreconciledTransactions: 2,
      unresolvedReconciliationBlocks: 0,
    })
  })

  it('chooses skip, apply, and blocked conservatively', () => {
    expect(decideReconciliation({
      grantBackedUnreconciledTransactions: 0,
      unresolvedReconciliationBlocks: 0,
    })).toBe('skip')

    expect(decideReconciliation({
      grantBackedUnreconciledTransactions: 2,
      unresolvedReconciliationBlocks: 0,
    })).toBe('apply')

    expect(decideReconciliation({
      grantBackedUnreconciledTransactions: 0,
      unresolvedReconciliationBlocks: 1,
    })).toBe('blocked')
  })

  it('accepts the actual post-0009 three-line apply output', () => {
    expect(parseApplyOutput(
      'grantBackedUnreconciledTransactions=2\n'
      + 'unresolvedReconciliationBlocks=0\n'
      + 'reconciledTransactions=2 remainingGrantBackedUnreconciledTransactions=0 unresolvedReconciliationBlocks=0\n',
    )).toEqual({
      grantBackedUnreconciledTransactionsBefore: 2,
      unresolvedReconciliationBlocksBefore: 0,
      reconciledTransactions: 2,
      remainingGrantBackedUnreconciledTransactions: 0,
      unresolvedReconciliationBlocksAfter: 0,
    })
  })

  it('maps production checks directly to Node scripts without npm', () => {
    expect(productionCheckScript('production:release-integrity')).toBe(
      'scripts/productionReleaseIntegrity.mjs',
    )
    expect(productionCheckScript('production:preflight')).toBe(
      'scripts/productionReadOnlyPreflight.mjs',
    )
    expect(productionCheckScript('production:cors-probe')).toBe(
      'scripts/productionCorsProbe.mjs',
    )
    expect(() => productionCheckScript('production:unknown')).toThrow()
  })

  it('fails closed on malformed or incomplete output', () => {
    expect(() => parseCheckOutput('grantBackedUnreconciledTransactions=0')).toThrow()
    expect(() => parseCheckOutput(
      'grantBackedUnreconciledTransactions=x\nunresolvedReconciliationBlocks=0',
    )).toThrow()
    expect(() => parseApplyOutput(
      'grantBackedUnreconciledTransactions=0\n'
      + 'reconciledTransactions=0 remainingGrantBackedUnreconciledTransactions=0 unresolvedReconciliationBlocks=0\n',
    )).toThrow()
  })
})
