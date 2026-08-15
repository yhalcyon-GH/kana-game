# docs/

Reference material and design proposals — not everyday reading. See [CLAUDE.md](../CLAUDE.md) at the repo root for day-to-day development guidance.

- **[audio-provider-interface.md](./audio-provider-interface.md)** — the `SpeechProvider` abstraction in `src/audio/` (implemented). How audio playback is decoupled from any specific TTS vendor.
- **[curriculum-extensibility.md](./curriculum-extensibility.md)** — proposal (not implemented) for extending the curriculum data model to katakana, sokuon, chōon, yōon, and 特殊音. Contains open questions that need an answer before implementation starts.
- **[ui-ux-review.md](./ui-ux-review.md)** — review notes on current UI/UX and forward-looking concerns for when new lesson categories land. Proposals only, no changes made.
- **[2026-08-14-review-session.md](./2026-08-14-review-session.md)** — end-of-session report from the full-project review/cleanup pass this directory was created during.
- **[2026-08-15-voice-quality-check-design.md](./2026-08-15-voice-quality-check-design.md)** — design (approved, implemented in Phase 1) for automated Japanese voice-quality checking (mispronunciation detection via local ASR, PASS/WARNING/FAIL workflow). F0/accent analysis and a dev review screen are deferred future phases.
