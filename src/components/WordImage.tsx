type Props = {
  word: { image?: string; meaning: string }
  className: string
}

// Renders a word's word-icons/*.webp illustration, or a neutral placeholder
// when one hasn't been made yet (see AnchorWord['image']'s comment in
// data/types.ts — new categories can ship content before art exists for
// it). Centralized here since currentWord.image is rendered in four
// separate places (WordCard + the 3 mini-games that show a word prompt).
export function WordImage({ word, className }: Props) {
  if (!word.image) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-neutral-100 text-3xl dark:bg-neutral-700 ${className}`}
        aria-hidden="true"
      >
        🖼️
      </div>
    )
  }
  return <img src={`${import.meta.env.BASE_URL}${word.image}`} alt="" className={`object-contain ${className}`} />
}
