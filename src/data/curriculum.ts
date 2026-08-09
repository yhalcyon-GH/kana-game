import type { GojuonRow } from './types'

// Row order defines the curriculum sequence. Dakuten/handakuten rows are
// folded into their base row's lesson (see characters.ts) rather than
// appearing as separate rows, per the "teach voiced sounds together with
// their base row" design decision.
export const ROWS: GojuonRow[] = [
  { id: 'a-row', label: 'あ~お', order: 0, characterIds: ['a', 'i', 'u', 'e', 'o'] },
  {
    id: 'ka-row',
    label: 'か~こ・が~ご',
    order: 1,
    characterIds: ['ka', 'ki', 'ku', 'ke', 'ko', 'ga', 'gi', 'gu', 'ge', 'go'],
  },
  {
    id: 'sa-row',
    label: 'さ~そ・ざ~ぞ',
    order: 2,
    characterIds: ['sa', 'shi', 'su', 'se', 'so', 'za', 'ji', 'zu', 'ze', 'zo'],
  },
  {
    id: 'ta-row',
    label: 'た~と・だ~ど',
    order: 3,
    characterIds: ['ta', 'chi', 'tsu', 'te', 'to', 'da', 'dji', 'dzu', 'de', 'do'],
  },
  { id: 'na-row', label: 'な~の', order: 4, characterIds: ['na', 'ni', 'nu', 'ne', 'no'] },
  {
    id: 'ha-row',
    label: 'は~ほ・ば~ぼ・ぱ~ぽ',
    order: 5,
    characterIds: [
      'ha', 'hi', 'fu', 'he', 'ho',
      'ba', 'bi', 'bu', 'be', 'bo',
      'pa', 'pi', 'pu', 'pe', 'po',
    ],
  },
  { id: 'ma-row', label: 'ま~も', order: 6, characterIds: ['ma', 'mi', 'mu', 'me', 'mo'] },
  { id: 'ya-row', label: 'や・ゆ・よ', order: 7, characterIds: ['ya', 'yu', 'yo'] },
  { id: 'ra-row', label: 'ら~ろ', order: 8, characterIds: ['ra', 'ri', 'ru', 're', 'ro'] },
  { id: 'wa-row', label: 'わ~ん', order: 9, characterIds: ['wa', 'wo', 'n'] },
]

export const ROWS_BY_ID: Record<string, GojuonRow> = Object.fromEntries(
  ROWS.map((r) => [r.id, r]),
)

export function getRowOrder(rowId: string): number {
  return ROWS_BY_ID[rowId]?.order ?? -1
}

export function getPreviousRowId(rowId: string): string | null {
  const order = getRowOrder(rowId)
  return ROWS.find((r) => r.order === order - 1)?.id ?? null
}

export function getNextRowId(rowId: string): string | null {
  const order = getRowOrder(rowId)
  return ROWS.find((r) => r.order === order + 1)?.id ?? null
}

// All character ids introduced at or before the given row (inclusive),
// i.e. the vocabulary-eligible character pool once that row is unlocked.
export function getCumulativeCharacterIds(rowId: string): string[] {
  const order = getRowOrder(rowId)
  return ROWS.filter((r) => r.order <= order).flatMap((r) => r.characterIds)
}
