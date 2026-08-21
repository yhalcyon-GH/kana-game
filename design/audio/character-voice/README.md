# Tamamizu feedback-voice provenance

Source material for the per-answer and result-screen feedback lines shipped at `public/audio/feedback/<id>.wav` (see `src/data/feedback.ts`/`src/lib/feedbackVoice.ts`).

- **`feedback-voices-v3/`** — the current take for all 10 per-answer lines (`correct_iine`, `correct_seikai`, `correct_sonochoushi`, `wrong_oshii`, `wrong_ganbare`, `wrong_daijoubu`, `streak_5_sugoi`, `streak_8_kanpeki`, `streak_10_saikou`, `streak_15_perfect`) — replaced all of v1/v2's contributions to these at once (2026-08-20). Also included two lines not currently used anywhere (`wrong_ganbatte` 頑張って！, `wrong_fight` ファイト！) — kept here for provenance in case the wrong-answer pool is ever expanded, but not wired in.
- **`feedback-voices-v1-original.zip`** — the first feedback-voice design's original recordings. No longer the source for any currently-live line (its remaining 3 — `wrong_ganbare`/`wrong_daijoubu`/`streak_15_perfect` — were replaced by v3 above).
- **`feedback-voices-v2/`** — a second design iteration's recordings and spec. No longer the source for any currently-live line either, for the same reason. `correct_kakkoii`/`wrong_donmai`/`wrong_ganbatte`/`wrong_zannen` (never live — part of v2's own since-reverted pool design) were already moved to `Desktop/Dust/unused-feedback-voices/`.
- **`result-screen-spec/`** — the result-evaluation-screen spec doc and `eval_faito.mp3` (ファイト, still live — the one result-screen line without a reused/existing recording).
- **`tamamizu-feedback-take1.mp3`** — an early (2026-08-14) standalone voice sample, predating the per-answer feedback redesign. Not tied to any current line id.

The pre-v3 takes for the 10 lines above (2026-08-20 job) are in `Desktop/Dust/old-tamamizu-feedback-voices/` if still there, or git history otherwise.
