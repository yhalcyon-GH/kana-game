import { useEffect, useRef } from 'react'

// Issue #316: browsers only check a service worker for updates on
// navigation, and only after their own throttling/lifecycle heuristics —
// which is not reliable enough for an installed/standalone PWA that may sit
// open for a long time. This hook asks the existing registration to check
// explicitly, so a routine Production deploy is picked up deterministically
// without uninstalling the PWA or clearing learner data.
export const UPDATE_CHECK_THROTTLE_MS = 60_000
export const PERIODIC_UPDATE_CHECK_MS = 60 * 60_000

export interface UseServiceWorkerUpdateChecksOptions {
  /** Minimum time between update checks, so focus/visibility churn can't hammer the network. */
  throttleMs?: number
  /** Interval for a bounded background check while the app stays open; pass null to disable it. */
  periodicCheckMs?: number | null
}

export function useServiceWorkerUpdateChecks(
  registration: ServiceWorkerRegistration | undefined,
  options: UseServiceWorkerUpdateChecksOptions = {},
): void {
  const throttleMs = options.throttleMs ?? UPDATE_CHECK_THROTTLE_MS
  const periodicCheckMs = options.periodicCheckMs === undefined ? PERIODIC_UPDATE_CHECK_MS : options.periodicCheckMs
  const lastCheckAtRef = useRef(0)

  useEffect(() => {
    if (!registration) return

    const checkForUpdate = () => {
      const now = Date.now()
      if (now - lastCheckAtRef.current < throttleMs) return
      lastCheckAtRef.current = now
      // registration.update() only fetches sw.js and, if it differs, starts
      // installing it in the background — it never activates a waiting
      // worker itself, so the existing prompt-based Update UX (#310) still
      // gates the actual reload.
      registration.update().catch(() => {
        // A failed check just means we keep using the current worker; the
        // next scheduled check will retry.
      })
    }

    checkForUpdate()

    const handleFocus = () => checkForUpdate()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    let intervalId: ReturnType<typeof setInterval> | undefined
    if (periodicCheckMs) {
      intervalId = setInterval(checkForUpdate, periodicCheckMs)
    }

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (intervalId !== undefined) clearInterval(intervalId)
    }
  }, [registration, throttleMs, periodicCheckMs])
}
