// Verifies src/data/accents.ts against the current curriculum, WITHOUT any
// network access. This replaced the old scripts/buildAccentData.mjs, which
// fetched accentjiten.com's dataset and rewrote accents.ts on every run —
// a live external-dependency path that a commercial release should not keep
// as something a routine `npm run verify` (or any other active tooling) can
// silently trigger. See docs/pitch-accent-provenance.md for the full
// history and reasoning: ACCENT_PATTERNS is now a static, user-reviewed
// canonical table, not a build artifact.
//
// This script only reads WORDS_BY_ROW + ACCENT_PATTERNS and checks internal
// consistency — it never fetches anything and never writes accents.ts. If a
// new word is added to src/data/words.ts, its accent must be added to
// accents.ts by hand, sourced the same way the existing 298 entries were
// (see the provenance doc) — never guessed from memory.
//
// Run: node scripts/checkAccentData.mjs
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// Local duplicate of src/lib/mora.ts's toMorae — this script runs under
// plain node (not tsx), same rationale as the old generator had.
const SMALL_COMBINING = new Set(['ゃ', 'ゅ', 'ょ', 'ゎ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ャ', 'ュ', 'ョ', 'ヮ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ'])
function toMorae(kana) {
  const morae = []
  for (const ch of kana) {
    if (SMALL_COMBINING.has(ch) && morae.length > 0) morae[morae.length - 1] += ch
    else morae.push(ch)
  }
  return morae
}

const wordsSrc = await (await import('node:fs/promises')).readFile(path.join(root, 'src/data/words.ts'), 'utf8')
const wordRe = /\{\s*id:\s*'([^']+)',\s*kana:\s*'([^']+)'/g
const words = []
for (const m of wordsSrc.matchAll(wordRe)) words.push({ id: m[1], kana: m[2] })

const accentsSrc = await (await import('node:fs/promises')).readFile(path.join(root, 'src/data/accents.ts'), 'utf8')
const accentRe = /'([^']+)':\s*'([^']+)'/g
const accents = {}
for (const m of accentsSrc.matchAll(accentRe)) accents[m[1]] = m[2]

const errors = []

// 1. Coverage: every multi-mora curriculum word must have an accent entry;
// every single-mora word must NOT have one (no accent contrast possible).
const oneMoraWithEntry = []
const multiMoraMissing = []
for (const w of words) {
  const morae = toMorae(w.kana).length
  const hasEntry = Object.prototype.hasOwnProperty.call(accents, w.id)
  if (morae < 2 && hasEntry) oneMoraWithEntry.push(w.id)
  if (morae >= 2 && !hasEntry) multiMoraMissing.push(w.id)
}
if (oneMoraWithEntry.length > 0) errors.push(`1-mora word(s) unexpectedly have an accent entry: ${oneMoraWithEntry.join(', ')}`)
if (multiMoraMissing.length > 0) errors.push(`multi-mora word(s) missing an accent entry: ${multiMoraMissing.join(', ')}`)

// 2. Stale entries: an accent id that no longer matches any current word.
const wordIds = new Set(words.map((w) => w.id))
const staleEntries = Object.keys(accents).filter((id) => !wordIds.has(id))
if (staleEntries.length > 0) errors.push(`accent entries with no matching curriculum word: ${staleEntries.join(', ')}`)

// 3. Value shape: every accent string must be H/L only, and its length must
// match the word's mora count exactly.
const wordsById = Object.fromEntries(words.map((w) => [w.id, w]))
for (const [id, accent] of Object.entries(accents)) {
  if (!/^[HL]+$/.test(accent)) {
    errors.push(`${id}: accent "${accent}" contains characters other than H/L`)
    continue
  }
  const word = wordsById[id]
  if (!word) continue // already reported as stale above
  const morae = toMorae(word.kana).length
  if (accent.length !== morae) {
    errors.push(`${id}: accent "${accent}" has ${accent.length} morae but "${word.kana}" has ${morae}`)
  }
}

// 4. Approved baseline: the exact 298-entry table is pinned below (frozen
// at the 2026-09 commercial-release pitch-accent audit — see
// docs/pitch-accent-provenance.md). Any diff here means ACCENT_PATTERNS
// changed since that audit and needs explicit human review before this
// check is updated to match — this check must never be "fixed" by
// regenerating it from the current accents.ts without that review.
const APPROVED_ENTRY_COUNT = 298
const actualCount = Object.keys(accents).length
if (actualCount !== APPROVED_ENTRY_COUNT) {
  errors.push(`expected ${APPROVED_ENTRY_COUNT} approved accent entries, found ${actualCount}`)
}

// 5. Spot-check pins for values with known regression history.
const PINNED = {
  'special-katakana-she-harowin': 'HLLL', // ハロウィン — see PR #208
  'ra-mizu-wo-nomu': 'LHHHL', // みずをのむ (current id; the pipeline's old
  // 'wa-mizu-wo-nomu' id predates the word's move into the combined
  // ra-row and no longer exists — see curriculum.test.ts's stale-id guard)
}
for (const [id, expected] of Object.entries(PINNED)) {
  if (accents[id] !== expected) {
    errors.push(`${id}: expected pinned accent "${expected}", found "${accents[id] ?? '(missing)'}"`)
  }
}

if (errors.length > 0) {
  console.error(`accents.ts integrity check FAILED (${errors.length} issue(s)):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

console.log(`accents.ts integrity check passed: ${actualCount} entries, all covering/shape/pin checks OK.`)
