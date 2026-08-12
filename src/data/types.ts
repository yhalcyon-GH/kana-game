export type CharType = 'base' | 'dakuten' | 'handakuten'

export type KanaChar = {
  id: string
  kana: string
  romaji: string
  rowId: string
  type: CharType
}

export type GojuonRow = {
  id: string
  label: string
  characterIds: string[]
  order: number
}

export type AnchorWord = {
  id: string
  kana: string
  romaji: string
  meaning: string
  image: string
  characterIds: string[]
  audioText?: string
}
