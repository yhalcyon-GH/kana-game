// Similar Letters' own sampling helpers — deliberately separate from
// lib/practiceSelection.ts and lib/distractorPicker.ts (which stay
// unmodified/untouched, so normal Practice's behavior can't regress).
//
// `rng` is injectable everywhere (defaults to Math.random) purely so tests
// can assert exact, reproducible sequences instead of relying on
// statistical fuzziness — production callers never pass it.
export type Rng = () => number

function shuffleWith<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickUniform<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)]
}

// Reorders `items` so no id repeats back-to-back, whenever that's
// mathematically possible — same greedy idea as
// practiceSelection.ts's arrangeNoConsecutiveRepeats, reimplemented locally
// (rather than imported) so it can take an injectable rng.
function arrangeNoImmediateRepeat(items: string[], rng: Rng): string[] {
  const remaining = new Map<string, number>()
  for (const item of items) remaining.set(item, (remaining.get(item) ?? 0) + 1)

  const result: string[] = []
  let last: string | null = null
  for (let i = 0; i < items.length; i++) {
    let candidates = [...remaining.entries()].filter(([id, c]) => c > 0 && id !== last)
    if (candidates.length === 0) candidates = [...remaining.entries()].filter(([, c]) => c > 0)
    const maxCount = Math.max(...candidates.map(([, c]) => c))
    const top = candidates.filter(([, c]) => c === maxCount)
    const [id] = pickUniform(top, rng)
    result.push(id)
    remaining.set(id, (remaining.get(id) ?? 1) - 1)
    last = id
  }
  return result
}

// Group-balanced cyclic sampler (Issue "Group-balanced selection"): shuffles
// the confusion groups, consumes them one at a time (uniform pick within
// each group, avoiding an immediate repeat of the previous pick when the
// group offers another option), and reshuffles for a fresh cycle once every
// group has been visited once — so no group can dominate or go missing
// within/across a full cycle.
export function buildGroupBalancedPicks(groups: readonly string[][], count: number, rng: Rng = Math.random): string[] {
  const nonEmptyGroups = groups.filter((g) => g.length > 0)
  if (nonEmptyGroups.length === 0 || count <= 0) return []

  const picks: string[] = []
  let cycleOrder = shuffleWith(nonEmptyGroups, rng)
  let idx = 0
  let last: string | null = null
  while (picks.length < count) {
    if (idx >= cycleOrder.length) {
      cycleOrder = shuffleWith(nonEmptyGroups, rng)
      idx = 0
    }
    const group = cycleOrder[idx]
    idx++
    const options: string[] = last !== null && group.length > 1 ? group.filter((c) => c !== last) : group
    const pick = pickUniform(options.length > 0 ? options : group, rng)
    picks.push(pick)
    last = pick
  }
  return picks
}

// Builds an 80% Similar-Letters / 20% normal-same-script target queue
// (Issue "Target weighting"): the 80% side is group-balanced across every
// confusion group; the 20% side is a uniform pick from the normal pool.
// `count` is the round's total question count (e.g. 8 or 15 — the existing
// round-length constants, unchanged).
export function buildSimilarLettersTargetQueue(
  groups: readonly string[][],
  normalPoolIds: readonly string[],
  count: number,
  rng: Rng = Math.random,
): string[] {
  if (count <= 0) return []
  const similarCount = Math.round(count * 0.8)
  const normalCount = count - similarCount

  const similarPicks = buildGroupBalancedPicks(groups, similarCount, rng)
  const normalPicks: string[] = []
  for (let i = 0; i < normalCount && normalPoolIds.length > 0; i++) normalPicks.push(pickUniform(normalPoolIds, rng))

  return arrangeNoImmediateRepeat(shuffleWith([...similarPicks, ...normalPicks], rng), rng)
}

