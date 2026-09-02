import { CHARACTERS_BY_ID } from '../data/characters'
import { buildWeightedQueue, type BoxLookup } from './practiceSelection'

const KANA_QUIZ_ROUNDS_BY_ROW: Record<string, number> = {
  'ha-row': 12,
  'katakana-ha-row': 12,
  'katakana-a-row': 16,
}

export function getKanaQuizRounds(rowId: string | undefined, defaultRounds: number): number {
  return (rowId && KANA_QUIZ_ROUNDS_BY_ROW[rowId]) || defaultRounds
}

function moveBoundaryRepeat(queue: string[], extra: string[]): string[] {
  if (queue.length === 0 || extra.length === 0 || queue[queue.length - 1] !== extra[0]) return extra
  const differentIndex = extra.findIndex((id) => id !== queue[queue.length - 1])
  if (differentIndex <= 0) return extra
  const reordered = [...extra]
  ;[reordered[0], reordered[differentIndex]] = [reordered[differentIndex], reordered[0]]
  return reordered
}

// Normal real-row Kana Quiz selection (Issue #180):
// 1. every eligible seion/base target appears before voiced/semi-voiced targets;
// 2. remaining slots draw distinct dakuten/handakuten targets where possible;
// 3. only after every distinct eligible target that fits has been used do
//    extra weighted repeats fill a longer session.
//
// `ids` is already the caller's Kana-Quiz-eligible target set, so existing
// exclusions such as ぢ/づ/ヂ/ヅ and ー remain owned by useCurriculum rather
// than duplicated here.
export function buildKanaQuizTargetQueue(ids: string[], getBox: BoxLookup, rounds: number): string[] {
  if (ids.length === 0 || rounds <= 0) return []

  const baseIds = ids.filter((id) => CHARACTERS_BY_ID[id]?.type === 'base')
  const voicedIds = ids.filter((id) => CHARACTERS_BY_ID[id]?.type !== 'base')
  const queue: string[] = []

  const baseCount = Math.min(baseIds.length, rounds)
  queue.push(...buildWeightedQueue(baseIds, getBox, baseCount))

  let remaining = rounds - queue.length
  if (remaining > 0) {
    const voicedCount = Math.min(voicedIds.length, remaining)
    queue.push(...buildWeightedQueue(voicedIds, getBox, voicedCount))
    remaining = rounds - queue.length
  }

  if (remaining > 0) {
    const extras = buildWeightedQueue(ids, getBox, remaining)
    queue.push(...moveBoundaryRepeat(queue, extras))
  }

  return queue
}
