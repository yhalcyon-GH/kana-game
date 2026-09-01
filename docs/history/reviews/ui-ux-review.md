# UI/UX review

**Status: review notes only. No UI changes were made based on this — per the review's own safety rules, UI changes big enough to matter go through you first.** This is a code-review-based assessment (reading every route/component), not a live playtest — I don't have browser automation in this environment, so anything about how something *feels* to actually use is a real limitation of this review; treat the "not too difficult" assessment especially as provisional.

## Current state, by question

**今どの学習をしているのか分かるか (is it clear what you're currently learning)** — Reasonably clear at the page level: `PracticeHubPage` titles itself with the row's label (e.g. "か~こ・が~ご"), each mini-game shows `GameRoundHeader`'s "Round X / Y", and `LearnPage` shows step progress ("2 / 5"). What's missing is a **persistent breadcrumb** above that — nothing on a mini-game screen says "you're in か-row's Kana Quiz" at a glance without reading the page title. This is fine today with one flat category, but gets more important once category (hiragana/katakana/concept lessons) becomes a real dimension — see below.

**次に何をすればいいか分かるか (is it clear what to do next)** — Yes: every screen has a clearly primary action (Next/Check/Play again), and `PracticeHubPage`'s two labeled sections (Learn / Practice) with emoji + short descriptions on each card are a good pattern already worth reusing for future categories.

**戻る操作が分かるか (is "back" discoverable)** — Yes, consistently: `BackToHubLink` appears on every mini-game and Tracing screen, `PracticeSummary`'s "Back to hub" button, and `NavBar`'s persistent top nav. No gaps found here.

**難しすぎないか (not too difficult)** — Can't fully assess without playing it live (see caveat above). From reading the logic: distractor pools are 3-4 choices, the Leitner box system is deliberately gentler than classic Leitner (drop one box on a miss, not to zero — see `srs.ts`'s own comment), and near-miss detection (`answerCloseness.ts`) means a one-character typo still gets an encouraging "so close" rather than a flat wrong. Nothing in the logic reads as harsh. Recommend an actual playtest pass when you have a moment, since this is fundamentally a feel judgment, not something code review settles.

**カテゴリー構造が分かりやすいか (is the category structure clear)** — There's only one category today (hiragana), so this can't really be assessed yet — but it's the most important one to get right *before* katakana/sokuon/etc. exist, not after. See "Forward-looking concerns" below.

**ひらがなとカタカナの区別が分かりやすいか (hiragana vs. katakana distinction)** — N/A, katakana doesn't exist yet. Flagging now because the *character id* scheme matters here: today's ids are bare romaji (`'ka'`, `'shi'`, ...). Katakana characters will need distinct ids (`'ka-katakana'`? a `script` prefix? a separate id space entirely?) or they'll collide with the existing hiragana ids in `CHARACTERS_BY_ID`, `progressStore.characters`, and audio file paths (`public/audio/characters/ka.wav` already means hiragana か). This is a real decision, not just a naming nitpick — see `docs/curriculum-extensibility.md`.

**促音・長音・拗音などを追加しても混乱しないか (won't new categories be confusing)** — Current risk: `HomePage`'s `RowMap` renders every row as an identical-looking card in one flat grid. If sokuon/chōon/yōon/tokushuon just become more cards in that same grid, a learner has no visual cue that these behave differently (a single concept explanation, not a "flashcard through 5 new characters" flow like every existing card). Recommend visually separating "phoneme rows" from "concept lessons" (a labeled section, like Practice Hub already does for Learn vs. Practice) once that content exists — but this is a UI structure change, so it's listed as a proposal, not made.

## Forward-looking concerns (proposals, not changes)

1. **Add a breadcrumb or category label once more than one category exists.** Low effort, meaningfully helps orientation as content grows. Doesn't need to happen before katakana exists, but should land alongside it.
2. **Separate "phoneme-set" and "concept" lessons visually on the row-map/hub screens** once sokuon-style content exists — see above.
3. **Character id namespacing for katakana** needs deciding before any katakana data is written, not discovered mid-implementation — see `docs/curriculum-extensibility.md`'s open questions.

None of these are acted on in this session — they're specifically the "if it needs a bigger UI decision, write it down and ask" case the review instructions called for.
