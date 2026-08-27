import { CHOUON_GUIDE } from './chouonGuide'
import { LEARN_TRACING_GUIDE } from './learnTracingGuide'
import { PRACTICE_GUIDE } from './practiceGuide'
import { SOKUON_GUIDE } from './sokuonGuide'
import { YOUON_GUIDE } from './youonGuide'

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
// 'category' splits this catalog in two:
// - 'tutorial': the general-purpose Guides Settings surfaces directly
//   (Issue #46's original "Guides" section, now "Tutorials").
// - 'concept': per-curriculum-feature Guides (Sokuon/Chōon/Yōon). These are
//   intentionally NOT surfaced in Settings — a future PR ("Ask Tamamizu
//   about small っ" / "...long vowels" / "...small ゃゅょ sounds") will
//   surface each one from within its own curriculum section instead. Their
//   Guide data, replay ids, target paths, and useGuideReplay support all
//   stay fully intact here in the meantime.
export type GuideCatalogEntry =
  | { id: 'intro'; label: string; kind: 'introFlag'; category: 'tutorial' }
  | { id: 'learnTracing' | 'practice' | 'review'; label: string; kind: 'replay'; path: string; category: 'tutorial' }
  | { id: 'sokuon' | 'chouon' | 'youon'; label: string; kind: 'replay'; path: string; category: 'concept' }

const learnTracingPath = `/practice/${LEARN_TRACING_GUIDE.target.categoryId}/${LEARN_TRACING_GUIDE.target.rowId}`
const practicePath = `/practice/${PRACTICE_GUIDE.target.categoryId}/${PRACTICE_GUIDE.target.rowId}`
const sokuonPath = `/practice/${SOKUON_GUIDE.target.categoryId}/${SOKUON_GUIDE.target.rowId}`
const chouonPath = `/practice/${CHOUON_GUIDE.target.categoryId}/${CHOUON_GUIDE.target.rowId}`
const youonPath = `/practice/${YOUON_GUIDE.target.categoryId}/${YOUON_GUIDE.target.rowId}`

export const GUIDE_CATALOG: GuideCatalogEntry[] = [
  { id: 'intro', label: 'How does KanaGame work?', kind: 'introFlag', category: 'tutorial' },
  { id: 'learnTracing', label: 'How do I learn & trace?', kind: 'replay', path: learnTracingPath, category: 'tutorial' },
  { id: 'practice', label: 'How does Practice work?', kind: 'replay', path: practicePath, category: 'tutorial' },
  { id: 'review', label: 'How does Review work?', kind: 'replay', path: '/practice/review', category: 'tutorial' },
  { id: 'sokuon', label: 'Sokuon', kind: 'replay', path: sokuonPath, category: 'concept' },
  { id: 'chouon', label: 'Chōon', kind: 'replay', path: chouonPath, category: 'concept' },
  { id: 'youon', label: 'Yōon', kind: 'replay', path: youonPath, category: 'concept' },
]

// Settings' Tutorials list — exactly the tutorial-category entries above.
export const TUTORIAL_CATALOG: GuideCatalogEntry[] = GUIDE_CATALOG.filter((g) => g.category === 'tutorial')

// Preserved for a future PR to pull concept-guide replay info from a single
// place (see the 'concept' comment above) — not yet used by any screen.
export const CONCEPT_GUIDE_CATALOG: GuideCatalogEntry[] = GUIDE_CATALOG.filter((g) => g.category === 'concept')
