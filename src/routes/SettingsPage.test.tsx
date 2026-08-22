import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProgressStore } from '../store/progressStore'
import { SettingsPage } from './SettingsPage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

// Issue #19: "Always show romaji hints" opts into showing Listening/Word
// Builder's per-question romaji hint from the start. It is unrelated to
// Learn/Tracing (always show romaji already) and Kana Quiz/Kana Typing
// (unaffected by this setting entirely) — see progressStore.ts's comment.
describe('SettingsPage "Always show romaji hints" (Issue #19)', () => {
  it('is present and defaults to unchecked (OFF)', () => {
    const { getByText } = render(<SettingsPage />)
    const label = getByText('Always show romaji hints').closest('label')!
    const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox).not.toBeNull()
    expect(checkbox.checked).toBe(false)
  })

  it('toggling it updates the persisted store setting', () => {
    const { getByText } = render(<SettingsPage />)
    const label = getByText('Always show romaji hints').closest('label')!
    const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement

    fireEvent.click(checkbox)

    expect(useProgressStore.getState().alwaysShowRomajiHints).toBe(true)
  })
})
