import { act, fireEvent, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { CHARACTERS_BY_ID } from '../../data/characters'
import { REVIEW_SCOPE_ID } from '../../hooks/useCurriculum'
import { useProgressStore } from '../../store/progressStore'
import { KanaQuizPage } from './KanaQuizPage'

beforeEach(() => {
  useProgressStore.getState().resetProgress()
})

describe('KanaQuizPage character Review streak', () => {
  it('a wrong answer activates character Review for the target character at 0/2', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/practice/hiragana/a-row/kana-quiz']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/kana-quiz" element={<KanaQuizPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const kanaEl = container.querySelector('.font-kana')!
    const targetId = Object.keys(CHARACTERS_BY_ID).find((id) => CHARACTERS_BY_ID[id].kana === kanaEl.textContent)!
    expect(targetId).toBeDefined()

    const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    const wrongButton = buttons.find((b) => b.textContent !== CHARACTERS_BY_ID[targetId].romaji)!

    act(() => fireEvent.click(wrongButton))

    expect(useProgressStore.getState().characters[targetId]).toMatchObject({ reviewActive: true, reviewStreak: 0 })
  })

  it('a correct answer on a character never missed does not activate character Review', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/practice/hiragana/a-row/kana-quiz']}>
        <Routes>
          <Route path="/practice/:categoryId/:rowId/kana-quiz" element={<KanaQuizPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const kanaEl = container.querySelector('.font-kana')!
    const targetId = Object.keys(CHARACTERS_BY_ID).find((id) => CHARACTERS_BY_ID[id].kana === kanaEl.textContent)!

    const buttons = Array.from(container.querySelectorAll('.grid button')) as HTMLButtonElement[]
    const correctButton = buttons.find((b) => b.textContent === CHARACTERS_BY_ID[targetId].romaji)!

    act(() => fireEvent.click(correctButton))

    expect(useProgressStore.getState().characters[targetId]?.reviewActive ?? false).toBe(false)
  })
})

describe('KanaQuizPage Review empty state', () => {
  it('shows a success state instead of a blank page when nothing is active in character Review', () => {
    useProgressStore.getState().markRowTaught('a-row')

    const { container } = render(
      <MemoryRouter initialEntries={['/practice/review/kana-quiz']}>
        <Routes>
          <Route path="/practice/review/kana-quiz" element={<KanaQuizPage rowIdOverride={REVIEW_SCOPE_ID} />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(container.textContent).toMatch(/Review complete!/)
    expect(container.querySelector('.font-kana')).toBeNull()
  })
})
