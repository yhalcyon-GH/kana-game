// Rebuilds src/data/accents.ts (the pitch-accent High/Low pattern shown as
// a small red line on Learn's word cards — see WordCard.tsx) from
// accentjiten.com's aggregated NHK/OJAD/Wiktionary/Wadoku/Kanjium/
// Kishimoto-Tsuneyo pitch-accent dataset. Never hand-guess accent — see
// the feedback_dont_guess_pitch_accent memory for why. Run whenever a new
// word is added to src/data/words.ts:
//   node scripts/buildAccentData.mjs
//
// accentjiten.com ships its entire dataset as one LZMA-compressed binary
// blob decoded client-side in a Web Worker (no server-side search API) —
// this script re-implements that binary reader in Node (translated from
// the site's own accentjiten.worker.js) instead of scraping rendered
// pages. See reference_accentjiten_dataset memory for background.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// Same mora-grouping rule as src/lib/mora.ts (kept as a local duplicate
// since this script runs under plain node, not tsx) — WordCard's
// AccentedKana aligns accent strings by mora, not raw character count, so
// a yōon word's accent (e.g. きゃく = 2 morae, 3 characters) is valid as
// long as it matches the MORA count, not the kana string's length.
const SMALL_COMBINING = new Set(['ゃ', 'ゅ', 'ょ', 'ゎ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ャ', 'ュ', 'ョ', 'ヮ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ'])
function toMorae(kana) {
  const morae = []
  for (const ch of kana) {
    if (SMALL_COMBINING.has(ch) && morae.length > 0) morae[morae.length - 1] += ch
    else morae.push(ch)
  }
  return morae
}

// The dataset version number is embedded in its filename and increments
// occasionally; accentjiten.worker.js (fetchable the same way) always
// references the current one, so resolve it dynamically rather than
// hardcoding a version that will eventually 404.
const WORKER_URL = 'https://accentjiten.com/accentjiten.worker.js'
const LZMA_URL = 'https://accentjiten.com/lzma.js'

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.text()
}

console.log('Fetching accentjiten worker + LZMA decoder...')
const workerSrc = await fetchText(WORKER_URL)
const lzmaSrc = await fetchText(LZMA_URL)

const datMatch = workerSrc.match(/accentjiten-(\d+)\.dat\.lzma/)
if (!datMatch) throw new Error('Could not find dataset filename in accentjiten.worker.js — site format may have changed')
const datUrl = `https://accentjiten.com/${datMatch[0]}`
console.log(`Dataset: ${datMatch[0]}`)

const sizeMatch = workerSrc.match(/UNCOMPRESSED_SIZE\s*=\s*(\d+)/) ?? workerSrc.match(/(\d{7,})/)
if (!sizeMatch) throw new Error('Could not find uncompressed size in accentjiten.worker.js')

console.log('Downloading + decompressing dataset (~3MB compressed)...')
const compressed = Buffer.from(await (await fetch(datUrl)).arrayBuffer())

const sandbox = {}
vm.createContext(sandbox)
vm.runInContext(lzmaSrc, sandbox)
const LZMA = sandbox.LZMA

// The worker's own code always calls decompressFile without pre-knowing
// the exact output size (it grows a buffer as needed); mirror that here
// instead of trusting a regex-guessed size constant.
const chunks = []
let inOffset = 0
const inStream = { readByte: () => compressed[inOffset++] }
const outStream = { writeByte: (b) => chunks.push(b) }
LZMA.decompressFile(inStream, outStream)
const data = Buffer.from(chunks)
console.log(`Decompressed ${data.length} bytes.`)

// --- Binary format reader (translated from accentjiten.worker.js) ---
const getUint8At = (pos) => data.readUInt8(pos)
const getUint16At = (pos) => data.readUInt16BE(pos)
const getUint32At = (pos) => data.readUInt32BE(pos)
function getStringAt(pos) {
  const len = getUint8At(pos)
  let s = ''
  for (let i = 0; i < len; i++) s += String.fromCharCode(getUint16At(pos + 1 + i * 2))
  return s
}
const SOURCE_NAMES = ['AccentJiten', 'OJAD', 'Wiktionary', 'NHK', 'Wadoku', 'Kanjium', 'Kishimoto Tsuneyo']
function sourceArray_toNames(sourceArrayOffset) {
  const len = getUint8At(sourceArrayOffset)
  const names = []
  for (let i = 0; i < len; i++) names.push(SOURCE_NAMES[getUint8At(sourceArrayOffset + 1 + i)] ?? 'unknown')
  return names
}

