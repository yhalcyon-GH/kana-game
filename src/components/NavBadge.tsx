// Small overlay count badge shared by NavBar's Review/Saved links — renders
// nothing at 0 (never an empty circle), the exact number 1-99, or '99+'
// beyond that. Absolutely positioned by the caller (top-right corner of a
// relatively-positioned wrapper) so it never affects the label's own
// layout width — unlike the old inline Review badge, which sat in normal
// flow next to the label text and widened that nav item.
//
// Deliberately NOT aria-hidden: ReviewGuide.test.tsx's existing contract
// (predating this component) looks up the Review nav link by its
// accessible name including the count (getByRole('link', { name:
// /Review\s*1/ })) and asserts the count-carrying element is a <span> that
// receives the guide-highlight color classes — both preserved here.
export function NavBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  const display = count > 99 ? '99+' : String(count)
  return (
    <span
      className={`absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-semibold text-white ${className ?? ''}`}
    >
      {display}
    </span>
  )
}
