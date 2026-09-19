import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export const UPDATE_CHECK_MIN_INTERVAL_MS = 5 * 60 * 1000
export const UPDATE_CHECK_PERIOD_MS = 60 * 60 * 1000

// Low-noise, learner-facing counterpart to registerType: 'prompt' in
// vite.config.ts. A waiting service worker only activates when the learner
// taps Update, so a mid-lesson reload never happens without consent.
//
// In addition to the browser's normal service-worker lifecycle checks, this
// component explicitly asks the active registration to check for an update on
// mount and whenever the installed app returns to the foreground. That closes
// the reliability gap seen in Issue #316, where an installed standalone PWA
// could remain on an old app shell even after Production had a newer sw.js.
// Checks are throttled and periodic; they never clear localStorage, IndexedDB,
// learning progress, or the runtime media cache.
export function UpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_swUrl, registered) => {
      if (registered) setRegistration(registered)
    },
    onRegisterError: (error) => {
      // Swallow — a failed registration just means the learner keeps using
      // whatever's currently loaded; nothing actionable for them to do.
      console.error('Service worker registration failed', error)
    },
  })

  useEffect(() => {
    if (!registration) return

    let lastCheckAt = 0

    const checkForUpdate = () => {
      const now = Date.now()
      if (lastCheckAt !== 0 && now - lastCheckAt < UPDATE_CHECK_MIN_INTERVAL_MS) return
      lastCheckAt = now

      void registration.update().catch((error) => {
        // A transient network/update failure must never block the learner.
        console.error('Service worker update check failed', error)
      })
    }

    const onFocus = () => checkForUpdate()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }

    // Do not wait for the browser's heuristic/24h lifecycle check.
    checkForUpdate()

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    const intervalId = window.setInterval(checkForUpdate, UPDATE_CHECK_PERIOD_MS)

    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.clearInterval(intervalId)
    }
  }, [registration])

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
