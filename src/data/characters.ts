import type { KanaChar } from './types'

// All 71 hiragana characters used in the MVP: 46 base (gojuon, incl. ん,
// excl. obsolete ゐ/ゑ) + 20 dakuten + 5 handakuten. Dakuten/handakuten
// characters are grouped under the same rowId as their base row, since the
// curriculum teaches them together (see curriculum.ts).
export const CHARACTERS: KanaChar[] = [
  // ===== ひらがな (hiragana) =====
  // あ行
  { id: 'a', kana: 'あ', romaji: 'a', rowId: 'a-row', type: 'base' },
  { id: 'i', kana: 'い', romaji: 'i', rowId: 'a-row', type: 'base' },
  { id: 'u', kana: 'う', romaji: 'u', rowId: 'a-row', type: 'base' },
  { id: 'e', kana: 'え', romaji: 'e', rowId: 'a-row', type: 'base' },
  { id: 'o', kana: 'お', romaji: 'o', rowId: 'a-row', type: 'base' },

  // か行
  { id: 'ka', kana: 'か', romaji: 'ka', rowId: 'ka-row', type: 'base' },
  { id: 'ki', kana: 'き', romaji: 'ki', rowId: 'ka-row', type: 'base' },
  { id: 'ku', kana: 'く', romaji: 'ku', rowId: 'ka-row', type: 'base' },
  { id: 'ke', kana: 'け', romaji: 'ke', rowId: 'ka-row', type: 'base' },
  { id: 'ko', kana: 'こ', romaji: 'ko', rowId: 'ka-row', type: 'base' },
  // が行 (taught together with か行)
  { id: 'ga', kana: 'が', romaji: 'ga', rowId: 'ka-row', type: 'dakuten' },
  { id: 'gi', kana: 'ぎ', romaji: 'gi', rowId: 'ka-row', type: 'dakuten' },
  { id: 'gu', kana: 'ぐ', romaji: 'gu', rowId: 'ka-row', type: 'dakuten' },
  { id: 'ge', kana: 'げ', romaji: 'ge', rowId: 'ka-row', type: 'dakuten' },
  { id: 'go', kana: 'ご', romaji: 'go', rowId: 'ka-row', type: 'dakuten' },

  // さ行
  { id: 'sa', kana: 'さ', romaji: 'sa', rowId: 'sa-row', type: 'base' },
  { id: 'shi', kana: 'し', romaji: 'shi', rowId: 'sa-row', type: 'base' },
  { id: 'su', kana: 'す', romaji: 'su', rowId: 'sa-row', type: 'base' },
  { id: 'se', kana: 'せ', romaji: 'se', rowId: 'sa-row', type: 'base' },
  { id: 'so', kana: 'そ', romaji: 'so', rowId: 'sa-row', type: 'base' },
  // ざ行 (taught together with さ行)
  { id: 'za', kana: 'ざ', romaji: 'za', rowId: 'sa-row', type: 'dakuten' },
  { id: 'ji', kana: 'じ', romaji: 'ji', rowId: 'sa-row', type: 'dakuten' },
  { id: 'zu', kana: 'ず', romaji: 'zu', rowId: 'sa-row', type: 'dakuten' },
  { id: 'ze', kana: 'ぜ', romaji: 'ze', rowId: 'sa-row', type: 'dakuten' },
  { id: 'zo', kana: 'ぞ', romaji: 'zo', rowId: 'sa-row', type: 'dakuten' },

  // た行
  { id: 'ta', kana: 'た', romaji: 'ta', rowId: 'ta-row', type: 'base' },
  { id: 'chi', kana: 'ち', romaji: 'chi', rowId: 'ta-row', type: 'base' },
  { id: 'tsu', kana: 'つ', romaji: 'tsu', rowId: 'ta-row', type: 'base' },
  { id: 'te', kana: 'て', romaji: 'te', rowId: 'ta-row', type: 'base' },
  { id: 'to', kana: 'と', romaji: 'to', rowId: 'ta-row', type: 'base' },
  // だ行 (taught together with た行). ぢ/づ are romanized the same as じ/ず
  // in modern Hepburn, so ids are disambiguated ('dji'/'dzu') while the
  // displayed romaji stays 'ji'/'zu'.
  { id: 'da', kana: 'だ', romaji: 'da', rowId: 'ta-row', type: 'dakuten' },
  { id: 'dji', kana: 'ぢ', romaji: 'ji', rowId: 'ta-row', type: 'dakuten' },
  { id: 'dzu', kana: 'づ', romaji: 'zu', rowId: 'ta-row', type: 'dakuten' },
  { id: 'de', kana: 'で', romaji: 'de', rowId: 'ta-row', type: 'dakuten' },
  { id: 'do', kana: 'ど', romaji: 'do', rowId: 'ta-row', type: 'dakuten' },

  // な行 (no dakuten)
  { id: 'na', kana: 'な', romaji: 'na', rowId: 'na-row', type: 'base' },
  { id: 'ni', kana: 'に', romaji: 'ni', rowId: 'na-row', type: 'base' },
  { id: 'nu', kana: 'ぬ', romaji: 'nu', rowId: 'na-row', type: 'base' },
  { id: 'ne', kana: 'ね', romaji: 'ne', rowId: 'na-row', type: 'base' },
  { id: 'no', kana: 'の', romaji: 'no', rowId: 'na-row', type: 'base' },

  // は行
  { id: 'ha', kana: 'は', romaji: 'ha', rowId: 'ha-row', type: 'base' },
  { id: 'hi', kana: 'ひ', romaji: 'hi', rowId: 'ha-row', type: 'base' },
  { id: 'fu', kana: 'ふ', romaji: 'fu', rowId: 'ha-row', type: 'base' },
  { id: 'he', kana: 'へ', romaji: 'he', rowId: 'ha-row', type: 'base' },
  { id: 'ho', kana: 'ほ', romaji: 'ho', rowId: 'ha-row', type: 'base' },
  // ば行 + ぱ行 (both taught together with は行)
  { id: 'ba', kana: 'ば', romaji: 'ba', rowId: 'ha-row', type: 'dakuten' },
  { id: 'bi', kana: 'び', romaji: 'bi', rowId: 'ha-row', type: 'dakuten' },
  { id: 'bu', kana: 'ぶ', romaji: 'bu', rowId: 'ha-row', type: 'dakuten' },
  { id: 'be', kana: 'べ', romaji: 'be', rowId: 'ha-row', type: 'dakuten' },
  { id: 'bo', kana: 'ぼ', romaji: 'bo', rowId: 'ha-row', type: 'dakuten' },
  { id: 'pa', kana: 'ぱ', romaji: 'pa', rowId: 'ha-row', type: 'handakuten' },
  { id: 'pi', kana: 'ぴ', romaji: 'pi', rowId: 'ha-row', type: 'handakuten' },
  { id: 'pu', kana: 'ぷ', romaji: 'pu', rowId: 'ha-row', type: 'handakuten' },
  { id: 'pe', kana: 'ぺ', romaji: 'pe', rowId: 'ha-row', type: 'handakuten' },
  { id: 'po', kana: 'ぽ', romaji: 'po', rowId: 'ha-row', type: 'handakuten' },

  // ま行 (no dakuten)
  { id: 'ma', kana: 'ま', romaji: 'ma', rowId: 'ma-row', type: 'base' },
  { id: 'mi', kana: 'み', romaji: 'mi', rowId: 'ma-row', type: 'base' },
  { id: 'mu', kana: 'む', romaji: 'mu', rowId: 'ma-row', type: 'base' },
  { id: 'me', kana: 'め', romaji: 'me', rowId: 'ma-row', type: 'base' },
  { id: 'mo', kana: 'も', romaji: 'mo', rowId: 'ma-row', type: 'base' },

  // や行 (3 characters only, no dakuten)
  { id: 'ya', kana: 'や', romaji: 'ya', rowId: 'ya-row', type: 'base' },
  { id: 'yu', kana: 'ゆ', romaji: 'yu', rowId: 'ya-row', type: 'base' },
  { id: 'yo', kana: 'よ', romaji: 'yo', rowId: 'ya-row', type: 'base' },

  // ら行 (no dakuten)
  { id: 'ra', kana: 'ら', romaji: 'ra', rowId: 'ra-row', type: 'base' },
  { id: 'ri', kana: 'り', romaji: 'ri', rowId: 'ra-row', type: 'base' },
  { id: 'ru', kana: 'る', romaji: 'ru', rowId: 'ra-row', type: 'base' },
  { id: 're', kana: 'れ', romaji: 're', rowId: 'ra-row', type: 'base' },
  { id: 'ro', kana: 'ろ', romaji: 'ro', rowId: 'ra-row', type: 'base' },

  // わ行 + ん (final row, no dakuten)
  { id: 'wa', kana: 'わ', romaji: 'wa', rowId: 'wa-row', type: 'base' },
  { id: 'wo', kana: 'を', romaji: 'wo', rowId: 'wa-row', type: 'base' },
  { id: 'n', kana: 'ん', romaji: 'n', rowId: 'wa-row', type: 'base' },

  // ===== カタカナ (katakana) =====
  // Same 71-character set as hiragana (46 base + 20 dakuten + 5 handakuten),
  // plus ー (chōon/long-vowel mark) as one extra character — see
  // docs/curriculum-extensibility.md. All ids are 'katakana-' prefixed
  // since they'd otherwise collide with the hiragana ids above (both
  // scripts share the same romaji, e.g. hiragana 'ka' vs katakana 'ka').
  // ア行
  { id: 'katakana-a', kana: 'ア', romaji: 'a', rowId: 'katakana-a-row', type: 'base' },
  { id: 'katakana-i', kana: 'イ', romaji: 'i', rowId: 'katakana-a-row', type: 'base' },
  { id: 'katakana-u', kana: 'ウ', romaji: 'u', rowId: 'katakana-a-row', type: 'base' },
  { id: 'katakana-e', kana: 'エ', romaji: 'e', rowId: 'katakana-a-row', type: 'base' },
  { id: 'katakana-o', kana: 'オ', romaji: 'o', rowId: 'katakana-a-row', type: 'base' },

  // カ行
  { id: 'katakana-ka', kana: 'カ', romaji: 'ka', rowId: 'katakana-ka-row', type: 'base' },
  { id: 'katakana-ki', kana: 'キ', romaji: 'ki', rowId: 'katakana-ka-row', type: 'base' },
  { id: 'katakana-ku', kana: 'ク', romaji: 'ku', rowId: 'katakana-ka-row', type: 'base' },
  { id: 'katakana-ke', kana: 'ケ', romaji: 'ke', rowId: 'katakana-ka-row', type: 'base' },
  { id: 'katakana-ko', kana: 'コ', romaji: 'ko', rowId: 'katakana-ka-row', type: 'base' },
  // ガ行 (taught together with カ行)
  { id: 'katakana-ga', kana: 'ガ', romaji: 'ga', rowId: 'katakana-ka-row', type: 'dakuten' },
  { id: 'katakana-gi', kana: 'ギ', romaji: 'gi', rowId: 'katakana-ka-row', type: 'dakuten' },
  { id: 'katakana-gu', kana: 'グ', romaji: 'gu', rowId: 'katakana-ka-row', type: 'dakuten' },
  { id: 'katakana-ge', kana: 'ゲ', romaji: 'ge', rowId: 'katakana-ka-row', type: 'dakuten' },
  { id: 'katakana-go', kana: 'ゴ', romaji: 'go', rowId: 'katakana-ka-row', type: 'dakuten' },

  // サ行
  { id: 'katakana-sa', kana: 'サ', romaji: 'sa', rowId: 'katakana-sa-row', type: 'base' },
  { id: 'katakana-shi', kana: 'シ', romaji: 'shi', rowId: 'katakana-sa-row', type: 'base' },
  { id: 'katakana-su', kana: 'ス', romaji: 'su', rowId: 'katakana-sa-row', type: 'base' },
  { id: 'katakana-se', kana: 'セ', romaji: 'se', rowId: 'katakana-sa-row', type: 'base' },
  { id: 'katakana-so', kana: 'ソ', romaji: 'so', rowId: 'katakana-sa-row', type: 'base' },
  // ザ行 (taught together with サ行)
  { id: 'katakana-za', kana: 'ザ', romaji: 'za', rowId: 'katakana-sa-row', type: 'dakuten' },
  { id: 'katakana-ji', kana: 'ジ', romaji: 'ji', rowId: 'katakana-sa-row', type: 'dakuten' },
  { id: 'katakana-zu', kana: 'ズ', romaji: 'zu', rowId: 'katakana-sa-row', type: 'dakuten' },
  { id: 'katakana-ze', kana: 'ゼ', romaji: 'ze', rowId: 'katakana-sa-row', type: 'dakuten' },
  { id: 'katakana-zo', kana: 'ゾ', romaji: 'zo', rowId: 'katakana-sa-row', type: 'dakuten' },

  // タ行
  { id: 'katakana-ta', kana: 'タ', romaji: 'ta', rowId: 'katakana-ta-row', type: 'base' },
  { id: 'katakana-chi', kana: 'チ', romaji: 'chi', rowId: 'katakana-ta-row', type: 'base' },
  { id: 'katakana-tsu', kana: 'ツ', romaji: 'tsu', rowId: 'katakana-ta-row', type: 'base' },
  { id: 'katakana-te', kana: 'テ', romaji: 'te', rowId: 'katakana-ta-row', type: 'base' },
  { id: 'katakana-to', kana: 'ト', romaji: 'to', rowId: 'katakana-ta-row', type: 'base' },
  // ダ行 (taught together with タ行). ヂ/ヅ mirror hiragana's ぢ/づ id
  // disambiguation ('dji'/'dzu') — see characters.ts's hiragana section.
  { id: 'katakana-da', kana: 'ダ', romaji: 'da', rowId: 'katakana-ta-row', type: 'dakuten' },
  { id: 'katakana-dji', kana: 'ヂ', romaji: 'ji', rowId: 'katakana-ta-row', type: 'dakuten' },
  { id: 'katakana-dzu', kana: 'ヅ', romaji: 'zu', rowId: 'katakana-ta-row', type: 'dakuten' },
  { id: 'katakana-de', kana: 'デ', romaji: 'de', rowId: 'katakana-ta-row', type: 'dakuten' },
  { id: 'katakana-do', kana: 'ド', romaji: 'do', rowId: 'katakana-ta-row', type: 'dakuten' },

  // ナ行 (no dakuten)
  { id: 'katakana-na', kana: 'ナ', romaji: 'na', rowId: 'katakana-na-row', type: 'base' },
  { id: 'katakana-ni', kana: 'ニ', romaji: 'ni', rowId: 'katakana-na-row', type: 'base' },
  { id: 'katakana-nu', kana: 'ヌ', romaji: 'nu', rowId: 'katakana-na-row', type: 'base' },
  { id: 'katakana-ne', kana: 'ネ', romaji: 'ne', rowId: 'katakana-na-row', type: 'base' },
  { id: 'katakana-no', kana: 'ノ', romaji: 'no', rowId: 'katakana-na-row', type: 'base' },

  // ハ行
  { id: 'katakana-ha', kana: 'ハ', romaji: 'ha', rowId: 'katakana-ha-row', type: 'base' },
  { id: 'katakana-hi', kana: 'ヒ', romaji: 'hi', rowId: 'katakana-ha-row', type: 'base' },
  { id: 'katakana-fu', kana: 'フ', romaji: 'fu', rowId: 'katakana-ha-row', type: 'base' },
  { id: 'katakana-he', kana: 'ヘ', romaji: 'he', rowId: 'katakana-ha-row', type: 'base' },
  { id: 'katakana-ho', kana: 'ホ', romaji: 'ho', rowId: 'katakana-ha-row', type: 'base' },
  // バ行 + パ行 (both taught together with ハ行)
  { id: 'katakana-ba', kana: 'バ', romaji: 'ba', rowId: 'katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-bi', kana: 'ビ', romaji: 'bi', rowId: 'katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-bu', kana: 'ブ', romaji: 'bu', rowId: 'katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-be', kana: 'ベ', romaji: 'be', rowId: 'katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-bo', kana: 'ボ', romaji: 'bo', rowId: 'katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-pa', kana: 'パ', romaji: 'pa', rowId: 'katakana-ha-row', type: 'handakuten' },
  { id: 'katakana-pi', kana: 'ピ', romaji: 'pi', rowId: 'katakana-ha-row', type: 'handakuten' },
  { id: 'katakana-pu', kana: 'プ', romaji: 'pu', rowId: 'katakana-ha-row', type: 'handakuten' },
  { id: 'katakana-pe', kana: 'ペ', romaji: 'pe', rowId: 'katakana-ha-row', type: 'handakuten' },
  { id: 'katakana-po', kana: 'ポ', romaji: 'po', rowId: 'katakana-ha-row', type: 'handakuten' },

  // マ行 (no dakuten)
  { id: 'katakana-ma', kana: 'マ', romaji: 'ma', rowId: 'katakana-ma-row', type: 'base' },
  { id: 'katakana-mi', kana: 'ミ', romaji: 'mi', rowId: 'katakana-ma-row', type: 'base' },
  { id: 'katakana-mu', kana: 'ム', romaji: 'mu', rowId: 'katakana-ma-row', type: 'base' },
  { id: 'katakana-me', kana: 'メ', romaji: 'me', rowId: 'katakana-ma-row', type: 'base' },
  { id: 'katakana-mo', kana: 'モ', romaji: 'mo', rowId: 'katakana-ma-row', type: 'base' },

  // ヤ行 (3 characters only, no dakuten)
  { id: 'katakana-ya', kana: 'ヤ', romaji: 'ya', rowId: 'katakana-ya-row', type: 'base' },
  { id: 'katakana-yu', kana: 'ユ', romaji: 'yu', rowId: 'katakana-ya-row', type: 'base' },
  { id: 'katakana-yo', kana: 'ヨ', romaji: 'yo', rowId: 'katakana-ya-row', type: 'base' },

  // ラ行 (no dakuten)
  { id: 'katakana-ra', kana: 'ラ', romaji: 'ra', rowId: 'katakana-ra-row', type: 'base' },
  { id: 'katakana-ri', kana: 'リ', romaji: 'ri', rowId: 'katakana-ra-row', type: 'base' },
  { id: 'katakana-ru', kana: 'ル', romaji: 'ru', rowId: 'katakana-ra-row', type: 'base' },
  { id: 'katakana-re', kana: 'レ', romaji: 're', rowId: 'katakana-ra-row', type: 'base' },
  { id: 'katakana-ro', kana: 'ロ', romaji: 'ro', rowId: 'katakana-ra-row', type: 'base' },

  // ワ行 + ン (no dakuten). ヲ is kept for structural completeness (see
  // words.ts's katakana-wa-row comment for why, unlike hiragana's を, it
  // gets no vocabulary/phrase reinforcement).
  { id: 'katakana-wa', kana: 'ワ', romaji: 'wa', rowId: 'katakana-wa-row', type: 'base' },
  { id: 'katakana-wo', kana: 'ヲ', romaji: 'wo', rowId: 'katakana-wa-row', type: 'base' },
  { id: 'katakana-n', kana: 'ン', romaji: 'n', rowId: 'katakana-wa-row', type: 'base' },

  // ー (chōon / long-vowel mark) — its own tiny final row. Not a mora of
  // its own; extends the preceding vowel sound (see words.ts's
  // katakana-chouon-row comment for how that's represented in romaji).
  // Romaji '-' is a placeholder reading, not a real pronunciation — see
  // final report / PR description for why this needs the user's sign-off.
  { id: 'katakana-chouon', kana: 'ー', romaji: '-', rowId: 'katakana-chouon-row', type: 'base' },

  // ===== 促音 (sokuon) =====
  // っ/ッ mark gemination — a held/doubled consonant, e.g. おと "oto" vs.
  // おっと "otto" — taught through contrast-pair vocabulary rather than a
  // flashcard step (see curriculum.ts's sokuon-row and
  // docs/curriculum-extensibility.md's 'contrast-pairs' learnStyle), but
  // they're still real characters needing a normal CHARACTERS entry (stroke
  // data, CONFUSABLE_PAIRS) like any other. `romaji: '-'` is a placeholder,
  // same convention as katakana-chouon above: っ/ッ's actual spoken
  // contribution is just doubling the FIRST LETTER of the following mora,
  // which varies per word (otto's t, gakkou's k, kippu's p, ...) and can't
  // be captured as one fixed string. Only this placeholder's LENGTH (1)
  // matters — see answerChecking.ts's romajiVariants, which walks a word's
  // characterIds in lockstep with its canonical romaji using each
  // character's romaji LENGTH for bookkeeping; a real typed answer is
  // checked directly against word.romaji first, so this placeholder is
  // never itself shown as "the" correct answer.
  { id: 'sokuon', kana: 'っ', romaji: '-', rowId: 'sokuon-row', type: 'base' },
  { id: 'katakana-sokuon', kana: 'ッ', romaji: '-', rowId: 'sokuon-row', type: 'base' },

  // ===== 拗音 (yōon) =====
  // The standard contracted-sound set: a base/dakuten/handakuten consonant
  // kana + a small ゃ/ゅ/ょ, spelling ONE mora with TWO glyphs (きゃ = "kya",
  // one syllable, two characters). `kana` is genuinely 2 characters long for
  // every entry here — this is the one real technical wrinkle in this
  // category, see WordCard.tsx's AccentedKana and its curriculum.test.ts/
  // App.test.tsx coverage, plus docs/curriculum-extensibility.md. `romaji`
  // is a real, full 3-letter reading (not a placeholder like sokuon/chōon
  // above) since a yōon mora DOES have one fixed, unambiguous pronunciation
  // regardless of context — answerChecking.ts's romajiVariants bookkeeping
  // already walks characterIds using each character's OWN romaji length, so
  // a 3-letter romaji on a 2-glyph character needs no special handling
  // there either. `type` follows the same base/dakuten/handakuten
  // convention as the row it contracts (きゃ is 'base' like き; ぎゃ is
  // 'dakuten' like ぎ; ぴゃ is 'handakuten' like ぴ). ぢゃ/ぢゅ/ぢょ are
  // omitted — vanishingly rare in modern Japanese, not part of the standard
  // yōon set taught here (mirrors ぢ/づ already being folded into だ行
  // rather than getting separate emphasis).
  // き行/ぎ行
  { id: 'kya', kana: 'きゃ', romaji: 'kya', rowId: 'youon-ka-row', type: 'base' },
  { id: 'kyu', kana: 'きゅ', romaji: 'kyu', rowId: 'youon-ka-row', type: 'base' },
  { id: 'kyo', kana: 'きょ', romaji: 'kyo', rowId: 'youon-ka-row', type: 'base' },
  { id: 'gya', kana: 'ぎゃ', romaji: 'gya', rowId: 'youon-ka-row', type: 'dakuten' },
  { id: 'gyu', kana: 'ぎゅ', romaji: 'gyu', rowId: 'youon-ka-row', type: 'dakuten' },
  { id: 'gyo', kana: 'ぎょ', romaji: 'gyo', rowId: 'youon-ka-row', type: 'dakuten' },
  // し行/じ行
  { id: 'sha', kana: 'しゃ', romaji: 'sha', rowId: 'youon-sha-row', type: 'base' },
  { id: 'shu', kana: 'しゅ', romaji: 'shu', rowId: 'youon-sha-row', type: 'base' },
  { id: 'sho', kana: 'しょ', romaji: 'sho', rowId: 'youon-sha-row', type: 'base' },
  { id: 'ja', kana: 'じゃ', romaji: 'ja', rowId: 'youon-sha-row', type: 'dakuten' },
  { id: 'ju', kana: 'じゅ', romaji: 'ju', rowId: 'youon-sha-row', type: 'dakuten' },
  { id: 'jo', kana: 'じょ', romaji: 'jo', rowId: 'youon-sha-row', type: 'dakuten' },
  // ち行 (no dakuten row — see note above)
  { id: 'cha', kana: 'ちゃ', romaji: 'cha', rowId: 'youon-cha-row', type: 'base' },
  { id: 'chu', kana: 'ちゅ', romaji: 'chu', rowId: 'youon-cha-row', type: 'base' },
  { id: 'cho', kana: 'ちょ', romaji: 'cho', rowId: 'youon-cha-row', type: 'base' },
  // に行 (no dakuten)
  { id: 'nya', kana: 'にゃ', romaji: 'nya', rowId: 'youon-na-row', type: 'base' },
  { id: 'nyu', kana: 'にゅ', romaji: 'nyu', rowId: 'youon-na-row', type: 'base' },
  { id: 'nyo', kana: 'にょ', romaji: 'nyo', rowId: 'youon-na-row', type: 'base' },
  // ひ行/び行/ぴ行
  { id: 'hya', kana: 'ひゃ', romaji: 'hya', rowId: 'youon-ha-row', type: 'base' },
  { id: 'hyu', kana: 'ひゅ', romaji: 'hyu', rowId: 'youon-ha-row', type: 'base' },
  { id: 'hyo', kana: 'ひょ', romaji: 'hyo', rowId: 'youon-ha-row', type: 'base' },
  { id: 'bya', kana: 'びゃ', romaji: 'bya', rowId: 'youon-ha-row', type: 'dakuten' },
  { id: 'byu', kana: 'びゅ', romaji: 'byu', rowId: 'youon-ha-row', type: 'dakuten' },
  { id: 'byo', kana: 'びょ', romaji: 'byo', rowId: 'youon-ha-row', type: 'dakuten' },
  { id: 'pya', kana: 'ぴゃ', romaji: 'pya', rowId: 'youon-ha-row', type: 'handakuten' },
  { id: 'pyu', kana: 'ぴゅ', romaji: 'pyu', rowId: 'youon-ha-row', type: 'handakuten' },
  { id: 'pyo', kana: 'ぴょ', romaji: 'pyo', rowId: 'youon-ha-row', type: 'handakuten' },
  // み行 (no dakuten)
  { id: 'mya', kana: 'みゃ', romaji: 'mya', rowId: 'youon-ma-row', type: 'base' },
  { id: 'myu', kana: 'みゅ', romaji: 'myu', rowId: 'youon-ma-row', type: 'base' },
  { id: 'myo', kana: 'みょ', romaji: 'myo', rowId: 'youon-ma-row', type: 'base' },
  // り行 (no dakuten)
  { id: 'rya', kana: 'りゃ', romaji: 'rya', rowId: 'youon-ra-row', type: 'base' },
  { id: 'ryu', kana: 'りゅ', romaji: 'ryu', rowId: 'youon-ra-row', type: 'base' },
  { id: 'ryo', kana: 'りょ', romaji: 'ryo', rowId: 'youon-ra-row', type: 'base' },

  // ===== 拗音 (yōon) — カタカナ =====
  // Same 33-combination set as hiragana above, 'katakana-' prefixed per the
  // established convention (see the カタカナ section's header comment).
  // Real loanwords use these constantly (キャンプ camp, ジュース juice,
  // ミャンマー Myanmar) — this is NOT the same thing as 特殊音's extended
  // combinations for sounds with no native mora at all (ファ/ティ/ヴ/...),
  // which is a separate, not-yet-started category — see
  // docs/curriculum-extensibility.md.
  // キ行/ギ行
  { id: 'katakana-kya', kana: 'キャ', romaji: 'kya', rowId: 'youon-katakana-ka-row', type: 'base' },
  { id: 'katakana-kyu', kana: 'キュ', romaji: 'kyu', rowId: 'youon-katakana-ka-row', type: 'base' },
  { id: 'katakana-kyo', kana: 'キョ', romaji: 'kyo', rowId: 'youon-katakana-ka-row', type: 'base' },
  { id: 'katakana-gya', kana: 'ギャ', romaji: 'gya', rowId: 'youon-katakana-ka-row', type: 'dakuten' },
  { id: 'katakana-gyu', kana: 'ギュ', romaji: 'gyu', rowId: 'youon-katakana-ka-row', type: 'dakuten' },
  { id: 'katakana-gyo', kana: 'ギョ', romaji: 'gyo', rowId: 'youon-katakana-ka-row', type: 'dakuten' },
  // シ行/ジ行
  { id: 'katakana-sha', kana: 'シャ', romaji: 'sha', rowId: 'youon-katakana-sha-row', type: 'base' },
  { id: 'katakana-shu', kana: 'シュ', romaji: 'shu', rowId: 'youon-katakana-sha-row', type: 'base' },
  { id: 'katakana-sho', kana: 'ショ', romaji: 'sho', rowId: 'youon-katakana-sha-row', type: 'base' },
  { id: 'katakana-ja', kana: 'ジャ', romaji: 'ja', rowId: 'youon-katakana-sha-row', type: 'dakuten' },
  { id: 'katakana-ju', kana: 'ジュ', romaji: 'ju', rowId: 'youon-katakana-sha-row', type: 'dakuten' },
  { id: 'katakana-jo', kana: 'ジョ', romaji: 'jo', rowId: 'youon-katakana-sha-row', type: 'dakuten' },
  // チ行
  { id: 'katakana-cha', kana: 'チャ', romaji: 'cha', rowId: 'youon-katakana-cha-row', type: 'base' },
  { id: 'katakana-chu', kana: 'チュ', romaji: 'chu', rowId: 'youon-katakana-cha-row', type: 'base' },
  { id: 'katakana-cho', kana: 'チョ', romaji: 'cho', rowId: 'youon-katakana-cha-row', type: 'base' },
  // ニ行
  { id: 'katakana-nya', kana: 'ニャ', romaji: 'nya', rowId: 'youon-katakana-na-row', type: 'base' },
  { id: 'katakana-nyu', kana: 'ニュ', romaji: 'nyu', rowId: 'youon-katakana-na-row', type: 'base' },
  { id: 'katakana-nyo', kana: 'ニョ', romaji: 'nyo', rowId: 'youon-katakana-na-row', type: 'base' },
  // ヒ行/ビ行/ピ行
  { id: 'katakana-hya', kana: 'ヒャ', romaji: 'hya', rowId: 'youon-katakana-ha-row', type: 'base' },
  { id: 'katakana-hyu', kana: 'ヒュ', romaji: 'hyu', rowId: 'youon-katakana-ha-row', type: 'base' },
  { id: 'katakana-hyo', kana: 'ヒョ', romaji: 'hyo', rowId: 'youon-katakana-ha-row', type: 'base' },
  { id: 'katakana-bya', kana: 'ビャ', romaji: 'bya', rowId: 'youon-katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-byu', kana: 'ビュ', romaji: 'byu', rowId: 'youon-katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-byo', kana: 'ビョ', romaji: 'byo', rowId: 'youon-katakana-ha-row', type: 'dakuten' },
  { id: 'katakana-pya', kana: 'ピャ', romaji: 'pya', rowId: 'youon-katakana-ha-row', type: 'handakuten' },
  { id: 'katakana-pyu', kana: 'ピュ', romaji: 'pyu', rowId: 'youon-katakana-ha-row', type: 'handakuten' },
  { id: 'katakana-pyo', kana: 'ピョ', romaji: 'pyo', rowId: 'youon-katakana-ha-row', type: 'handakuten' },
  // ミ行
  { id: 'katakana-mya', kana: 'ミャ', romaji: 'mya', rowId: 'youon-katakana-ma-row', type: 'base' },
  { id: 'katakana-myu', kana: 'ミュ', romaji: 'myu', rowId: 'youon-katakana-ma-row', type: 'base' },
  { id: 'katakana-myo', kana: 'ミョ', romaji: 'myo', rowId: 'youon-katakana-ma-row', type: 'base' },
  // リ行
  { id: 'katakana-rya', kana: 'リャ', romaji: 'rya', rowId: 'youon-katakana-ra-row', type: 'base' },
  { id: 'katakana-ryu', kana: 'リュ', romaji: 'ryu', rowId: 'youon-katakana-ra-row', type: 'base' },
  { id: 'katakana-ryo', kana: 'リョ', romaji: 'ryo', rowId: 'youon-katakana-ra-row', type: 'base' },
]

