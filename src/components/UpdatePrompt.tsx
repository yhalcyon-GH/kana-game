import { useRegisterSW } from 'virtual:pwa-register/react'

// Low-noise, learner-facing counterpart to registerType: 'prompt' in
// vite.config.ts (see the comment there) — Issue #310. A waiting service
// worker only activates when the learner taps Update here, so a mid-lesson
// reload never happens without consent. Activating/reloading only replaces
// the app shell cache; it never touches localStorage/IndexedDB, so progress
// (src/store/progressStore.ts) survives untouched. See
// docs/pwa-update-flow.md for the full expected Production behavior.
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (error) => {
      // Swallow — a failed registration just means the learner keeps using
      // whatever's currently loaded; nothing actionable for them to do.
      console.error('Service worker registration failed', error)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-sm flex-col gap-2 rounded-xl border border-neutral-300 bg-white p-3 text-sm shadow-lg dark:border-neutral-600 dark:bg-neutral-800 sm:inset-x-auto sm:right-3 sm:w-80"
    >
      <p className="text-neutral-700 dark:text-neutral-200">A new version is available.</p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="rounded-lg bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700"
        >
          Update
        </button>
      </div>
    </div>
  )
}
