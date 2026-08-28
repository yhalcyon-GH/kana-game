import { fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { TUTORIAL_CATALOG } from '../data/guideCatalog'
import { useProgressStore } from '../store/progressStore'
import { SettingsPage } from './SettingsPage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="landed-path">{`${location.pathname}${location.search}`}</div>
}

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Issue #19: "Always show romaji hints" opts into showing Listening/Word
// Builder's per-question romaji hint from the start. It is unrelated to
// Learn/Tracing (always show romaji already) and Kana Quiz/Kana Typing
// (unaffected by this setting entirely) — see progressStore.ts's comment.
describe('SettingsPage "Always show romaji hints" (Issue #19)', () => {
  it('is present and defaults to unchecked (OFF)', () => {
    const { getByText } = renderSettings()
    const label = getByText('Always show romaji hints').closest('label')!
    const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox).not.toBeNull()
    expect(checkbox.checked).toBe(false)
  })

  it('toggling it updates the persisted store setting', () => {
    const { getByText } = renderSettings()
    const label = getByText('Always show romaji hints').closest('label')!
    const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement

    fireEvent.click(checkbox)

    expect(useProgressStore.getState().alwaysShowRomajiHints).toBe(true)
  })
})

// "Guides" was renamed to "Tutorials" and trimmed from 7 entries to 4 —
// Sokuon/Chōon/Yōon are hidden here (their Guide data/replay
// infrastructure stays intact in guideCatalog.ts's CONCEPT_GUIDE_CATALOG
// for a future "Ask Tamamizu" PR to surface from within each curriculum
// section).
describe('SettingsPage Tutorials list', () => {
  it('renders the "Tutorials" heading, not "Guides"', () => {
    const { getByText, queryByText } = renderSettings()
    expect(getByText('Tutorials')).toBeInTheDocument()
    expect(queryByText('Guides')).not.toBeInTheDocument()
  })

  it('lists exactly the four tutorial entries', () => {
    const { getByText } = renderSettings()
    for (const guide of TUTORIAL_CATALOG) {
      expect(getByText(guide.label)).toBeInTheDocument()
    }
    expect(TUTORIAL_CATALOG.map((g) => g.label)).toEqual([
      'How does KanaGame work?',
      'How do I learn & trace?',
      'How does Practice work?',
      'How does Review work?',
    ])
  })

  it('does not render Sokuon/Chōon/Yōon entries', () => {
    const { queryByText } = renderSettings()
    expect(queryByText('Sokuon')).not.toBeInTheDocument()
    expect(queryByText('Chōon')).not.toBeInTheDocument()
    expect(queryByText('Yōon')).not.toBeInTheDocument()
  })

  it('"How does KanaGame work?" replays the Introduction from step 1 via the existing flag toggle, without touching other progress', () => {
    useProgressStore.getState().setHasCompletedIntroGuide(true)
    useProgressStore.getState().markRowTaught('a-row')
    const { getByText } = renderSettings()

    fireEvent.click(getByText('How does KanaGame work?'))

    const state = useProgressStore.getState()
    expect(state.hasCompletedIntroGuide).toBe(false)
    expect(state.taughtRowIds).toEqual(['a-row'])
  })

  it.each([
    ['How do I learn & trace?', 'learnTracing', '/practice/hiragana/a-row'],
    ['How does Practice work?', 'practice', '/practice/hiragana/a-row'],
    ['How does Review work?', 'review', '/practice/review'],
  ])('selecting %s navigates to its real screen with a %s replay target', (label, id, path) => {
    const { getByText, getByTestId } = renderSettings()

    fireEvent.click(getByText(label))

    expect(getByTestId('landed-path')).toHaveTextContent(`${path}?guide=${id}`)
  })

  it.each(['How do I learn & trace?', 'How does Practice work?', 'How does Review work?'] as const)(
    'selecting %s does not touch any Guide completed flag or learning/progress state',
    (label) => {
      useProgressStore.getState().markRowTaught('a-row')
      const before = useProgressStore.getState()
      const guideFlagsBefore = {
        hasCompletedIntroGuide: before.hasCompletedIntroGuide,
        hasCompletedLearnTracingGuide: before.hasCompletedLearnTracingGuide,
        hasCompletedPracticeGuide: before.hasCompletedPracticeGuide,
        hasCompletedReviewGuide: before.hasCompletedReviewGuide,
        hasCompletedSokuonGuide: before.hasCompletedSokuonGuide,
        hasCompletedChouonGuide: before.hasCompletedChouonGuide,
        hasCompletedYouonGuide: before.hasCompletedYouonGuide,
      }
      const progressBefore = {
        taughtRowIds: before.taughtRowIds,
        rowActivityCompletion: before.rowActivityCompletion,
        characters: before.characters,
        words: before.words,
        unlockedRowIds: before.unlockedRowIds,
        lastStudied: before.lastStudied,
      }
      const { getByText } = renderSettings()

      fireEvent.click(getByText(label))

      const after = useProgressStore.getState()
      expect({
        hasCompletedIntroGuide: after.hasCompletedIntroGuide,
        hasCompletedLearnTracingGuide: after.hasCompletedLearnTracingGuide,
        hasCompletedPracticeGuide: after.hasCompletedPracticeGuide,
        hasCompletedReviewGuide: after.hasCompletedReviewGuide,
        hasCompletedSokuonGuide: after.hasCompletedSokuonGuide,
        hasCompletedChouonGuide: after.hasCompletedChouonGuide,
        hasCompletedYouonGuide: after.hasCompletedYouonGuide,
      }).toEqual(guideFlagsBefore)
      expect({
        taughtRowIds: after.taughtRowIds,
        rowActivityCompletion: after.rowActivityCompletion,
        characters: after.characters,
        words: after.words,
        unlockedRowIds: after.unlockedRowIds,
        lastStudied: after.lastStudied,
      }).toEqual(progressBefore)
    },
  )
})