export const CHARACTERS_BY_ID: Record<string, KanaChar> = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c]),
)

// Kunrei-shiki (and other common) romanizations accepted alongside each
// character's Hepburn-based canonical romaji in CHARACTERS above — e.g. つ
// is typed as either "tsu" (Hepburn) or "tu" (Kunrei-shiki). Only characters
// where the two systems actually diverge need an entry here.
export const ROMAJI_ALTERNATES: Record<string, string[]> = {
  shi: ['si'],
  chi: ['ti'],
  tsu: ['tu'],
  ji: ['zi'],
  dji: ['di'],
  dzu: ['du'],
  fu: ['hu'],
  wo: ['o'],
  'katakana-shi': ['si'],
  'katakana-chi': ['ti'],
  'katakana-tsu': ['tu'],
  'katakana-ji': ['zi'],
  'katakana-dji': ['di'],
  'katakana-dzu': ['du'],
  'katakana-fu': ['hu'],
  'katakana-wo': ['o'],
  // 拗音 (yōon) Kunrei-shiki alternates — same divergence pattern as their
  // base-row counterparts above (shi/si, chi/ti, ji/zi), just contracted:
  // sha/sya, cha/tya, ja/zya, etc.
  sha: ['sya'],
  shu: ['syu'],
  sho: ['syo'],
  cha: ['tya'],
  chu: ['tyu'],
  cho: ['tyo'],
  ja: ['zya'],
  ju: ['zyu'],
  jo: ['zyo'],
  'katakana-sha': ['sya'],
  'katakana-shu': ['syu'],
  'katakana-sho': ['syo'],
  'katakana-cha': ['tya'],
  'katakana-chu': ['tyu'],
  'katakana-cho': ['tyo'],
  'katakana-ja': ['zya'],
  'katakana-ju': ['zyu'],
  'katakana-jo': ['zyo'],
}
