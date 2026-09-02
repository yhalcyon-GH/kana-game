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

function avoidBoundaryRepeat(queue: string[], extra: string[]): string[] {
  if (queue.length === 0 || extra.length <= 1 || queue[queue.length - 1] !== extra[0]) return extra
  const boundary = queue[queue.length - 1]
  // buildWeightedQueue already avoids internal consecutive repeats whenever
  // possible. Rotate rather than swap so we do not fix the phase boundary by
  // accidentally creating a new duplicate pair inside the extra block.
  for (let offset = 1; offset < extra.length; offset += 1) {
    const rotated = [...extra.slice(offset), ...extra.slice(0, offset)]
    if (rotated[0] === boundary) continue
    if (rotated.every((id, index) => index === 0 || id !== rotated[index - 1])) return rotated
  }
  return extra
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
    queue.push(...avoidBoundaryRepeat(queue, extras))
  }

  return queue
}
