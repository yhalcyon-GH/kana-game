# Analytics & feedback foundation

**Status: foundation only, no external provider connected.** This
describes what's actually implemented (as of the 2026-09 commercial-release
work) and, deliberately, what is NOT yet done.

## What this is

A provider-neutral analytics abstraction (`src/lib/analytics/`) and a
provider-neutral feedback abstraction (`src/lib/feedback/`), instrumented
into the app's main learning flows, so that connecting a real analytics or
feedback service later is a small, isolated change instead of a rewrite.

## What this deliberately is NOT

- **No third-party analytics provider is enabled.** `src/lib/analytics/track.ts`
  ships with `noopProvider` in production (a dev-only console provider is
  used in `npm run dev`) — no event this app calls `track()` for is sent
  anywhere over the network today.
- **No feedback service is connected.** The Send Feedback UI only appears
  if `VITE_FEEDBACK_URL` is set at build time; it is unset in this release,
  so the entry point does not render at all (see `src/lib/feedback/`).
- **No persistent cross-session user/analytics ID.** Nothing here
  fingerprints a device or assigns an anonymous distinct ID.
- **No sensitive data in event properties.** See
  `src/lib/analytics/types.ts`'s `AnalyticsProperties` — a fixed, small set
  of low-cardinality fields (category/row/activity/assessment/score/attempt/
  result/screenSize). Speech transcripts, microphone audio, free-text
  feedback, names, emails, and exact screen dimensions are never included
  by type.

## Event taxonomy

See `src/lib/analytics/types.ts`'s `AnalyticsEventName` for the exact list.
Instrumented call sites as of this release:

- `intro_completed` — `IntroGuide`, when the first-run tutorial finishes.
- `lesson_started` / `lesson_completed` — `LearnPage`.
- `practice_started` / `practice_completed` — the four graded mini-games
  (Kana Quiz, Kana Typing, Listening, Word Builder) via `useGameSession`.
- `assessment_started` / `assessment_completed` — `AssessmentPage`
  (Hiragana/Katakana Test, Sound Length, Final Kana Test).
- `word_reading_speech_success` / `word_reading_speech_retry` /
  `word_reading_romaji_fallback` — the Word Reading assessment family's
  speech-recognition flow.
- `restaurant_started` / `restaurant_completed` — `RestaurantPage`.
- `cafe_started` / `cafe_completed` — `CafePage`.
- `graduated` — fired once, the moment `progressStore`'s graduation flag
  first flips to `true`.
- `feedback_opened` / `feedback_submitted` — the Send Feedback UI. As of
  this release `feedback_submitted` is never actually fired: with no
  feedback provider configured, no submission can succeed (see "What this
  deliberately is NOT" above) — firing it anyway would be a fabricated
  event with no real submission behind it.

## Duplicate-event safety

Each instrumented flow fires its `_started`/`_completed` event from a
`useRef` guard inside the relevant `useEffect`, not from a bare render-time
call — the same shape `RestaurantPage`'s existing
`completed`-triggers-`markRowActivityCompleted` effect already used. This
is deliberately robust to React StrictMode's dev-only double-invoke of
effects and to a session's `sessionKey`/`completed` flags flipping more
than once due to Retry.

## What connecting a real provider later requires

1. Pick a provider (PostHog, Plausible, Umami, GA, or anything else) — a
   separate, later decision; this foundation does not pre-select one.
2. Implement `AnalyticsProvider` (`src/lib/analytics/types.ts`) for it and
   swap the `activeProvider` assignment in `track.ts`.
3. **Update `docs/legal` / the in-app Privacy Policy (`src/routes/PrivacyPage.tsx`)
   before enabling it in production** — the current Privacy Policy states
   that no third-party analytics service is active. Do not flip on a real
   provider without updating that page first.
4. Decide whether any anonymous distinct ID is actually needed, and if so,
   do a privacy review of that specifically — this foundation intentionally
   ships without one.
5. For feedback: pick a destination, set `VITE_FEEDBACK_URL` in the build
   environment, and implement `FeedbackProvider` (`src/lib/feedback/types.ts`)
   for whatever protocol that destination expects.
