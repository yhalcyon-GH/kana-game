import type { IntroGuideStepId } from './introGuide'

// The Hiragana/Katakana section replay button (Issue #46) is NOT a new
// standalone Guide — it replays exactly these two consecutive steps from
// the six-step Introduction (see introGuide.ts/introGuideContent.ts, added
// in PR #43), in order, reusing their existing slide/subtitle/audio
// verbatim. Both the Hiragana and Katakana pages share this one definition
// so neither hardcodes the step list itself.
export const KANA_INTRO_EXCERPT_STEP_IDS: IntroGuideStepId[] = ['intro.kanaSounds', 'intro.kanaUsage']
