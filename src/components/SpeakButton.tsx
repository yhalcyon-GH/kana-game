import { useTTS } from '../hooks/useTTS'

type Props = {
  audioKey: string
  text: string
  label: string
}

// Shared speaker button used by CharacterCard/WordCard — hides itself
// entirely when the browser has no speechSynthesis support.
export function SpeakButton({ audioKey, text, label }: Props) {
  const { speak, supported } = useTTS()
  if (!supported) return null

  return (
    <button
      type="button"
      onClick={() => speak(audioKey, text)}
      className="mt-1 rounded-full bg-neutral-100 px-3 py-1 text-sm hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600"
      aria-label={label}
    >
      🔊
    </button>
  )
}
