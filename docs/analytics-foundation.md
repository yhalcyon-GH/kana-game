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
  so the entry point does not render at all (see `src/lib/feedback/`). When
  a URL IS configured, clicking Send Feedback opens that URL in a new tab
  with route/build-SHA/screen-size attached as query parameters (see
  `src/lib/feedback/config.ts`'s `buildFeedbackDestinationUrl`) — this is a
  plain external link action, not a `FeedbackProvider`-backed in-app
  submission; `FeedbackProvider` (below) stays for a future in-app flow if
  one is ever built.
- **No persistent cross-session user/analytics ID.** Nothing here
  fingerprints a device or assigns an anonymous distinct ID.
- **No sensitive data in event properties.** See
  `src/lib/analytics/types.ts`'s `AnalyticsProperties` — a fixed, small set
  of low-cardinality fields (category/row/activity/assessment/score/
  questionCount/attempt/result/screenSize). `questionCount` is a session's
  total question/round count; `attempt` is reserved for an actual attempt
  number and is not currently populated by any call site (see the field's
  own doc comment — do not conflate the two). Speech transcripts,
  microphone audio, free-text feedback, names, emails, and exact screen
  dimensions are never included by type.

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
- `feedback_opened` — fired from a plain `<a target="_blank" rel="noopener
  noreferrer">`'s `onClick`, meaning "the feedback destination link was
  activated" — it does NOT confirm the destination tab actually rendered,
  loaded, or that the learner did anything there (see `SendFeedback.tsx`).
  An earlier version gated this on `window.open()`'s return value, which
  is not a reliable cross-browser success signal; this was replaced with a
  normal link + click handler, which fires exactly on user activation and
  nothing else. Only appears at all when `VITE_FEEDBACK_URL` is configured.
- `feedback_submitted` — never actually fired as of this release: there is
  no in-app submission step (Send Feedback opens an external destination
  and the app has no way to know what, if anything, the learner did
  there) — firing it anyway would be a fabricated event with no real
  submission behind it.

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
5. For feedback: the external-link mechanism (set `VITE_FEEDBACK_URL`,
   Send Feedback opens it with route/build/screen query params attached)
   already works today for any destination that accepts a plain link — a
   Google Form, a GitHub issue template with prefilled query params, a
   Typeform, etc. Implementing `FeedbackProvider`
   (`src/lib/feedback/types.ts`) is only needed for a future in-app
   submission flow (posting directly to an API instead of opening a link);
   it is not required to make the current external-link mechanism work.
