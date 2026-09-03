import { useEffect, useMemo, useRef } from 'react'
import { useTTS } from '../hooks/useTTS'
import { getAssessmentResultPresentation } from '../lib/assessmentResultPresentation'

export function AssessmentScoreVisual({ correct, total, isFinal = false }: { correct: number; total: number; isFinal?: boolean }) {
  const { speak } = useTTS()
  const presentation = useMemo(() => getAssessmentResultPresentation({ correct, total, isFinal }), [correct, total, isFinal])
  const playedAudioRef = useRef<string | null>(null)
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0

  useEffect(() => {
    if (playedAudioRef.current === presentation.audioKey) return
    playedAudioRef.current = presentation.audioKey
    speak(presentation.audioKey, presentation.label)
  }, [presentation.audioKey, presentation.label, speak])

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2 sm:max-w-md sm:flex-row sm:items-center sm:justify-between sm:gap-4" data-testid="assessment-score-visual">
      <img
        src={`${import.meta.env.BASE_URL}${presentation.image}`}
        alt=""
        data-testid="assessment-result-image"
        className="h-56 w-56 max-w-full shrink-0 object-contain sm:h-64 sm:w-64"
      />
      <div className="flex w-full max-w-[14rem] flex-col items-center gap-2 text-center sm:items-end sm:text-right">
        <p className="text-xl font-black tracking-wide text-amber-600 dark:text-amber-400" data-testid="assessment-result-status">
          {presentation.showCrown && <span aria-label="crown">👑 </span>}{presentation.label}
        </p>
        <span className="text-4xl font-extrabold tabular-nums sm:text-5xl">{percent}%</span>
        <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
          <div className="h-full rounded-full bg-amber-500" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{correct} of {total} correct</span>
        <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">80% to pass</span>
      </div>
    </div>
  )
}