const entryArrayLength = getUint32At(0)
const entryOffset = (i) => 4 + i * 4 * 4
let pos = 4 + entryArrayLength * 4 * 4

const nSyllableFormPool = getUint16At(pos)
pos += 2
const syllableFormPool = new Array(nSyllableFormPool)
for (let i = 0; i < nSyllableFormPool; i++) {
  const nHiragana = getUint8At(pos)
  pos += 1
  const hiraganaMoras = new Array(nHiragana)
  for (let j = 0; j < nHiragana; j++) {
    hiraganaMoras[j] = getStringAt(pos)
    pos += 1 + hiraganaMoras[j].length * 2
  }
  const nKatakana = getUint8At(pos)
  pos += 1
  const katakanaMoras = new Array(nKatakana)
  for (let j = 0; j < nKatakana; j++) {
    katakanaMoras[j] = getStringAt(pos)
    pos += 1 + katakanaMoras[j].length * 2
  }
  const nRomaji = getUint8At(pos)
  pos += 1
  for (let j = 0; j < nRomaji; j++) {
    const s = getStringAt(pos)
    pos += 1 + s.length * 2
  }
  const isPunctuation = getUint8At(pos)
  pos += 1
  syllableFormPool[i] = {
    hiraganaSyllable: hiraganaMoras.join(''),
    katakanaSyllable: katakanaMoras.join(''),
    isPunctuation: !!isPunctuation,
  }
}

const nSyllablePool = getUint16At(pos)
pos += 2
const syllablePool = new Array(nSyllablePool)
for (let i = 0; i < nSyllablePool; i++) {
  const formIndex = getUint16At(pos)
  pos += 2
  const hiraganaOrKatakana = getUint8At(pos)
  pos += 1
  syllablePool[i] = { form: syllableFormPool[formIndex], hiraganaOrKatakana }
}

function syllableArray_toKana(offset) {
  const len = getUint8At(offset)
  let kana = ''
  for (let i = 0; i < len; i++) {
    const syllable = syllablePool[getUint16At(offset + 1 + i * 2)]
    kana += syllable.hiraganaOrKatakana ? syllable.form.katakanaSyllable : syllable.form.hiraganaSyllable
  }
  return kana
}

console.log(`Scanning ${entryArrayLength} entries...`)
const byKana = new Map()
for (let i = 0; i < entryArrayLength; i++) {
  const eOff = entryOffset(i)
  const stringArrayOffset = getUint32At(eOff)
  const nVariants = getUint8At(stringArrayOffset)
  const variants = []
  for (let v = 0; v < nVariants; v++) variants.push(getStringAt(getUint32At(stringArrayOffset + 1 + v * 4)))

  const pronArrayOffset = getUint32At(eOff + 8)
  const nPron = getUint8At(pronArrayOffset)
  for (let p = 0; p < nPron; p++) {
    const pOff = getUint32At(pronArrayOffset + 1 + p * 4)
    const kana = syllableArray_toKana(getUint32At(pOff))
    const accent = getStringAt(getUint32At(pOff + 4))
    const sources = sourceArray_toNames(getUint32At(pOff + 8))
    if (!byKana.has(kana)) byKana.set(kana, [])
    byKana.get(kana).push({ variants, accent, sources })
  }
}
console.log(`Indexed ${byKana.size} distinct kana readings.`)