// Word-pool analogue of buildSimilarLettersTargetQueue, for the three
// word-based games (Listening/Word Builder/Kana Typing). `targetWords` and
// `normalWords` are the two halves of the row's word pool, already split by
// "does this word contain at least one confusion-group character" — see
// each game page's own split, built from useCurriculum's getScopeWords
// (the full same-script pool). Group-balances the 80% side across whichever
// confusion groups actually have at least one matching word — a group with
// zero real example words in the current data is silently skipped rather
// than forcing a fabricated one (see the Issue's "no fictional words" rule).
export function buildSimilarLettersWordQueue<T extends { id: string; characterIds: string[] }>(
  groups: readonly string[][],
  targetWords: readonly T[],
  normalWords: readonly T[],
  count: number,
  rng: Rng = Math.random,
): string[] {
  if (count <= 0) return []
  const similarCount = Math.round(count * 0.8)
  const normalCount = count - similarCount

  const wordIdsByGroup = groups
    .map((group) => targetWords.filter((w) => w.characterIds.some((id) => group.includes(id))).map((w) => w.id))
    .filter((ids) => ids.length > 0)
  // Every confusion group in this script happened to have zero matching
  // words in the current word data — fall back to picking from ALL target
  // words undifferentiated rather than producing zero similar-letters
  // questions.
  const similarPicks =
    wordIdsByGroup.length > 0
      ? buildGroupBalancedPicks(wordIdsByGroup, similarCount, rng)
      : buildGroupBalancedPicks([targetWords.map((w) => w.id)], similarCount, rng)

  const normalPicks: string[] = []
  for (let i = 0; i < normalCount && normalWords.length > 0; i++) normalPicks.push(pickUniform(normalWords, rng).id)

  return arrangeNoImmediateRepeat(shuffleWith([...similarPicks, ...normalPicks], rng), rng)
}

// Every OTHER character in the same confusion group as `id` (empty if `id`
// isn't in any group).
export function getGroupMates(groups: readonly string[][], id: string): string[] {
  const group = groups.find((g) => g.includes(id))
  return group ? group.filter((c) => c !== id) : []
}

// Kana Quiz/Word Builder distractor characters: prefers the target(s)' OWN
// confusion-group mates first (Issue "same-group distractor preference" —
// シ's choices should include ツ, not just any random katakana), then fills
// any remaining slots from the rest of the pool. Mirrors
// distractorPicker.ts's pickDistractorCharIds's multi-target shape (Word
// Builder passes a whole word's characterIds; Kana Quiz passes one id).
export function pickSimilarLettersDistractorCharIds(
  targetCharIds: readonly string[],
  groups: readonly string[][],
  pool: readonly string[],
  count: number,
  rng: Rng = Math.random,
): string[] {
  const targetSet = new Set(targetCharIds)
  const mates = [...new Set(targetCharIds.flatMap((id) => getGroupMates(groups, id)))].filter(
    (id) => pool.includes(id) && !targetSet.has(id),
  )
  const rest = pool.filter((id) => !targetSet.has(id) && !mates.includes(id))
  return [...shuffleWith(mates, rng), ...shuffleWith(rest, rng)].slice(0, count)
}

// Listening distractor words: prefers a candidate word that contains a
// confusion-group mate of one of the target word's own characters (e.g.
// target シ's word choices should include a ツ-containing word), then fills
// any remaining slots from the rest of the candidate pool.
export function pickSimilarLettersDistractorWords<T extends { id: string; characterIds: string[] }>(
  targetWord: T,
  groups: readonly string[][],
  candidates: readonly T[],
  count: number,
  rng: Rng = Math.random,
): T[] {
  const others = candidates.filter((w) => w.id !== targetWord.id)
  const mateIds = new Set(targetWord.characterIds.flatMap((id) => getGroupMates(groups, id)))
  const isMate = (w: T) => w.characterIds.some((id) => mateIds.has(id))
  const preferred = shuffleWith(others.filter(isMate), rng)
  const rest = shuffleWith(others.filter((w) => !isMate(w)), rng)
  return [...preferred, ...rest].slice(0, count)
}
