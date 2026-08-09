import { useEffect } from 'react'

// Lets desktop/keyboard users press Enter to trigger the "Next" action
// instead of having to click/tap the button — only listens while `enabled`
// (i.e. while a Next button would actually be showing), so Enter doesn't do
// anything unexpected mid-question.
export function useEnterAdvance(enabled: boolean, onAdvance: () => void) {
  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onAdvance()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onAdvance])
}