// Mobile QA polish round: fresh/reset audio defaults should display as
// Volume 50% / Tamamizu's voice volume 50% / Speed 1.00x — the sliders use a
// 0-2 internal scale (see VOLUME_MAX in SettingsPage.tsx) where 1 is the
// midpoint, so the internal defaults are audioVolume=1, mascotVoiceVolume=1,
// audioSpeed=1. A user's own persisted values must never be overwritten by
// these fresh-state defaults.
describe('SettingsPage audio defaults (mobile QA polish)', () => {
  it('shows Volume 50%, Tamamizu\'s voice volume 50%, and Speed 1.00x on a fresh/reset store', () => {
    const { getByText } = renderSettings()
    expect(getByText('Volume').closest('label')).toHaveTextContent('50%')
    expect(getByText("Tamamizu's voice volume").closest('label')).toHaveTextContent('50%')
    expect(getByText('Speed').closest('label')).toHaveTextContent('1.00x')
  })

  it('does not overwrite a user\'s own persisted volume/speed values with these defaults', () => {
    useProgressStore.setState({
      audioVolume: 1.6,
      mascotVoiceVolume: 0.4,
      audioSpeed: 1.25,
    })
    const { getByText } = renderSettings()
    expect(getByText('Volume').closest('label')).toHaveTextContent('80%')
    expect(getByText("Tamamizu's voice volume").closest('label')).toHaveTextContent('20%')
    expect(getByText('Speed').closest('label')).toHaveTextContent('1.25x')
  })
})

// Mobile QA polish round: the Volume / voice volume / Speed audio-controls
// block moved above Tutorials (previously it sat below). Final order:
// Pronunciation audio, Tamamizu's voice reactions, Volume, Tamamizu's voice
// volume, Speed, Always show romaji hints, Tutorials.
describe('SettingsPage section order (mobile QA polish)', () => {
  it('renders the audio controls before "Always show romaji hints", which comes before "Tutorials"', () => {
    const { getByText } = renderSettings()
    const pronunciationAudioPos = getByText('Pronunciation audio').compareDocumentPosition(
      getByText('Always show romaji hints'),
    )
    const romajiVsTutorials = getByText('Always show romaji hints').compareDocumentPosition(getByText('Tutorials'))
    const volumeVsRomaji = getByText('Volume').compareDocumentPosition(getByText('Always show romaji hints'))
    const speedVsRomaji = getByText('Speed').compareDocumentPosition(getByText('Always show romaji hints'))

    // DOCUMENT_POSITION_FOLLOWING === 4: the second node comes after the first.
    expect(pronunciationAudioPos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(romajiVsTutorials & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(volumeVsRomaji & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(speedVsRomaji & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('SettingsPage audio control disabled states (mobile QA polish)', () => {
  it('disables Volume and Speed sliders when Pronunciation audio is off', () => {
    const { getByText } = renderSettings()
    const pronunciationCheckbox = getByText('Pronunciation audio').closest('label')!.querySelector('input')!
    fireEvent.click(pronunciationCheckbox)

    const volumeSlider = getByText('Volume').closest('label')!.querySelector('input[type="range"]')!
    const speedSlider = getByText('Speed').closest('label')!.querySelector('input[type="range"]')!
    expect(volumeSlider).toBeDisabled()
    expect(speedSlider).toBeDisabled()
  })

  it('disables Tamamizu\'s voice volume slider when Tamamizu\'s voice reactions is off', () => {
    const { getByText } = renderSettings()
    const voiceReactionsCheckbox = getByText("Tamamizu's voice reactions").closest('label')!.querySelector('input')!
    fireEvent.click(voiceReactionsCheckbox)

    const voiceVolumeSlider = getByText("Tamamizu's voice volume").closest('label')!.querySelector('input[type="range"]')!
    expect(voiceVolumeSlider).toBeDisabled()
  })
})
