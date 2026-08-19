type Props = { icon?: string; className?: string }

// Most ScriptEntryPoint/ScriptCategory icons are still a plain emoji
// (rendered as text), but hiragana/katakana/拗音/そのほか now use a real
// illustration instead (public/category-icons/<id>.webp) — this renders
// whichever kind `icon` is, so call sites don't need to know which.
export function CategoryIcon({ icon, className = 'h-6 w-6' }: Props) {
  if (!icon) return null
  if (icon.endsWith('.webp')) {
    return <img src={`${import.meta.env.BASE_URL}${icon}`} alt="" className={`inline-block object-contain ${className}`} />
  }
  return (
    <span className={className} aria-hidden="true">
      {icon}
    </span>
  )
}
