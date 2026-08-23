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

// Issue #29: replays the Tamamizu Guide on demand — pure UI, no
// learning-progress side effects.
describe('SettingsPage "View introduction again" (Issue #29)', () => {
  it('is present', () => {
    const { getByText } = render(<SettingsPage />)
    expect(getByText('View introduction again')).toBeInTheDocument()
  })

  it('clicking it resets hasCompletedIntroGuide to false, without touching learning progress', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    useProgressStore.getState().markRowTaught('a-row')
    const { getByText } = render(<SettingsPage />)

    fireEvent.click(getByText('View introduction again'))

    const state = useProgressStore.getState()
    expect(state.hasCompletedIntroGuide).toBe(false)
    expect(state.taughtRowIds).toEqual(['a-row'])
  })
})