// --- Resolve each word in the curriculum ---
const wordsSrc = await (await import('node:fs/promises')).readFile(path.join(root, 'src/data/words.ts'), 'utf8')
const wordRe = /\{\s*id:\s*'([^']+)',\s*kana:\s*'([^']+)',\s*romaji:\s*'([^']+)',\s*meaning:\s*'([^']+)'/g
const words = []
for (const m of wordsSrc.matchAll(wordRe)) words.push({ id: m[1], kana: m[2], romaji: m[3], meaning: m[4] })
if (!words.some((w) => w.id === 'wa-mizu-wo-nomu')) {
  words.push({ id: 'wa-mizu-wo-nomu', kana: 'みずをのむ', romaji: 'mizu wo nomu', meaning: 'drink water' })
}

// Disambiguates which homophone-kanji reading a word's kana refers to, for
// words where accentjiten has multiple unrelated entries for the same
// kana (e.g. あめ = 雨/rain vs 飴/candy). `null` skip entries have since
// all been resolved via source-consensus below — kept as documentation.
const MEANING_TO_KANJI = {
  'sokuon-otto': '夫',
  'sokuon-kakko': '括弧',
  'sokuon-kite': '来て',
  'sokuon-matte': '待って',
  'sokuon-ikki': '一気',
  'sokuon-machi': '町',
  'chouon-i-ii': '良い',
  'chouon-u-yuuki': '勇気',
  'chouon-u-suuji': '数字',
  'chouon-e-eiga': '映画',
  'chouon-e-yuumei': '有名',
  'chouon-o-koukou': '高校',
  'chouon-o-koori': '氷',
  'youon-ka-kyaku': '客',
  'youon-ka-kyou': '今日',
  'youon-ka-gyouza': '餃子',
  'youon-sha-densha': '電車',
  'youon-sha-kaisha': '会社',
  'youon-sha-jisho': '辞書',
  'youon-sha-jouzu': '上手',
  'youon-cha-na-chokin': '貯金',
  'youon-ha-byouki': '病気',
  'youon-ma-ra-ryokou': '旅行',
  'a-ai': '愛',
  'ka-aka': '赤',
  'ka-ika': '烏賊',
  'ka-kagi': '鍵',
  'ka-koko': '此処',
  'ka-kau': '買う',
  'ka-kiku': '聞く',
  'ka-eki': '駅',
  'ka-kaku': '書く',
  'ka-koe': '声',
  'sa-asa': '朝',
  'sa-kasa': '傘',
  'sa-sekai': '世界',
  'sa-okashi': 'お菓子',
  'sa-sake': '酒',
  'sa-sushi': '寿司',
  'ta-tsuki': '月',
  'na-neko': '猫',
  'na-inu': '犬',
  'na-nani': '何',
  'na-niku': '肉',
  'ha-hana': '花',
  'ha-hito': '人',
  'ha-kutsushita': '靴下',
  'ha-fuku': '服',
  'ma-mizu': '水',
  'ma-ame': '雨',
  'ma-tamago': '卵',
  'ma-kudamono': '果物',
  'ma-namae': '名前',
  'ya-yama': '山',
  'ya-yuki': '雪',
  'ya-yume': '夢',
  'ra-sakura': '桜',
  'ra-tori': '鳥',
  'ra-shiro': '白',
  'ra-yoru': '夜',
  'wa-nihon': '日本',
  'wa-sensei': '先生',
  'chouon-suuji': '数字',
  'chouon-sensei': '先生',
}

// For words where even the correct-meaning kanji has multiple accents on
// record, prefer whichever is backed by a broad majority of independent
// sources over a lone outlier (often a single secondary NHK entry). This
// is a documented consensus call, not a guess — see the source breakdown
// each was resolved from, printed by this script below.
const RESOLVED_BY_SOURCE_CONSENSUS = {
  'sa-sekai': 'HLL',
  'sa-okashi': 'LHL',
  'sa-sushi': 'LH',
  'na-nani': 'HL',
  'ha-kutsushita': 'LHLL',
  'ma-tamago': 'LHL',
  'ya-yuki': 'LH',
  'sokuon-kakko': 'HLL', // 5 sources vs 2
  'chouon-e-eiga': 'LHH', // user-corrected — dataset majority was HLL (5 vs 4) but user preferred the minority reading
  'chouon-katakana-koora': 'HLL', // 5 sources vs 1
  'youon-sha-densha': 'LHH', // 5 sources vs 3
  'youon-cha-na-chokin': 'LHH', // 5 sources vs 1
  'youon-katakana-cha-na-manyuaru': 'LHHH', // 5 sources vs 3
  'youon-katakana-ma-ra-myuujiamu': 'HLLLL', // 4 sources vs 2
  'youon-katakana-ma-ra-myuujishan': 'LHHLL', // 4 sources vs 1
  'youon-katakana-ma-ra-boryuumu': 'LHHH', // 5 sources vs 1
  // sokuon-matte (待って): a 1-source-vs-1-source tie (Wiktionary only, both
  // sides) — no real majority to resolve by, deliberately left unresolved
  // rather than picking arbitrarily.
  'ra-sakura': 'LHH',
  // Katakana loanwords: no kanji exists to disambiguate by, so these are
  // resolved directly by counting sources per candidate accent (see the
  // per-word source breakdown this script prints for any AMBIGUOUS entry
  // without a resolution here) rather than filtering by kanji variant.
  'katakana-a-aikon': 'HLLL', // 4 sources (Wiktionary/NHK/Kanjium/Kishimoto) vs 1 (NHK)
  'katakana-a-kokoa': 'HLL', // 5 sources vs 4
  'katakana-sa-sooseeji': 'HLLLL', // 4 sources vs 3
  'katakana-ta-aidea': 'LHHL', // 5 sources vs 4
  'katakana-ta-toosuto': 'LHHH', // user-corrected — dataset majority was HLLL (5 vs 3) but user preferred the minority reading
  'katakana-ma-anime': 'HLL', // 5 sources vs 4
  'katakana-ma-misu': 'HL', // 5 sources vs 1
  'katakana-ma-suimingu': 'LHLLL', // 4 sources vs 2
  'katakana-ra-booru': 'LHH', // 5 sources vs 3
}

// Words with NO accentjiten entry at all — supplied directly by the user
// (by ear/personal knowledge), which is a different thing from Claude
// guessing from memory (see feedback_dont_guess_pitch_accent memory). Kept
// here, not just hand-patched into accents.ts, so they survive the next
// full rebuild instead of silently disappearing.
const MANUAL_OVERRIDES = {
  'chouon-a-maamaa': 'LHHL', // まあまあ (maamaa)
  'sokuon-iki': 'HL', // いき (iki)
  'wa-mizu-wo-nomu': 'LHHHL', // みずをのむ (mizu wo nomu)
  'katakana-a-kaki': 'HL', // カキ (kaki)
  'katakana-sa-zou': 'HL', // ゾウ (zou)
  'katakana-na-nasu': 'HL', // ナス (nasu)
  'katakana-ya-hiyoko': 'LHH', // ヒヨコ (hiyoko)
  'katakana-ya-moyashi': 'LHH', // モヤシ (moyashi)
  'katakana-ra-tora': 'LH', // トラ (tora)
  'sokuon-matte': 'HLL', // まって (matte)
  'sokuon-mote': 'HL', // もて (mote)
  'youon-katakana-ka-kyuuri': 'HLL', // キュウリ (kyuuri) — 3 morae: kyu-u-ri
  'youon-katakana-ha-hyou': 'HL', // ヒョウ (hyou) — 2 morae: hyo-u
  'chouon-e-eiga': 'HLL', // えいが (eiga) — user-supplied, per their own pronunciation
}

const results = []
const skipped = []
for (const w of words) {
  if (toMorae(w.kana).length < 2) continue
  if (MANUAL_OVERRIDES[w.id]) {
    results.push({ id: w.id, kana: w.kana, romaji: w.romaji, accent: MANUAL_OVERRIDES[w.id] })
    continue
  }
  const entries = byKana.get(w.kana)
  if (!entries || entries.length === 0) {
    skipped.push(`${w.id}: no accentjiten data for "${w.kana}"`)
    continue
  }
  const allAccents = [...new Set(entries.map((e) => e.accent.split('-')[0]))]
  if (allAccents.length === 1) {
    results.push({ id: w.id, kana: w.kana, romaji: w.romaji, accent: allAccents[0] })
    continue
  }
  const pick = MEANING_TO_KANJI[w.id]
  if (!pick) {
    const noKanjiResolved = RESOLVED_BY_SOURCE_CONSENSUS[w.id]
    if (noKanjiResolved && allAccents.includes(noKanjiResolved)) {
      results.push({ id: w.id, kana: w.kana, romaji: w.romaji, accent: noKanjiResolved })
      continue
    }
    console.log(`\n${w.id} (${w.kana} "${w.meaning}") has conflicting accents, no kanji to disambiguate by:`)
    for (const e of entries) console.log(`  ${e.accent}  [${e.sources.join(', ')}]  variants: ${e.variants.join(', ')}`)
    skipped.push(`${w.id}: AMBIGUOUS, no disambiguation entry — ${w.kana} "${w.meaning}"`)
    continue
  }
  const matches = entries.filter((e) => e.variants.includes(pick))
  if (matches.length === 0) {
    skipped.push(`${w.id}: disambiguation target "${pick}" not found for ${w.kana}`)
    continue
  }
  const matchAccents = [...new Set(matches.map((e) => e.accent.split('-')[0]))]
  if (matchAccents.length === 1) {
    results.push({ id: w.id, kana: w.kana, romaji: w.romaji, accent: matchAccents[0] })
    continue
  }
  const resolved = RESOLVED_BY_SOURCE_CONSENSUS[w.id]
  if (resolved && matchAccents.includes(resolved)) {
    results.push({ id: w.id, kana: w.kana, romaji: w.romaji, accent: resolved })
  } else {
    console.log(`\n${w.id} (${w.kana} "${pick}") has conflicting accents with no resolution on file:`)
    for (const m of matches) console.log(`  ${m.accent}  [${m.sources.join(', ')}]`)
    skipped.push(`${w.id}: unresolved conflict for "${pick}"`)
  }
}

console.log(`\nResolved: ${results.length}  Skipped: ${skipped.length}`)
skipped.forEach((s) => console.log('  -', s))

const lengthMismatches = results.filter((r) => r.accent.length !== toMorae(r.kana).length)
if (lengthMismatches.length > 0) {
  console.log('\nWARNING — length mismatches (dropped from output):')
  lengthMismatches.forEach((m) => console.log('  -', m))
}
const clean = results.filter((r) => r.accent.length === toMorae(r.kana).length)

const lines = clean
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((r) => `  '${r.id}': '${r.accent}', // ${r.kana} (${r.romaji})`)

const out = `// Pitch accent pattern per word, as a High/Low string aligned by MORA
// (via src/lib/mora.ts's toMorae — a yōon digraph like きゃ is 1 mora, 2
// characters), consumed by WordCard's AccentedKana, which does the same
// mora-grouping when drawing the accent line. Rebuilt by
// scripts/buildAccentData.mjs from accentjiten.com's aggregated
// NHK/OJAD/Wiktionary/Wadoku/Kanjium/Kishimoto-Tsuneyo dataset — never
// hand-guessed (see feedback_dont_guess_pitch_accent memory). Words are
// omitted here only when the word is a single mora (no accent contrast is
// possible); every multi-mora word has a resolved answer, either a single
// accent on record for the correct-meaning kanji, or — for words where
// even that kanji has more than one accent on record — the reading backed
// by the broader majority of independent sources (see the script's
// RESOLVED_BY_SOURCE_CONSENSUS table and console output for the specific
// per-source breakdown behind each of those).
//
// Intentionally coarse: this drives a small, deliberately de-emphasized
// visual hint (see WordCard), not pronunciation-critical audio, so
// dialect/source variation that would matter for TTS accuracy is fine to
// resolve by majority here.
export const ACCENT_PATTERNS: Record<string, string> = {
${lines.join('\n')}
}
`

await writeFile(path.join(root, 'src/data/accents.ts'), out)
console.log(`\nWrote src/data/accents.ts with ${clean.length} entries`)
