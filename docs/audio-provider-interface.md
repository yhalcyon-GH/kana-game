# Audio provider interface

**Status: implemented** (2026-08-14 review session). This describes what's actually in `src/audio/` and `src/hooks/useTTS.ts` today, not a proposal.

## Why

Audio has already changed provider twice (COEIROINK → ElevenLabs, and within ElevenLabs, from one voice to two role-separated voices) over the life of this project. Before this change, `useTTS.ts` did everything itself: built the static-file URL, owned the `<audio>` element, read playback settings, *and* implemented the Web Speech fallback, all in one hook. That was fine when there was only ever one provider, but every future swap (a different TTS vendor, a live-synthesis backend, per-language voice routing) would have meant editing that one hook's internals directly, with no seam to test the two behaviors independently.

## Shape

```
Game code (components/routes)
        │  speak(key, fallbackText)
        ▼
useTTS()                              — orchestrator: reads Settings (volume/
        │                                speed/enabled) from progressStore,
        │                                tries providers in order, never
        │                                talks to a vendor/file format itself
        ▼
SpeechProvider (interface, src/audio/types.ts)
   ├── StaticFileProvider              — plays public/audio/<key>.wav
   └── WebSpeechProvider               — browser Web Speech API fallback
```

- **`src/audio/types.ts`** — the `SpeechProvider` interface (`speak(request, options): Promise<void>`) and the two small value types it takes: `SpeechRequest` (`key` + `text`) and `SpeechPlaybackOptions` (`volume` + `rate`). Game code never sees these directly — only `useTTS()`'s `speak(audioKey, fallbackText)` does, which is unchanged from before this refactor.
- **`src/audio/staticFileProvider.ts`** — today's real, primary provider. Resolves `key` to `public/audio/<key>.wav` and plays it. Knows nothing about which TTS vendor produced the file.
- **`src/audio/webSpeechProvider.ts`** — last-resort fallback via the browser's built-in Web Speech API, used only when the static provider rejects (missing file, network error, decode failure).
- **`src/hooks/useTTS.ts`** — the only thing game code imports. Chains the two providers (`staticProvider.speak(...).catch(() => webSpeechProvider.speak(...))`), and is where Settings-driven playback options (volume/speed) and the `audioEnabled` gate live.

## What this buys

- **Swapping the primary TTS vendor** (regenerating `public/audio/` with a different provider's output) needs **zero code changes** — `StaticFileProvider` doesn't know or care who made the `.wav` files.
- **Adding a genuinely new provider** (a live-synthesis API, a per-language voice router for the planned multi-language explainer videos) means writing one new class implementing `SpeechProvider` and changing the one or two lines in `useTTS.ts` that decide provider order — not touching any of `src/routes` or `src/components`.
- **Each provider is now independently unit-testable** (`src/audio/staticFileProvider.test.ts`, `webSpeechProvider.test.ts`) without needing a full component render.

## What this does NOT do (deliberately, per "don't build ahead of need")

- No voice-ID/multi-voice routing table, no per-language provider selection, no runtime provider switching UI. The two ElevenLabs voices in use today (narrator vs. Tamamizu) are still selected at *generation time* (which script/voice_id produced which files under `public/audio/`), not at playback time — `useTTS()` has no concept of "voice," only "which pre-generated clip." If/when live multi-language synthesis is actually needed, that's a new provider implementation, not a change to this interface.
- No audio caching layer beyond the browser's own HTTP cache + the PWA's `CacheFirst` runtime caching (already configured in `vite.config.ts` for everything under `/audio/`) — a dedicated in-app cache wasn't a stated need and would be speculative.

## Adding a provider

1. Implement `SpeechProvider` (one `speak(request, options): Promise<void>` method; reject — don't throw synchronously — on any failure so the caller can fall back).
2. Instantiate it in `useTTS.ts` (via the existing `useState(() => new ...)` lazy-init pattern) and add it to the `.catch()` chain in whatever priority order makes sense.
3. Write a focused unit test for the class alone, following `staticFileProvider.test.ts`'s pattern (mock `HTMLMediaElement.prototype.play` if it touches `<audio>`, or stub the relevant browser API otherwise).
