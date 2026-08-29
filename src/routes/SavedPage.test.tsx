import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSavedItemsStore } from '../store/savedItemsStore'
import { SavedPage } from './SavedPage'

beforeEach(() => {
  useSavedItemsStore.setState({ savedCharacterIds: [], savedWordIds: [] })
})

function renderSaved() {
  return render(
    <MemoryRouter initialEntries={['/saved']}>
      <Routes>
        <Route path="/saved" element={<SavedPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SavedPage', () => {
  it('shows an empty state when nothing is saved', () => {
    renderSaved()
    expect(screen.getByText('Nothing saved yet.')).toBeInTheDocument()
  })

  it('shows saved characters under a Characters heading', () => {
    useSavedItemsStore.getState().toggleCharacter('a')
    useSavedItemsStore.getState().toggleCharacter('ki')
    renderSaved()
    expect(screen.getByText('Characters')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: /^saved /i })).toHaveLength(2)
    expect(screen.queryByText('Nothing saved yet.')).not.toBeInTheDocument()
  })

  it('shows saved words under a Words heading', () => {
    useSavedItemsStore.getState().toggleWord('a-ai')
    renderSaved()
    expect(screen.getByText('Words')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: /^saved /i })).toHaveLength(1)
  })

  it('unchecking Saved on the Saved page removes the item immediately', () => {
    useSavedItemsStore.getState().toggleCharacter('a')
    renderSaved()
    const checkbox = screen.getByRole('checkbox', { name: /^saved /i })
    fireEvent.click(checkbox)
    expect(useSavedItemsStore.getState().isCharacterSaved('a')).toBe(false)
    expect(screen.getByText('Nothing saved yet.')).toBeInTheDocument()
  })

  it('shows both Characters and Words sections together when both are saved', () => {
    useSavedItemsStore.getState().toggleCharacter('a')
    useSavedItemsStore.getState().toggleWord('a-ai')
    renderSaved()
    expect(screen.getByText('Characters')).toBeInTheDocument()
    expect(screen.getByText('Words')).toBeInTheDocument()
  })
})
