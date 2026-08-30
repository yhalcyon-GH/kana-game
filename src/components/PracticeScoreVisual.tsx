import { pickPracticeResultImage } from '../lib/practiceResultImage'

export function PracticeScoreVisual({ correct, total }: { correct: number; total: number }) {
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2 sm:max-w-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <img
        src={`${import.meta.env.BASE_URL}${pickPracticeResultImage({ correct, total })}`}
        alt=""
        data-testid="practice-result-image"
        className="h-56 w-56 shrink-0 object-contain sm:h-64 sm:w-64"
      />
      <div className="flex w-full max-w-[14rem] flex-col items-center gap-2 sm:items-end">
        <span className="text-4xl font-extrabold tabular-nums sm:text-5xl">{percent}%</span>
        <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
          <div className="h-full rounded-full bg-blue-600 dark:bg-blue-500" style={{ width: `${percent}%` }} />
        </div>
        <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{correct} of {total} correct</span>
      </div>
    </div>
  )
}
