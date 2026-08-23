import { ROWS_BY_ID } from '../data/curriculum'
import type { LastStudied, ResumableActivity } from '../store/progressStore'

// The real per-row learning/practice screens (see App.tsx's routes) —
// exactly what Home's Continue card (Issue #23) is allowed to resume into.
// Deliberately excludes the Practice Hub itself (a menu, not an activity)
// and every Review route (unparameterized literals like /practice/review/
// kana-quiz, structurally distinct from a real row's routes below — they
// simply never match either pattern).
const LEARN_PATH = /^\/learn\/([^/]+)\/([^/]+)$/
const GAME_PATH = /^\/practice\/([^/]+)\/([^/]+)\/(word-builder|listening|kana-quiz|kana-typing|tracing)$/

const GAME_SEGMENT_TO_ACTIVITY: Record<string, ResumableActivity> = {
  'word-builder': 'wordBuilder',
  listening: 'listening',
  'kana-quiz': 'kanaQuiz',
  'kana-typing': 'kanaTyping',
  tracing: 'tracing',
}

const ACTIVITY_TO_GAME_SEGMENT: Partial<Record<ResumableActivity, string>> = Object.fromEntries(
  Object.entries(GAME_SEGMENT_TO_ACTIVITY).map(([segment, activity]) => [activity, segment]),
)

// Short display label for Continue's own subtitle line (see HomePage.tsx).
export const RESUMABLE_ACTIVITY_LABELS: Record<ResumableActivity, string> = {
  learn: 'Learn',
  tracing: 'Tracing',
  kanaQuiz: 'Kana Quiz',
  listening: 'Listening',
  wordBuilder: 'Word Builder',
  kanaTyping: 'Kana Typing',
}

// Reverses matchResumableRoute back into the exact page URL to resume into.
export function resumeHref(entry: LastStudied): string {
  if (entry.activity === 'learn') return `/learn/${entry.categoryId}/${entry.rowId}`
  return `/practice/${entry.categoryId}/${entry.rowId}/${ACTIVITY_TO_GAME_SEGMENT[entry.activity]}`
}

function toLastStudied(categoryId: string, rowId: string, activity: ResumableActivity): LastStudied | null {
  // A summary row's Learn/Practice shape doesn't fit "resume this one row"
  // (see PracticeHubPage's showRecommendedPath comment for the same
  // exclusion elsewhere) — an unnatural resumption target, so it's skipped
  // rather than recorded.
  const row = ROWS_BY_ID[rowId]
  if (!row || row.isSummary || row.categoryId !== categoryId) return null
  return { categoryId, rowId, activity }
}

// Pure route -> LastStudied mapping, given a router pathname (e.g. from
// useLocation().pathname) — null when the current screen isn't a natural
// resumption target. See hooks/useTrackLastStudied.ts for the live tracker
// that calls this on every navigation.
export function matchResumableRoute(pathname: string): LastStudied | null {
  const learnMatch = pathname.match(LEARN_PATH)
  if (learnMatch) {
    const [, categoryId, rowId] = learnMatch
    return toLastStudied(categoryId, rowId, 'learn')
  }

  const gameMatch = pathname.match(GAME_PATH)
  if (gameMatch) {
    const [, categoryId, rowId, segment] = gameMatch
    return toLastStudied(categoryId, rowId, GAME_SEGMENT_TO_ACTIVITY[segment])
  }

  return null
}
