// Data-driven "red pen" annotations for Similar Letters' Learn overlay (see
// components/AnnotatedKanaCard.tsx) — one entry per character id, keyed the
// same as characters.ts. Coordinates are normalized to a 0-100 x 0-100 SVG
// viewBox laid directly over the character's own CharacterCard, so the
// overlay scales with the card at any screen size instead of using fixed
// pixels (see the Issue's "normalized / SVG viewBox coordinates" rule).
//
// Placement was tuned by eye against the app's actual Learn font/card
// layout (see CharacterCard.tsx — the same component this overlay sits on
// top of, never a re-rendered/re-fonted copy), not derived from exact glyph
// vector data — treat the exact x/y of any single mark as a reasonable
// first pass rather than stroke-perfect geometry, and adjust freely if a
// mark visibly drifts off its intended stroke on review.
//
// `caption` is the accessible-text equivalent of what the red marks show —
// screen readers don't see color, so this is what actually carries "what's
// different here" (see AnnotatedKanaCard's aria wiring), kept short by
// design rather than a paragraph of stroke commentary.
export type AnnotationMark =
  | { type: 'arrow'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'circle'; cx: number; cy: number; r: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number }

export type SimilarLetterAnnotation = {
  marks: AnnotationMark[]
  caption: string
}

export const SIMILAR_LETTER_ANNOTATIONS: Record<string, SimilarLetterAnnotation> = {
  // あ・お — お has an extra tail stroke あ doesn't.
  a: { marks: [{ type: 'circle', cx: 62, cy: 72, r: 14 }], caption: 'あ: the bottom stroke curls back and closes into itself.' },
  o: {
    marks: [{ type: 'arrow', x1: 50, y1: 55, x2: 30, y2: 78 }],
    caption: 'お: an extra separate tail stroke sweeps out to the lower-left — あ has no such extra stroke.',
  },

  // き・さ・ち — horizontal-stroke count and lower-curve shape.
  ki: {
    marks: [{ type: 'line', x1: 25, y1: 78, x2: 62, y2: 70 }],
    caption: 'き: three horizontal strokes, with a small hook at the bottom-left.',
  },
  sa: {
    marks: [{ type: 'line', x1: 55, y1: 25, x2: 75, y2: 40 }],
    caption: 'さ: a short diagonal stroke crosses near the top, above two horizontal strokes.',
  },
  chi: {
    marks: [{ type: 'arrow', x1: 30, y1: 45, x2: 65, y2: 80 }],
    caption: 'ち: one smooth curving stroke, no separate horizontal strokes like き/さ.',
  },

  // ぬ・め — ぬ has an extra small loop.
  nu: {
    marks: [{ type: 'circle', cx: 68, cy: 68, r: 12 }],
    caption: 'ぬ: an extra small loop at the bottom-right — め ends without one.',
  },
  me: {
    marks: [{ type: 'arrow', x1: 55, y1: 55, x2: 75, y2: 75 }],
    caption: 'め: the stroke ends in a plain curve, no extra loop.',
  },

  // ね・わ・れ — right side/ending differs.
  ne: {
    marks: [{ type: 'circle', cx: 66, cy: 70, r: 11 }],
    caption: 'ね: a small loop at the bottom-right.',
  },
  wa: {
    marks: [{ type: 'arrow', x1: 50, y1: 50, x2: 72, y2: 68 }],
    caption: 'わ: curves down to the right and stops — no loop at the end.',
  },
  re: {
    marks: [{ type: 'arrow', x1: 55, y1: 68, x2: 74, y2: 55 }],
    caption: 'れ: a short flick kicks back UP to the right at the end — no loop.',
  },

  // は・ほ・ま — right-side structure/loop position.
  ha: {
    marks: [{ type: 'circle', cx: 70, cy: 62, r: 12 }],
    caption: 'は: a small loop attached low on the right-side vertical stroke.',
  },
  ho: {
    marks: [{ type: 'line', x1: 55, y1: 40, x2: 80, y2: 40 }],
    caption: 'ほ: an extra horizontal stroke crosses the right side, above the loop — は has no such stroke.',
  },
  ma: {
    marks: [{ type: 'circle', cx: 50, cy: 75, r: 14 }],
    caption: 'ま: the bottom stroke curls fully into a closed loop.',
  },

  // か・や — short stroke position/direction.
  ka: {
    marks: [{ type: 'line', x1: 60, y1: 25, x2: 78, y2: 38 }],
    caption: 'か: a short diagonal stroke near the top-right, separate from the main body.',
  },
  ya: {
    marks: [{ type: 'arrow', x1: 65, y1: 22, x2: 40, y2: 40 }],
    caption: 'や: the top stroke hooks down and to the left before the body begins.',
  },

  // る・ろ — MOST IMPORTANT pair: る has a bottom loop, ろ does not.
  ru: {
    marks: [
      { type: 'circle', cx: 55, cy: 76, r: 15 },
      { type: 'arrow', x1: 40, y1: 60, x2: 55, y2: 76 },
    ],
    caption: 'る: the stroke curls all the way into a closed loop at the bottom — this is the key difference from ろ.',
  },
  ro: {
    marks: [{ type: 'arrow', x1: 40, y1: 58, x2: 62, y2: 74 }],
    caption: 'ろ: the stroke curves at the bottom but stays OPEN — no loop, unlike る.',
  },

  // ア・マ — lower-stroke angle / crossing.
  'katakana-a': {
    marks: [{ type: 'arrow', x1: 55, y1: 50, x2: 30, y2: 80 }],
    caption: 'ア: the lower stroke angles sharply down to the left.',
  },
  'katakana-ma': {
    marks: [{ type: 'line', x1: 35, y1: 55, x2: 68, y2: 80 }],
    caption: 'マ: two strokes cross low, forming an X near the bottom.',
  },

  // タ・ク・ケ・ワ — short-stroke position/count/direction.
  'katakana-ta': {
    marks: [{ type: 'circle', cx: 65, cy: 28, r: 10 }],
    caption: 'タ: a short stroke floats near the top, separate from the body below.',
  },
  'katakana-ku': {
    marks: [{ type: 'line', x1: 62, y1: 35, x2: 78, y2: 55 }],
    caption: 'ク: one short stroke on the right, angling down partway.',
  },
  'katakana-ke': {
    marks: [{ type: 'line', x1: 62, y1: 30, x2: 82, y2: 75 }],
    caption: 'ケ: the right-side stroke is longer, angling all the way down — further than ク\'s.',
  },
  'katakana-wa': {
    marks: [{ type: 'circle', cx: 70, cy: 72, r: 10 }],
    caption: 'ワ: a small hook at the bottom-right.',
  },

  // メ・ナ — crossing vs. no crossing.
  'katakana-me': {
    marks: [{ type: 'circle', cx: 50, cy: 50, r: 10 }],
    caption: 'メ: two strokes cross in the middle, forming an X.',
  },
  'katakana-na': {
    marks: [{ type: 'line', x1: 55, y1: 25, x2: 78, y2: 35 }],
    caption: 'ナ: one short stroke near the top-right — the strokes never cross.',
  },

  // シ・ツ — MOST IMPORTANT pair: shi leans horizontal, tsu leans vertical.
  'katakana-shi': {
    marks: [
      { type: 'arrow', x1: 30, y1: 30, x2: 45, y2: 38 },
      { type: 'arrow', x1: 35, y1: 65, x2: 72, y2: 55 },
    ],
    caption: 'シ: the short strokes and final stroke sweep more HORIZONTALLY, left to right.',
  },
  'katakana-tsu': {
    marks: [
      { type: 'arrow', x1: 35, y1: 28, x2: 42, y2: 45 },
      { type: 'arrow', x1: 40, y1: 45, x2: 62, y2: 78 },
    ],
    caption: 'ツ: the short strokes and final stroke drop more VERTICALLY, top to bottom.',
  },

  // ス・ヌ — crossing point/extra hook.
  'katakana-su': {
    marks: [{ type: 'circle', cx: 48, cy: 35, r: 9 }],
    caption: 'ス: the strokes cross near the TOP before sweeping down-left.',
  },
  'katakana-nu': {
    marks: [
      { type: 'circle', cx: 50, cy: 52, r: 9 },
      { type: 'arrow', x1: 60, y1: 65, x2: 75, y2: 62 },
    ],
    caption: 'ヌ: the strokes cross LOWER, and end with a small extra hook — ス has no hook.',
  },

  // カ・ヤ — hook position.
  'katakana-ka': {
    marks: [{ type: 'arrow', x1: 35, y1: 65, x2: 25, y2: 78 }],
    caption: 'カ: a small hook stroke at the bottom-left.',
  },
  'katakana-ya': {
    marks: [{ type: 'arrow', x1: 55, y1: 25, x2: 78, y2: 20 }],
    caption: 'ヤ: the top stroke extends further out to the upper-right.',
  },

  // コ・ユ — MOST IMPORTANT pair: protruding vs. flush corner.
  'katakana-ko': {
    marks: [{ type: 'circle', cx: 72, cy: 72, r: 8 }],
    caption: 'コ: the bottom line stops FLUSH at the corner — it does not stick out.',
  },
  'katakana-yu': {
    marks: [{ type: 'arrow', x1: 60, y1: 72, x2: 82, y2: 72 }],
    caption: 'ユ: the bottom-right line STICKS OUT past the corner — that\'s the giveaway vs. コ.',
  },

  // ソ・リ・ン — angle/spacing.
  'katakana-so': {
    marks: [{ type: 'arrow', x1: 60, y1: 25, x2: 35, y2: 55 }],
    caption: 'ソ: two short strokes point down-left, with a visible gap between them.',
  },
  'katakana-ri': {
    marks: [{ type: 'line', x1: 40, y1: 25, x2: 40, y2: 75 }],
    caption: 'リ: two mostly-VERTICAL strokes side by side.',
  },
  'katakana-n': {
    marks: [{ type: 'arrow', x1: 62, y1: 25, x2: 38, y2: 60 }],
    caption: 'ン: the two strokes angle more diagonally and sit closer together than ソ\'s.',
  },
}
