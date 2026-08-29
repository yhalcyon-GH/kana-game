import { fireEvent, render, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PARTICLE_GUIDE_STEPS } from '../data/particleGuide'
import { DEFAULT_PARTICLE_GUIDE_LOCALE, PARTICLE_GUIDE_CONTENT } from '../data/particleGuideContent'
import { ASK_TAMAMIZU_PARTICLE } from '../data/askTamamizu'
import { CategoryRowsPage } from '../routes/CategoryRowsPage'
import { DEFAULT_CATEGORY_ID, KATAKANA_CATEGORY_ID } from '../data/curriculum'
import { useProgressStore } from '../store/progressStore'

const tts = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }))
vi.mock('../hooks/useTTS', () => ({ useTTS: () => tts }))

const locale = PARTICLE_GUIDE_CONTENT[DEFAULT_PARTICLE_GUIDE_LOCALE]

function renderHiragana(initialEntry = '/hiragana') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CategoryRowsPage
        title="ひらがな"
        description=""
        categoryIds={[DEFAULT_CATEGORY_ID]}
        askTamamizuKanaIntroVariant="hiragana"
      />
    </MemoryRouter>,
  )
}

function renderKatakana() {
  return render(
    <MemoryRouter>
      <CategoryRowsPage
        title="カタカナ"
        description=""
        categoryIds={[KATAKANA_CATEGORY_ID]}
        askTamamizuKanaIntroVariant="katakana"
      />
    </MemoryRouter>,
  )
}

// The Hiragana page also auto-shows KanaIntroExcerptGuide (shares generic
// "Next"/"Back"/"Skip" labels) once hasCompletedIntroGuide is true — every
// navigation query below is scoped to the particle-guide dialog itself so
// it never accidentally matches that other, simultaneously-mounted Guide.
function particleDialog(page: ReturnType<typeof renderHiragana>) {
  return within(page.getByTestId('particle-guide'))
}

beforeEach(() => {
  useProgressStore.getState().resetProgress()
  useProgressStore.getState().setHasCompletedIntroGuide(true)
  tts.speak.mockReset()
  tts.stop.mockReset()
})

describe('Particle Guide content', () => {
  it('has exactly 3 steps: intro -> haHeWo -> greetings', () => {
    expect(PARTICLE_GUIDE_STEPS.map((s) => s.id)).toEqual(['particle.intro', 'particle.haHeWo', 'particle.greetings'])
  })

  it('uses the exact confirmed scripts, verbatim', () => {
    expect(locale.steps['particle.intro'].subtitle).toBe('Particles are like glue. They connect words. Japanese needs particles.')
    expect(locale.steps['particle.haHeWo'].subtitle).toBe(
      'Some particles sound different from normal kana. As a particle, は is read wa, and へ is read e. Also, write を for this particle, not お.',
    )
    expect(locale.steps['particle.greetings'].subtitle).toBe(
      'In こんにちは and こんばんは, the last sound is wa. But we write は, not わ. That is because this は was originally a particle.',
    )
  })

  it('maps each step to its own distinct slide image', () => {
    const assets = PARTICLE_GUIDE_STEPS.map((s) => s.slideAsset)
    expect(assets).toEqual(['guide/slide-particle-1.png', 'guide/slide-particle-2.png', 'guide/slide-particle-3.png'])
    expect(new Set(assets).size).toBe(3)
  })

  it('has a distinct, non-empty audio key per step', () => {
    const keys = PARTICLE_GUIDE_STEPS.map((step) => locale.steps[step.id].audioKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key.length).toBeGreaterThan(0)
  })
})

describe('Particle button entry point on /hiragana', () => {
  it('shows the Ask Tamamizu about particles button with the correct image', () => {
    const page = renderHiragana()
    const button = page.getByTestId('ask-tamamizu-particle')
    expect(button).toHaveAttribute('aria-label', 'Ask Tamamizu about particles')
    const img = button.querySelector('img')
    expect(img).toHaveAttribute('src', `/${ASK_TAMAMIZU_PARTICLE.imageAsset}`)
  })

  it('does not show on the Katakana page', () => {
    const page = renderKatakana()
    expect(page.queryByTestId('ask-tamamizu-particle')).toBeNull()
  })

  it('clicking the button opens the Particle Guide at step 1', () => {
    const page = renderHiragana()
    fireEvent.click(page.getByTestId('ask-tamamizu-particle'))

    expect(page.getByTestId('particle-guide')).toBeInTheDocument()
    expect(page.getByTestId('particle-guide-image')).toHaveAttribute('src', '/guide/slide-particle-1.png')
    expect(particleDialog(page).getByText(locale.steps['particle.intro'].subtitle)).toBeInTheDocument()
    expect(tts.speak).toHaveBeenCalledWith(
      locale.steps['particle.intro'].audioKey,
      locale.steps['particle.intro'].subtitle,
      locale.lang,
    )
  })
})

