import { Link } from 'react-router-dom'
import { PracticeScoreVisual } from '../../../components/PracticeScoreVisual'
import { ASSESSMENT_FAMILIES } from '../../../lib/assessment/planner'
import type { AssessmentFamily, AssessmentRecommendation, AssessmentResult, AssessmentScript } from '../../../lib/assessment/types'

type Props = {
  script: AssessmentScript
  result: AssessmentResult
  advice: AssessmentRecommendation[]
  onRetry: () => void
}

const FAMILY_LABELS: Record<AssessmentFamily, string> = {
  'kana-quiz': 'Kana Quiz',
  listening: 'Listening',
  'word-builder': 'Word Builder',
  'word-reading': 'Word Reading',
}

// Score + 4 family subscores + up to 2 prioritized recommendations (Issue
// #189) — finishing all 20 questions reaches this screen regardless of
// score; nothing here mutates Review/SRS/mastery/checkpoint state, and the
// recommendations below always link to existing routes (see
// lib/assessment/advice.ts).
export function AssessmentResults({ script, result, advice, onRetry }: Props) {
  const scriptLabel = script === 'hiragana' ? 'Hiragana' : 'Katakana'
  const backHref = script === 'hiragana' ? '/hiragana' : '/katakana'

  return (
    <div className="flex flex-col items-center gap-6">
      <h2 className="text-2xl font-bold">{scriptLabel} Test complete!</h2>
      <PracticeScoreVisual correct={result.correct} total={result.total} />

      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        {ASSESSMENT_FAMILIES.map((family) => {
          const score = result.familyScores[family]
          return (
            <div
              key={family}
              data-testid={`assessment-family-score-${family}`}
              className="rounded-xl border border-neutral-300 bg-white p-3 text-center dark:border-neutral-600 dark:bg-neutral-800"
            >
              <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">{FAMILY_LABELS[family]}</p>
              <p className="text-lg font-bold">
                {score.correct} / {score.total}
              </p>
            </div>
          )
        })}
      </div>

      {advice.length > 0 && (
        <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-center dark:border-amber-700 dark:bg-amber-950/40">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Recommended practice</p>
          <div className="flex flex-wrap justify-center gap-2">
            {advice.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="min-w-[9rem] rounded-full border border-neutral-300 px-6 py-2 text-center font-semibold hover:border-blue-400 dark:border-neutral-600"
        >
          Play Again
        </button>
        <Link to={backHref} className="min-w-[9rem] rounded-full bg-blue-600 px-6 py-2 text-center font-semibold text-white hover:bg-blue-700">
          Back to {scriptLabel}
        </Link>
      </div>
    </div>
  )
}
