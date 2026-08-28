import { toMorae } from '../lib/mora'

type Props = {
  kana: string
  className?: string
}

// Wraps every mora of `kana` in its own non-breaking span (see toMorae —
// a yōon combination like きゃ is one mora, two glyphs) so the browser's
// default CJK line-breaking (which allows a break between ANY two kana
// glyphs, since Japanese text has no spaces) can never split a yōon unit
// across two lines. Sibling <span>s still have an ordinary break
// opportunity between them, so normal wrapping between morae/words is
// unaffected — this only removes the specific bad break point inside a
// yōon pair. Renders identically to the plain kana string otherwise (no
// added whitespace between spans).
export function UnbreakableKana({ kana, className }: Props) {
  return (
    <>
      {toMorae(kana).map((mora, i) => (
        <span key={i} className={`whitespace-nowrap ${className ?? ''}`}>
          {mora}
        </span>
      ))}
    </>
  )
}