describe('Particle Guide step navigation', () => {
  it('Next advances step 1 -> 2 -> 3 with correct image/audio/subtitle at each step', () => {
    const page = renderHiragana()
    fireEvent.click(page.getByTestId('ask-tamamizu-particle'))

    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))
    expect(page.getByTestId('particle-guide-image')).toHaveAttribute('src', '/guide/slide-particle-2.png')
    expect(particleDialog(page).getByText(locale.steps['particle.haHeWo'].subtitle)).toBeInTheDocument()
    expect(tts.speak).toHaveBeenLastCalledWith(
      locale.steps['particle.haHeWo'].audioKey,
      locale.steps['particle.haHeWo'].subtitle,
      locale.lang,
    )

    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))
    expect(page.getByTestId('particle-guide-image')).toHaveAttribute('src', '/guide/slide-particle-3.png')
    expect(particleDialog(page).getByText(locale.steps['particle.greetings'].subtitle)).toBeInTheDocument()
    expect(tts.speak).toHaveBeenLastCalledWith(
      locale.steps['particle.greetings'].audioKey,
      locale.steps['particle.greetings'].subtitle,
      locale.lang,
    )

    expect(particleDialog(page).getByText(locale.finalLabel)).toBeInTheDocument()
  })

  it('Back returns to the previous step with its own image/audio/subtitle', () => {
    const page = renderHiragana()
    fireEvent.click(page.getByTestId('ask-tamamizu-particle'))
    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))
    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))

    tts.speak.mockClear()
    fireEvent.click(particleDialog(page).getByText('Back'))

    expect(page.getByTestId('particle-guide-image')).toHaveAttribute('src', '/guide/slide-particle-2.png')
    expect(particleDialog(page).getByText(locale.steps['particle.haHeWo'].subtitle)).toBeInTheDocument()
    expect(tts.speak).toHaveBeenCalledWith(
      locale.steps['particle.haHeWo'].audioKey,
      locale.steps['particle.haHeWo'].subtitle,
      locale.lang,
    )
  })

  it('Back is disabled on the first step', () => {
    const page = renderHiragana()
    fireEvent.click(page.getByTestId('ask-tamamizu-particle'))
    expect(particleDialog(page).getByText('Back')).toBeDisabled()
  })

  it('stops narration on step change and on unmount', () => {
    const page = renderHiragana()
    fireEvent.click(page.getByTestId('ask-tamamizu-particle'))
    tts.stop.mockClear()
    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))
    expect(tts.stop).toHaveBeenCalled()
    tts.stop.mockClear()
    page.unmount()
    expect(tts.stop).toHaveBeenCalled()
  })
})

describe('Particle Guide completion and replay semantics', () => {
  it('completing all 3 steps triggers final completion and sets hasCompletedParticleGuide on first completion', () => {
    expect(useProgressStore.getState().hasCompletedParticleGuide).toBe(false)
    const page = renderHiragana()
    fireEvent.click(page.getByTestId('ask-tamamizu-particle'))
    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))
    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))
    fireEvent.click(particleDialog(page).getByText(locale.finalLabel))

    expect(page.queryByTestId('particle-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedParticleGuide).toBe(true)
  })

  it('Skip also dismisses and marks completed on a first-ever viewing', () => {
    const page = renderHiragana()
    fireEvent.click(page.getByTestId('ask-tamamizu-particle'))
    fireEvent.click(particleDialog(page).getByText(locale.skipLabel))

    expect(page.queryByTestId('particle-guide')).toBeNull()
    expect(useProgressStore.getState().hasCompletedParticleGuide).toBe(true)
  })

  it('a subsequent manual replay after completion does not mutate hasCompletedParticleGuide or any other progress state', () => {
    useProgressStore.getState().setHasCompletedParticleGuide(true)
    const page = renderHiragana()

    const before = useProgressStore.getState()
    const snapshot = {
      taughtRowIds: before.taughtRowIds,
      rowActivityCompletion: before.rowActivityCompletion,
      characters: before.characters,
      words: before.words,
      unlockedRowIds: before.unlockedRowIds,
      hasCompletedParticleGuide: before.hasCompletedParticleGuide,
    }

    fireEvent.click(page.getByTestId('ask-tamamizu-particle'))
    expect(page.getByTestId('particle-guide')).toBeInTheDocument()
    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))
    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))
    fireEvent.click(particleDialog(page).getByText(locale.finalLabel))

    expect(page.queryByTestId('particle-guide')).toBeNull()
    const after = useProgressStore.getState()
    expect({
      taughtRowIds: after.taughtRowIds,
      rowActivityCompletion: after.rowActivityCompletion,
      characters: after.characters,
      words: after.words,
      unlockedRowIds: after.unlockedRowIds,
      hasCompletedParticleGuide: after.hasCompletedParticleGuide,
    }).toEqual(snapshot)
  })

  it('replaying via ?guide=particle opens the Particle Guide directly', () => {
    useProgressStore.getState().setHasCompletedParticleGuide(true)
    const page = renderHiragana('/hiragana?guide=particle')
    expect(page.getByTestId('particle-guide')).toBeInTheDocument()
  })

  it('does not appear from an unrelated ?guide= id', () => {
    const page = renderHiragana('/hiragana?guide=not-a-real-guide')
    expect(page.queryByTestId('particle-guide')).toBeNull()
  })

  it('does not affect other guides’ completion flags', () => {
    const page = renderHiragana()
    fireEvent.click(page.getByTestId('ask-tamamizu-particle'))
    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))
    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))
    fireEvent.click(particleDialog(page).getByText(locale.finalLabel))

    expect(useProgressStore.getState().hasCompletedSokuonGuide).toBe(false)
    expect(useProgressStore.getState().hasCompletedChouonGuide).toBe(false)
    expect(useProgressStore.getState().hasCompletedYouonGuide).toBe(false)
    expect(useProgressStore.getState().hasCompletedSpecialKatakanaGuide).toBe(false)
  })
})

describe('Particle Guide does not affect Recommended Path', () => {
  it('Recommended row is unchanged by opening/completing the Particle Guide', () => {
    const before = renderHiragana()
    const beforeRecommended = before.getAllByText('⭐ Recommended').length
    before.unmount()

    const page = renderHiragana()
    fireEvent.click(page.getByTestId('ask-tamamizu-particle'))
    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))
    fireEvent.click(particleDialog(page).getByText(locale.nextLabel))
    fireEvent.click(particleDialog(page).getByText(locale.finalLabel))

    expect(page.getAllByText('⭐ Recommended').length).toBe(beforeRecommended)
  })
})
