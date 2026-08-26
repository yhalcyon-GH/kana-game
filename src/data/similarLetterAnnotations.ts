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
// Marks are the ONLY thing that conveys "what's different here" — there is
// deliberately no caption/prose text. The overlay is purely visual
// (aria-hidden), so placement accuracy against the real Klee One glyph
// shapes matters more than it would if a caption were backing it up.
export type AnnotationMark =
  | { type: 'arrow'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'circle'; cx: number; cy: number; r: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number }

export type SimilarLetterAnnotation = {
  marks: AnnotationMark[]
}

export const SIMILAR_LETTER_ANNOTATIONS: Record<string, SimilarLetterAnnotation> = {
  // あ・お — お has an extra tail stroke あ doesn't.
  a: { marks: [{ type: 'circle', cx: 62, cy: 72, r: 14 }] },
  o: {
    marks: [{ type: 'arrow', x1: 50, y1: 55, x2: 30, y2: 78 }],
  },

  // き・さ・ち — horizontal-stroke count and lower-curve shape.
  ki: {
    marks: [{ type: 'line', x1: 25, y1: 78, x2: 62, y2: 70 }],
  },
  sa: {
    marks: [{ type: 'line', x1: 55, y1: 25, x2: 75, y2: 40 }],
  },
  chi: {
    marks: [{ type: 'arrow', x1: 30, y1: 45, x2: 65, y2: 80 }],
  },

  // ぬ・め — ぬ has an extra small loop.
  nu: {
    marks: [{ type: 'circle', cx: 68, cy: 68, r: 12 }],
  },
  me: {
    marks: [{ type: 'arrow', x1: 55, y1: 55, x2: 75, y2: 75 }],
  },

  // ね・わ・れ — right side/ending differs.
  ne: {
    marks: [{ type: 'circle', cx: 66, cy: 70, r: 11 }],
  },
  wa: {
    marks: [{ type: 'arrow', x1: 50, y1: 50, x2: 72, y2: 68 }],
  },
  re: {
    marks: [{ type: 'arrow', x1: 55, y1: 68, x2: 74, y2: 55 }],
  },

  // は・ほ・ま — right-side structure/loop position.
  ha: {
    marks: [{ type: 'circle', cx: 70, cy: 62, r: 12 }],
  },
  ho: {
    marks: [{ type: 'line', x1: 55, y1: 40, x2: 80, y2: 40 }],
  },
  ma: {
    marks: [{ type: 'circle', cx: 50, cy: 75, r: 14 }],
  },

  // か・や — short stroke position/direction.
  ka: {
    marks: [{ type: 'line', x1: 60, y1: 25, x2: 78, y2: 38 }],
  },
  ya: {
    marks: [{ type: 'arrow', x1: 65, y1: 22, x2: 40, y2: 40 }],
  },

  // る・ろ — MOST IMPORTANT pair: る has a bottom loop, ろ does not.
  ru: {
    marks: [
      { type: 'circle', cx: 55, cy: 78, r: 14 },
      { type: 'arrow', x1: 42, y1: 62, x2: 55, y2: 78 },
    ],
  },
  ro: {
    marks: [{ type: 'arrow', x1: 42, y1: 60, x2: 60, y2: 76 }],
  },

  // ア・マ — lower-stroke angle / crossing.
  'katakana-a': {
    marks: [{ type: 'arrow', x1: 55, y1: 50, x2: 30, y2: 80 }],
  },
  'katakana-ma': {
    marks: [{ type: 'line', x1: 35, y1: 55, x2: 68, y2: 80 }],
  },

  // タ・ク・ケ・ワ — short-stroke position/count/direction.
  'katakana-ta': {
    marks: [{ type: 'circle', cx: 65, cy: 28, r: 10 }],
  },
  'katakana-ku': {
    marks: [{ type: 'line', x1: 62, y1: 35, x2: 78, y2: 55 }],
  },
  'katakana-ke': {
    marks: [{ type: 'line', x1: 62, y1: 30, x2: 82, y2: 75 }],
  },
  'katakana-wa': {
    marks: [{ type: 'circle', cx: 70, cy: 72, r: 10 }],
  },

  // メ・ナ — crossing vs. no crossing.
  'katakana-me': {
    marks: [{ type: 'circle', cx: 50, cy: 50, r: 10 }],
  },
  'katakana-na': {
    marks: [{ type: 'line', x1: 55, y1: 25, x2: 78, y2: 35 }],
  },

  // シ・ツ — MOST IMPORTANT pair: シ's strokes sweep left-to-right/horizontal
  // (both short strokes and the long final stroke run more horizontally,
  // rising slightly left-to-right), ツ's sweep top-to-bottom/vertical (both
  // short strokes and the final stroke drop steeply downward). Arrows are
  // oriented to visibly differ in angle: shi's arrows are shallow (near-
  // horizontal), tsu's arrows are steep (near-vertical).
  'katakana-shi': {
    marks: [
      { type: 'arrow', x1: 28, y1: 32, x2: 46, y2: 36 },
      { type: 'arrow', x1: 30, y1: 62, x2: 74, y2: 50 },
    ],
  },
  'katakana-tsu': {
    marks: [
      { type: 'arrow', x1: 34, y1: 22, x2: 40, y2: 42 },
      { type: 'arrow', x1: 42, y1: 42, x2: 58, y2: 80 },
    ],
  },

  // ス・ヌ — crossing point/extra hook. ス crosses high and sweeps straight
  // down-left with no loop at the end; ヌ crosses lower and its final stroke
  // hooks back into a small loop before ending.
  'katakana-su': {
    marks: [{ type: 'circle', cx: 46, cy: 32, r: 9 }],
  },
  'katakana-nu': {
    marks: [
      { type: 'circle', cx: 52, cy: 55, r: 9 },
      { type: 'circle', cx: 66, cy: 66, r: 8 },
    ],
  },

  // カ・ヤ — hook position.
  'katakana-ka': {
    marks: [{ type: 'arrow', x1: 35, y1: 65, x2: 25, y2: 78 }],
  },
  'katakana-ya': {
    marks: [{ type: 'arrow', x1: 55, y1: 25, x2: 78, y2: 20 }],
  },

  // コ・ユ — MOST IMPORTANT pair: コ's bottom-right corner is flush/closed
  // (the bottom horizontal stroke ends exactly at the vertical stroke, no
  // overshoot); ユ's bottom-right stroke visibly sticks out past that
  // corner. Circle sits tight on コ's corner; arrow on ユ points at the
  // protruding overshoot past the same corner position.
  'katakana-ko': {
    marks: [{ type: 'circle', cx: 74, cy: 74, r: 7 }],
  },
  'katakana-yu': {
    marks: [{ type: 'arrow', x1: 74, y1: 74, x2: 90, y2: 74 }],
  },

  // ソ・リ・ン — angle/spacing. ソ's two strokes point down-LEFT (diagonal,
  // upper-right to lower-left) with a gap; リ's two strokes are both
  // near-vertical, parallel, close together; ン's two strokes point down-
  // RIGHT overall (mirrored diagonal from ソ, upper-left toward lower-
  // right), closer together than ソ's.
  'katakana-so': {
    marks: [
      { type: 'line', x1: 62, y1: 22, x2: 48, y2: 40 },
      { type: 'arrow', x1: 60, y1: 42, x2: 32, y2: 68 },
    ],
  },
  'katakana-ri': {
    marks: [
      { type: 'line', x1: 38, y1: 25, x2: 38, y2: 72 },
      { type: 'line', x1: 58, y1: 30, x2: 58, y2: 78 },
    ],
  },
  'katakana-n': {
    marks: [
      { type: 'line', x1: 38, y1: 22, x2: 48, y2: 40 },
      { type: 'arrow', x1: 46, y1: 42, x2: 68, y2: 68 },
    ],
  },
}
