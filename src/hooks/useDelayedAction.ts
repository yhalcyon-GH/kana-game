import { useCallback, useEffect, useRef } from 'react'

export function useDelayedAction() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = useCallback(() => {
    if (timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const schedule = useCallback(
    (action: () => void, delayMs: number) => {
      cancel()
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        action()
      }, delayMs)
    },
    [cancel],
  )

  useEffect(() => cancel, [cancel])

  return { schedule, cancel }
}
