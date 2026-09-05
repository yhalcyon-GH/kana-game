import { AboutContent } from '../components/AboutContent'

// Kept as its own route for old bookmarks/links — the primary way to reach
// this content is now scrolling down from /settings (see SettingsPage),
// which renders the exact same <AboutContent /> so the two never drift.
export function AboutPage() {
  return <AboutContent />
}
