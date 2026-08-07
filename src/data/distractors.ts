// Visually/phonetically confusable character pairs, used to pick tougher
// distractors in the listening game than pure random choice would give.
// Keys and values are KanaChar ids from characters.ts.
// The table is symmetric by convention (if A lists B, B lists A) but each
// entry is written out explicitly rather than derived, so it stays easy to
// scan and edit as content grows.
export const CONFUSABLE_PAIRS: Record<string, string[]> = {
  // the classic "loopy squiggle" cluster
  nu: ['me', 'wa', 're', 'ne'],
  me: ['nu', 'wa', 're', 'ne'],
  wa: ['nu', 'me', 're', 'ne'],
  re: ['nu', 'me', 'wa', 'ne'],
  ne: ['nu', 'me', 'wa', 're'],

  ru: ['ro'],
  ro: ['ru', 'so'],
  so: ['ro'],

  sa: ['ki', 'chi'],
  ki: ['sa', 'chi'],
  chi: ['sa', 'ki'],

  ha: ['ho', 'ma'],
  ho: ['ha'],
  ma: ['ha'],

  u: ['ra'],
  ra: ['u'],

  ni: ['ko'],
  ko: ['ni'],

  ta: ['na'],
  na: ['ta'],

  ku: ['ke'],
  ke: ['ku'],

  // dakuten/handakuten confusions (same base shape, easy to mis-hear/mis-read)
  ba: ['pa'],
  pa: ['ba'],
  bi: ['pi'],
  pi: ['bi'],
  bu: ['pu'],
  pu: ['bu'],
  be: ['pe'],
  pe: ['be'],
  bo: ['po'],
  po: ['bo'],
}

export function getConfusableIds(charId: string): string[] {
  return CONFUSABLE_PAIRS[charId] ?? []
}
