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

// Picks uniformly from `pool`, making a best-effort attempt (a handful of
// resamples) to avoid returning a value equal to `avoid` — used only for
// filler (normal-target) items being slotted next to a fixed neighbor. Never
// used on the group-balanced Similar sequence itself: that order is fixed
// and must never be reshuffled to satisfy repeat-avoidance (see
// interleavePreservingOrder below).
function pickAvoiding<T>(pool: readonly T[], avoid: T | null, rng: Rng): T {
  if (avoid === null || pool.length <= 1) return pickUniform(pool, rng)
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = pickUniform(pool, rng)
    if (candidate !== avoid) return candidate
  }
  return pickUniform(pool, rng)
}

// Interleaves `fillerCount` items drawn from `fillerPool` into the fixed
// sequence `ordered`, WITHOUT ever changing the relative order of `ordered`
// itself — i.e. filtering the returned array down to just the `ordered`
// values (removing every filler) always reproduces `ordered` exactly.
//
// This is the fix for the bug where a final `shuffleWith([...similarPicks,
// ...normalPicks])` used to destroy the group-cycle order that
// buildGroupBalancedPicks had carefully constructed. Now: `ordered` (the
// Similar-target picks) keeps its exact order, and only the *positions*
// where filler (normal-target) items get inserted are randomized.
//
// No-immediate-repeat avoidance for the filler items is best-effort only
// (see pickAvoiding) — when it conflicts with preserving `ordered`'s
// sequence, preserving that sequence always wins, per spec.
function interleavePreservingOrder<T>(ordered: readonly T[], fillerCount: number, fillerPool: readonly T[], rng: Rng): T[] {
  const total = ordered.length + fillerCount
  if (total === 0) return []
  if (fillerCount === 0) return [...ordered]
  const positions = shuffleWith(
    Array.from({ length: total }, (_, i) => i),
    rng,
  )
  const fillerSlots = new Set(positions.slice(0, fillerCount))

  const result: T[] = new Array(total)
  let oi = 0
  for (let i = 0; i < total; i++) {
    if (!fillerSlots.has(i)) result[i] = ordered[oi++]
  }
  for (let i = 0; i < total; i++) {
    if (fillerSlots.has(i)) {
      const avoid = i > 0 ? result[i - 1] : null
      result[i] = pickAvoiding(fillerPool, avoid, rng)
    }
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
//
// The group-cycle order buildGroupBalancedPicks produces for the Similar
// side is preserved EXACTLY in the returned queue — filtering the result
// down to only Similar-target ids always reproduces that order. The Normal
// ids are interleaved at randomized positions and never disturb it. When the
// normal pool is empty/insufficient, the shortfall is filled by extending
// the group-balanced cycle further (NOT by padding with flat random
// characters), so even an all-Similar queue still respects group-cycle
// ordering.
export function buildSimilarLettersTargetQueue(
  groups: readonly string[][],
  normalPoolIds: readonly string[],
  count: number,
  rng: Rng = Math.random,
): string[] {
  if (count <= 0) return []
  const desiredNormalCount = count - Math.round(count * 0.8)
  const normalCount = normalPoolIds.length > 0 ? desiredNormalCount : 0
  const similarCount = count - normalCount

  let similarPicks = buildGroupBalancedPicks(groups, similarCount, rng)
  // Degenerate case: every confusion group is empty too — buildGroupBalancedPicks
  // can't produce anything, so fall back to the normal pool just to hit the
  // round-length guarantee (no group-cycle claim applies when there are no
  // groups at all).
  while (similarPicks.length < similarCount && normalPoolIds.length > 0) {
    similarPicks = [...similarPicks, pickUniform(normalPoolIds, rng)]
  }

  return interleavePreservingOrder(similarPicks, normalCount, normalPoolIds, rng)
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
  const desiredNormalCount = count - Math.round(count * 0.8)
  const normalCount = normalWords.length > 0 ? desiredNormalCount : 0
  const similarCount = count - normalCount

  const wordIdsByGroup = groups
    .map((group) => targetWords.filter((w) => w.characterIds.some((id) => group.includes(id))).map((w) => w.id))
    .filter((ids) => ids.length > 0)
  // Every confusion group in this script happened to have zero matching
  // words in the current word data — fall back to picking from ALL target
  // words undifferentiated rather than producing zero similar-letters
  // questions.
  let similarPicks =
    wordIdsByGroup.length > 0
      ? buildGroupBalancedPicks(wordIdsByGroup, similarCount, rng)
      : buildGroupBalancedPicks([targetWords.map((w) => w.id)], similarCount, rng)

  // Round-length guarantee: if target words can't fill their intended share
  // (too few words, or none at all) top back up from normal words rather
  // than ever handing back a short round. This degenerate padding carries no
  // group-cycle claim (there's no group data behind it), unlike the normal
  // shortfall-into-extra-cycle handling above via `similarCount`.
  const fallbackPool = targetWords.length > 0 ? targetWords : normalWords
  while (similarPicks.length < similarCount && fallbackPool.length > 0) {
    similarPicks = [...similarPicks, pickUniform(fallbackPool, rng).id]
  }

  const normalPool = normalWords.map((w) => w.id)
  return interleavePreservingOrder(similarPicks, normalCount, normalPool, rng)
}

// Every OTHER character in the same confusion group as `id` (empty if `id`
// isn't in any group).
export function getGroupMates(groups: readonly string[][], id: string): string[] {
  const group = groups.find((g) => g.includes(id))
  return group ? group.filter((c) => c !== id) : []
}

// Kana Quiz/Word Builder distractor characters — three-tier priority (Issue
// "distractor priority order"): (1) the target(s)' OWN confusion-group
// mates first (シ's choices should include ツ, not just any random
// katakana), (2) characters from OTHER confusion groups next (still a
// "similar letters" character, just not this target's own pair/trio — e.g.
// ス/ヌ before an unrelated normal character), (3) normal same-script
// characters last, only filling whatever slots remain. Mirrors
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
  const mateSet = new Set(mates)
  const allGroupIds = new Set(groups.flat())
  const otherGroupChars = pool.filter((id) => !targetSet.has(id) && !mateSet.has(id) && allGroupIds.has(id))
  const otherGroupSet = new Set(otherGroupChars)
  const normal = pool.filter((id) => !targetSet.has(id) && !mateSet.has(id) && !otherGroupSet.has(id))
  return [...shuffleWith(mates, rng), ...shuffleWith(otherGroupChars, rng), ...shuffleWith(normal, rng)].slice(0, count)
}

// ---------------------------------------------------------------------------
// Similar Letters Listening — spelling-choice generation (replaces the old
// real-word-distractor approach for Similar Letters ONLY; normal Listening
// still uses pickSimilarLettersDistractorWords/pickDistractorWords). See the
// PR issue: the learner hears the real target word and picks its correct
// KANA SPELLING out of 4 generated variants (1 correct + 3 fabricated wrong
// spellings). Wrong spellings are DISPLAY-ONLY strings — never given a fake
// id/AnchorWord, never persisted anywhere.
// ---------------------------------------------------------------------------

// UI-only shape for one Listening spelling choice. `key` is an ephemeral
// React list key, NOT a word id — never treat it as one, and never feed it
// to recordWordReviewResult/progressStore/Review/SRS.
export type SpellingChoice = { key: string; kana: string; isCorrect: boolean }

type SpellingPosition = { charId: string; kana: string }

function toPositions(characterIds: readonly string[], kanaById: (id: string) => string): SpellingPosition[] {
  return characterIds.map((charId) => ({ charId, kana: kanaById(charId) }))
}

function renderSpelling(positions: readonly SpellingPosition[]): string {
  return positions.map((p) => p.kana).join('')
}

function withSubstitutions(
  positions: readonly SpellingPosition[],
  indices: readonly number[],
  newCharIds: readonly string[],
  kanaById: (id: string) => string,
): SpellingPosition[] {
  const copy = positions.map((p) => ({ ...p }))
  indices.forEach((idx, i) => {
    copy[idx] = { charId: newCharIds[i], kana: kanaById(newCharIds[i]) }
  })
  return copy
}

// All subsets of `indices` with size >= 2, capped at `cap` results — used
// only for tier 2 (multi-character same-group substitution). Bounded: real
// words are short (a handful of characters), and this only enumerates
// subsets of the characters that actually have a confusion-group mate, which
// is normally a small fraction of the word.
function subsetsOfSizeAtLeastTwo(indices: readonly number[], cap: number): number[][] {
  const n = Math.min(indices.length, 16) // hard safety cap — never explored in practice
  const result: number[][] = []
  for (let mask = 1; mask < 1 << n && result.length < cap; mask++) {
    let popcount = 0
    for (let i = 0; i < n; i++) if (mask & (1 << i)) popcount++
    if (popcount < 2) continue
    const combo: number[] = []
    for (let i = 0; i < n; i++) if (mask & (1 << i)) combo.push(indices[i])
    result.push(combo)
  }
  return result
}

// Builds the 4 Listening choices (1 correct spelling + `count - 1` fabricated
// wrong spellings) for `targetWord`, per the priority order:
//   1. single-character same-confusion-group substitution
//   2. multi-character same-confusion-group substitution
//   3. single-character substitution with a different Similar Letters
//      character (any `groups` member) NOT in the substituted char's own group
//   4. random same-script substitution from `sameScriptPool` (already
//      filtered by the caller to exclude ー/っ/ッ/placeholder characters)
// Falls through tiers only when the current tier can't produce enough unique
// candidates. Never crosses scripts (sameScriptPool is caller-supplied and
// assumed same-script). Every choice has the exact same character COUNT as
// the correct spelling (position-substitution only, no insert/delete).
export function buildSimilarLettersSpellingChoices<T extends { id: string; characterIds: string[] }>(
  targetWord: T,
  groups: readonly string[][],
  kanaById: (charId: string) => string,
  sameScriptPool: readonly string[],
  count: number,
  rng: Rng = Math.random,
): SpellingChoice[] {
  const positions = toPositions(targetWord.characterIds, kanaById)
  const correctKana = renderSpelling(positions)
  const wrongCount = Math.max(0, count - 1)

  const wrongSpellings = new Set<string>()
  const wrong: string[] = []
  const tryAdd = (spelling: string) => {
    if (wrong.length >= wrongCount) return
    if (spelling === correctKana) return
    if (wrongSpellings.has(spelling)) return
    wrongSpellings.add(spelling)
    wrong.push(spelling)
  }

  const groupPositions = positions
    .map((p, idx) => ({ idx, mates: getGroupMates(groups, p.charId) }))
    .filter((p) => p.mates.length > 0)

  // Tier 1: single-character same-group substitution.
  const tier1 = shuffleWith(
    groupPositions.flatMap((gp) => gp.mates.map((mate) => ({ idx: gp.idx, mate }))),
    rng,
  )
  for (const cand of tier1) {
    if (wrong.length >= wrongCount) break
    tryAdd(renderSpelling(withSubstitutions(positions, [cand.idx], [cand.mate], kanaById)))
  }

  // Tier 2: multi-character (2+) same-group substitution.
  if (wrong.length < wrongCount && groupPositions.length >= 2) {
    const combos = shuffleWith(
      subsetsOfSizeAtLeastTwo(
        groupPositions.map((gp) => gp.idx),
        20,
      ),
      rng,
    )
    for (const combo of combos) {
      if (wrong.length >= wrongCount) break
      const newIds = combo.map((idx) => pickUniform(getGroupMates(groups, positions[idx].charId), rng))
      tryAdd(renderSpelling(withSubstitutions(positions, combo, newIds, kanaById)))
    }
  }

  // Tier 3: other-Similar-Letters substitution (a different confusion-group
  // character, not from the substituted position's own group).
  if (wrong.length < wrongCount) {
    const allGroupIds = [...new Set(groups.flat())]
    const positionOrder = shuffleWith(
      positions.map((_, idx) => idx),
      rng,
    )
    for (const idx of positionOrder) {
      if (wrong.length >= wrongCount) break
      const ownGroupIds = new Set([positions[idx].charId, ...getGroupMates(groups, positions[idx].charId)])
      const otherGroupChars = shuffleWith(
        allGroupIds.filter((id) => !ownGroupIds.has(id)),
        rng,
      )
      for (const otherId of otherGroupChars) {
        if (wrong.length >= wrongCount) break
        tryAdd(renderSpelling(withSubstitutions(positions, [idx], [otherId], kanaById)))
      }
    }
  }

  // Tier 4: random same-script substitution — final fallback.
  if (wrong.length < wrongCount) {
    const positionOrder = shuffleWith(
      positions.map((_, idx) => idx),
      rng,
    )
    for (const idx of positionOrder) {
      if (wrong.length >= wrongCount) break
      const candidates = shuffleWith(
        sameScriptPool.filter((id) => id !== positions[idx].charId),
        rng,
      )
      for (const candidateId of candidates) {
        if (wrong.length >= wrongCount) break
        tryAdd(renderSpelling(withSubstitutions(positions, [idx], [candidateId], kanaById)))
      }
    }
  }

  const wrongChoices: SpellingChoice[] = wrong.map((kana, i) => ({ key: `wrong-${i}`, kana, isCorrect: false }))
  const correctChoice: SpellingChoice = { key: 'correct', kana: correctKana, isCorrect: true }
  return shuffleWith([correctChoice, ...wrongChoices], rng)
}

