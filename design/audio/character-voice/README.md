# Tamamizu feedback-voice provenance

Source material for the per-answer and result-screen feedback lines shipped at `public/audio/feedback/<id>.wav` (see `src/data/feedback.ts`/`src/lib/feedbackVoice.ts`).

- **`feedback-voices-v1-original.zip`** — the first feedback-voice design's original recordings. Still the only source for 3 currently-live lines: `wrong_ganbare` (頑張れ！), `wrong_daijoubu` (大丈夫！), `streak_15_perfect` (パーフェクト！).
- **`feedback-voices-v2/`** — a second design iteration's recordings and spec. `correct_iine`, `correct_seikai`, `streak_5_sugoi`, `streak_8_kanpeki`, `streak_10_saikou`, `wrong_oshii`, and `correct_sonochoushi` are currently live (the v2 pool/milestone design itself was reverted back to v1's shape, but several individual recordings from this batch were kept as the current take for their line). `correct_kakkoii`/`wrong_donmai`/`wrong_ganbatte`/`wrong_zannen` were part of v2's own wrong/correct pools, which are no longer used — moved to `Desktop/Dust/unused-feedback-voices/`.
- **`result-screen-spec/`** — the result-evaluation-screen spec doc and `eval_faito.mp3` (ファイト, still live — the one result-screen line without a reused/existing recording).
- **`tamamizu-feedback-take1.mp3`** — an early (2026-08-14) standalone voice sample, predating the per-answer feedback redesign. Not tied to any current line id.
