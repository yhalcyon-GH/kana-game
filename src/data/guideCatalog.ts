import { LEARN_TRACING_GUIDE } from './learnTracingGuide'
import { PRACTICE_GUIDE } from './practiceGuide'
import { SOKUON_GUIDE } from './sokuonGuide'

// Settings' Guides list (Issue #46) — every currently-implemented Guide a
// learner can manually replay, kept as plain data outside SettingsPage so
// the UI never hardcodes ids/labels/routes and a future Guide (Yōon,
// Chōon, ...) is just one more entry here. Deliberately holds no copy,
// audio keys, or asset paths — those stay owned by each Guide's own
// {feature}Guide.ts/{feature}GuideContent.ts, exactly like every existing
// Guide already does.
//
// 'introFlag' replays via the existing global toggle (IntroGuide is always
// mounted in App.tsx and reappears the moment its flag flips false) — no
// navigation involved. 'replay' Guides are in-context: selecting one
// navigates to the real screen it explains with a `?guide=<id>` ephemeral
// replay target (see hooks/useGuideReplay.ts) that forces just that Guide
// to display without touching its persisted completed flag.
export type GuideCatalogEntry =
  | { id: 'intro'; label: string; kind: 'introFlag' }
  | { id: 'learnTracing' | 'practice' | 'review' | 'sokuon'; label: string; kind: 'replay'; path: string }

const learnTracingPath = `/practice/${LEARN_TRACING_GUIDE.target.categoryId}/${LEARN_TRACING_GUIDE.target.rowId}`
const practicePath = `/practice/${PRACTICE_GUIDE.target.categoryId}/${PRACTICE_GUIDE.target.rowId}`
const sokuonPath = `/practice/${SOKUON_GUIDE.target.categoryId}/${SOKUON_GUIDE.target.rowId}`

export const GUIDE_CATALOG: GuideCatalogEntry[] = [
  { id: 'intro', label: 'Introduction', kind: 'introFlag' },
  { id: 'learnTracing', label: 'Learn / Tracing', kind: 'replay', path: learnTracingPath },
  { id: 'practice', label: 'Practice', kind: 'replay', path: practicePath },
  { id: 'review', label: 'Review', kind: 'replay', path: '/practice/review' },
  { id: 'sokuon', label: 'Sokuon', kind: 'replay', path: sokuonPath },
]
