# 2026-08-14 full-project review session

Full-project review/cleanup pass per the user's detailed overnight-work instructions (priorities: dev docs, project understanding, dead-code cleanup, extensible design, audio provider abstraction, future-content planning). AUTO mode; nothing risky was done without flagging it first.

## 完了 (Completed)

- **Full project investigation** — directory structure, stack, data model, game flow, audio system, tests, TODOs/FIXME (none found), stale references, dead code.
- **`CLAUDE.md`** (new, repo root) — comprehensive dev-facing doc: project purpose, stack, directory structure, data model + its invariants, game flow, audio system, how to add content, standing rules, known gaps.
- **`README.md`** rewritten — was mostly unmodified Vite template boilerplate plus one stale audio-credit section; now a short, accurate project README pointing to `CLAUDE.md`.
- **Dead code / stale content cleanup:**
  - Deleted `src/data/feedbackProsody.ts` — COEIROINK-specific prosody data with zero remaining imports (its only consumer, the old COEIROINK feedback-audio script, was deleted in a previous session).
  - Deleted `read.me` (lowercase) — a one-line stray file from very early in the project's history, superseded by `README.md`.
  - Fixed a comment in `words.ts` referencing a nonexistent `scripts/validateCurriculum.ts` — the actual validation lives in `src/data/curriculum.test.ts`.
  - Fixed `AboutPage.tsx`'s audio credit section, which still named COEIROINK:MANA and Tsukuyomi-chan — both were replaced by ElevenLabs voices in a prior session, but the in-app credits page was never updated.
- **Audio provider abstraction** (`src/audio/`) — `SpeechProvider` interface + `StaticFileProvider` + `WebSpeechProvider`, with `useTTS.ts` rewritten as a thin orchestrator. Game code's `speak(key, fallbackText)` call signature is unchanged, so no route/component code needed to change. Full details: `docs/audio-provider-interface.md`.
- **Automated test coverage added** (41 new tests, 76 → 117 total): `answerCloseness.test.ts`, `distractorPicker.test.ts`, `feedbackVoice.test.ts`, `useCurriculum.test.ts`, `audio/staticFileProvider.test.ts`, `audio/webSpeechProvider.test.ts` — these were the logic modules with no prior coverage.
- **Design proposals written** (not implemented — see 保留): `docs/curriculum-extensibility.md` (katakana/sokuon/chōon/yōon/特殊音 data model), `docs/ui-ux-review.md`.
- **Verification**: `npm run build`, `npm test` (117/117 passing), `npx oxlint` (clean) all pass after every change, not just at the end. Dev-server smoke check confirmed all 11 routes return 200 and audio files under `public/audio/` are served correctly.

## 保留 (Held — needs your decision, not implemented)

