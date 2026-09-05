// Provider-neutral analytics event taxonomy. This foundation intentionally
// ships with NO external analytics provider connected — see
// src/lib/analytics/track.ts's noop default. Selecting and wiring an actual
// third-party provider (PostHog, Plausible, Umami, GA, or anything else) is
// a deliberately separate, later decision — see docs/analytics-foundation.md.
//
// Every event name and property here is part of a small, deliberately
// low-cardinality taxonomy. Do not add free-form string properties (user
// input, transcripts, arbitrary text) — see AnalyticsProperties below for
// exactly what's allowed. This restriction is enforced at the type level so
// a future call site can't accidentally widen it.
export type AnalyticsEventName =
  | 'intro_completed'
  | 'lesson_started'
  | 'lesson_completed'
  | 'practice_started'
  | 'practice_completed'
  | 'assessment_started'
  | 'assessment_completed'
  | 'word_reading_speech_success'
  | 'word_reading_speech_retry'
  | 'word_reading_romaji_fallback'
  | 'restaurant_started'
  | 'restaurant_completed'
  | 'cafe_started'
  | 'cafe_completed'
  | 'graduated'
  | 'feedback_opened'
  | 'feedback_submitted'

// Deliberately low-cardinality, non-identifying properties only. Values are
// restricted to strings/numbers/booleans — never raw user input,
// transcripts, audio, or free text (see the module doc above). Screen size
// is bucketed into 3 categories rather than exact pixel dimensions to avoid
// being a fingerprinting signal.
export type ScreenSizeCategory = 'small' | 'medium' | 'large'

export type AnalyticsProperties = {
  category?: string
  row?: string
  activity?: string
  assessment?: string
  score?: number
  attempt?: number
  result?: string
  screenSize?: ScreenSizeCategory
}

// A provider only ever receives already-validated, already-shaped events —
// see track.ts. Implementations must never throw: a provider failure must
// never interrupt the learning flow that called track().
export type AnalyticsProvider = {
  track(event: AnalyticsEventName, properties?: AnalyticsProperties): void
}
