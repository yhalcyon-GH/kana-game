// Explanation images comparing look-alike katakana pairs, shown in the
// Similar Letters lesson (Learn and Tracing — see similarLetters.ts's
// KATAKANA_SIMILAR_GROUPS) for the characters they're drawn to disambiguate.
// Keyed by `characters.ts` KanaChar id, one entry per character in the pair
// so both members reuse the exact same image. リ (grouped with ソ/ン for the
// confusion exercise itself) has no dedicated explanation image and is
// intentionally omitted here.
export const SIMILAR_LETTER_EXPLANATION_IMAGES: Record<string, string> = {
  'katakana-shi': 'similar-letters/shi-tsu.webp',
  'katakana-tsu': 'similar-letters/shi-tsu.webp',
  'katakana-so': 'similar-letters/so-n.webp',
  'katakana-n': 'similar-letters/so-n.webp',
}

export function getSimilarLetterExplanationImage(characterId: string | undefined): string | undefined {
  return characterId ? SIMILAR_LETTER_EXPLANATION_IMAGES[characterId] : undefined
}