### 1. Curriculum data-model migration for katakana/sokuon/chōon/yōon/特殊音
**Update:** the design questions below were resolved directly with the user in conversation after this report was first drafted — see `docs/curriculum-extensibility.md` for the final, fully-decided design (特殊音 = extended katakana loanword combos; nested `/practice/:categoryId/:lessonId` routing; a `character-set` vs. `contrast-pairs` Learn/Practice split, with 促音/長音 using word-contrast Learn + no Kana Quiz, and 拗音/特殊音/カタカナ using the existing per-character flow unchanged; 長音-style zero-new-character lessons never show a 🌟 mastered badge, only taught). **Implementation itself remains intentionally not started** — the user explicitly chose to stop at the design stage for tonight (it's a large, multi-file, URL-breaking change best done as its own focused session).

### 2. Stale locked git worktree
`.claude/worktrees/agent-a17eff6189bcc45be` is a leftover from an earlier failed agent spawn (unrelated to tonight's work). It's clean (no uncommitted changes — verified) but its lock is still held by a live process, PID 13748 (`claude.exe`). I don't know whether that's a genuinely orphaned process from earlier in this long-running session or something still active, and force-removing a locked worktree tied to a live PID is exactly the kind of ambiguous, hard-to-reverse action the instructions said to hold rather than guess on.
**Recommendation:** check whether PID 13748 is still doing anything; if not, `git worktree remove --force --force .claude/worktrees/agent-a17eff6189bcc45be` is safe (no work would be lost).

## 要確認 (Needs your input)

None remaining from tonight's curriculum design discussion — all three questions were answered directly (see 保留 §1 above and `docs/curriculum-extensibility.md`). Only the stale-worktree/PID 13748 question (保留 §2) is still open.

## 発見した問題 (Problems found)

- `AboutPage.tsx` had stale audio credits (COEIROINK:MANA, Tsukuyomi-chan) two sessions after both were replaced — **fixed**.
- `words.ts` had a comment pointing at a script that never existed under that name (`scripts/validateCurriculum.ts`) — the real validation is `curriculum.test.ts` — **fixed**.
- `src/data/feedbackProsody.ts` was fully orphaned dead code — **fixed** (deleted).
- Pitch-accent rendering (`WordCard.tsx`'s `AccentedKana`, and `accents.ts`'s own header comment) explicitly assumes one kana glyph = one mora = one accent position. This is currently true (no yōon content exists) but **will break the moment a yōon word is added** — flagged in `docs/curriculum-extensibility.md`, not fixed tonight since there's nothing to fix yet (no yōon content exists to test against).
- `.oxlintrc.json` runs untyped lint rules only — type-aware linting (`oxlint-tsgolint`) isn't wired in, so lint won't catch everything `tsc` would. Noted in `CLAUDE.md`; not changed (adding a new lint dependency/config felt outside tonight's scope, flagging for awareness rather than deciding for you).
- The stale worktree/live-PID situation above.

## テスト結果 (Test results)

- `npm run build` (`tsc -b && vite build`): clean, no errors, at every checkpoint during the session.
- `npm test` (vitest): **117/117 passing** (76 pre-existing + 41 new).
- `npx oxlint`: clean, no warnings or errors.
- Dev-server smoke check: all 11 routes (`/`, `/learn/a-row`, `/practice/a-row`, all 4 mini-games, `/practice/a-row/tracing`, `/review`, `/settings`, `/about`) return 200; spot-checked audio files (`characters/ka.wav`, `words/a-ai.wav`, `feedback/seikai.wav`) all serve correctly.
- **Not done**: an actual interactive playtest (answering questions, checking correct/incorrect feedback rendering, listening to audio) — no browser automation tool is available in this environment. Everything above is verified by build/test/lint plus careful code reading, not by clicking through the app. Recommend a manual playthrough when convenient, especially given the audio-related changes.

## 変更したファイル (Changed files)

| File | Why |
|---|---|
| `README.md` | Rewritten — was Vite template boilerplate + stale audio credits |
| `read.me` (deleted) | Stray one-line leftover file, superseded by README.md |
| `src/data/feedbackProsody.ts` (deleted) | Orphaned dead code, zero remaining references |
| `src/data/words.ts` | Fixed comment pointing at a nonexistent script |
| `src/hooks/useTTS.ts` | Rewritten to delegate to the new `SpeechProvider` abstraction — external API unchanged |
| `src/routes/AboutPage.tsx` | Fixed stale COEIROINK/Tsukuyomi-chan audio credits |
| `CLAUDE.md` (new) | Primary dev-facing documentation |
| `docs/` (new) | Design proposals + this report |
| `src/audio/` (new) | `SpeechProvider` interface, `StaticFileProvider`, `WebSpeechProvider` |
| `src/hooks/useCurriculum.test.ts`, `src/lib/answerCloseness.test.ts`, `src/lib/distractorPicker.test.ts`, `src/lib/feedbackVoice.test.ts` (new) | Test coverage for previously-untested logic |

## 削除したファイル (Deleted files)

- `read.me` — stray leftover, content was a one-line note superseded by the real README.
- `src/data/feedbackProsody.ts` — dead code, no imports anywhere in the codebase (confirmed via grep before deleting).

## 音声システム (Audio system)

See `docs/audio-provider-interface.md` for the full writeup. Summary: audio playback is now behind a `SpeechProvider` interface (`src/audio/types.ts`), with `StaticFileProvider` (today's real provider — plays pre-generated clips under `public/audio/`) and `WebSpeechProvider` (browser fallback) as the two implementations, orchestrated by `useTTS.ts`. Game code's call signature (`speak(key, fallbackText)`) is unchanged. Swapping TTS vendors now means regenerating `public/audio/`'s files, not touching game logic; adding a genuinely new provider (live synthesis, per-language routing) means writing one new class, not editing the hook that every screen calls into.

## 学習カテゴリー (Learning categories — foundation for future content)

**Design fully decided, not implemented.** `docs/curriculum-extensibility.md` was refined through direct back-and-forth after the design questions were first raised, and every open question now has a confirmed answer: a `ScriptCategory` (hiragana/katakana/sokuon/chōon/yōon/特殊音) sitting above today's `GojuonRow`-shaped lessons, split into two Learn/Practice styles rather than the initial "character-set vs. concept" guess —
- **`character-set`** (拗音, 特殊音, カタカナ): identical to today's hiragana flow, unchanged.
- **`contrast-pairs`** (促音, 長音): Learn listens to minimal-pair words (おと/おっと, おばさん/おばあさん, ビル/ビール) instead of flashcarding a new character; Tracing is word-level only; Practice drops Kana Quiz (doesn't fit a duration/rhythm rule) but keeps Listening/Kana Typing/Word Builder.

Also decided: 長音-style lessons with zero new characters of their own never show a 🌟 mastered badge (taught-once is their only completion signal); routes will nest under category (`/practice/:categoryId/:lessonId/...`), a deliberate breaking change to existing hiragana URLs chosen for long-term clarity. The one real landmine still flagged, not fixed (nothing to fix yet): pitch-accent rendering assumes one kana glyph = one mora, which yōon (りゃ) will break — needs addressing before yōon content is written, not after.

**Implementation was explicitly deferred** — the user chose to stop at the design stage tonight rather than start the (large, URL-breaking) migration, to be picked up as its own focused session.

## 次にやること (Next priorities)

1. Answer the three 要確認 questions above, then implement the curriculum-extensibility migration as its own focused session.
2. A real interactive playtest (this session's biggest verification gap — no browser tool available here).
3. Decide on the stale worktree/PID 13748 situation.
4. Once categories exist, revisit `docs/ui-ux-review.md`'s "phoneme-set vs. concept lesson" visual distinction on the home/hub screens.
5. Consider wiring in type-aware oxlint rules (`oxlint-tsgolint`) — currently only untyped rules run.

## 重要な変更 (Notable changes to existing behavior)

- **`AboutPage.tsx`'s audio credits changed** from crediting COEIROINK:MANA/Tsukuyomi-chan to crediting ElevenLabs — this is a **factual correction** (the app has used ElevenLabs-only audio since a prior session; the credits page just hadn't been updated), not a new decision. No opinion or new claim was introduced — the replacement text is deliberately minimal and doesn't name specific voice IDs.
- **`useTTS.ts`'s internals were fully rewritten**, though its external behavior and API are intended to be identical (verified by build/lint/full test suite, and by every calling component being unchanged). Flagging this because it's the most consequential single-file change tonight — please do listen to audio in the app at least once to confirm nothing sounds different, since I can't hear it myself.

---

Nothing in this session's changes has been committed — everything above is sitting as uncommitted working-tree changes, per this repo's standing "only commit when explicitly asked" rule.
