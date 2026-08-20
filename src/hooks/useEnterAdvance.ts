import { useEffect } from 'react'

// Lets desktop/keyboard users press Enter to trigger the "Next" action
// instead of having to click/tap the button — only listens while `enabled`
// (i.e. while a Next button would actually be showing), so Enter doesn't do
// anything unexpected mid-question.
export function useEnterAdvance(enabled: boolean, onAdvance: () => void) {
  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (e: KeyboardEvent) => {
      // e.repeat is true for the synthetic keydown events the OS fires
      // while a key is held down — advance() has no per-round guard, so
      // without this, holding Enter down would skip several rounds unanswered.
      if (e.key === 'Enter' && !e.repeat) onAdvance()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onAdvance])
}
