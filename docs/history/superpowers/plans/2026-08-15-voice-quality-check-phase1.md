# Japanese Voice Quality Check (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an automated pronunciation-check pipeline (`npm run check-voices`) that catches ElevenLabs mispronunciations of generated word audio, classifying each word PASS/WARNING/FAIL and writing a JSON report, without touching any existing game logic.

**Architecture:** A local, free, ASR-based checker. `scripts/checkVoiceQuality.ts` runs each word's existing `.wav` clip through a local `whisper.cpp` binding, normalizes the (possibly kanji-mixed) recognized text to hiragana via `kuroshiro`, and compares it — mora by mora, not character by character — against `word.kana` (which is already the authoritative reading in this codebase; no new "reading" field is needed). Comparison logic lives in `src/lib/` as pure, unit-testable functions reusing this repo's existing `levenshteinDistance` and `toHiragana` helpers. Regeneration of FAILed clips reuses (via extraction, not duplication) the existing ElevenLabs synthesis code, and is gated behind explicit CLI flags so it never spends API credits without the user opting in twice.

**Tech Stack:** TypeScript, `tsx` (existing script runner), Vitest (existing test runner), `@lumen-labs-dev/whisper-node` (local whisper.cpp binding, ships precompiled Windows binaries — no build toolchain required), `kuroshiro` + `kuroshiro-analyzer-kuromoji` (kanji→hiragana normalization). All new dependencies are MIT-licensed, free, and run entirely locally.

**Spec:** `docs/2026-08-15-voice-quality-check-design.md`

## Global Constraints

- `AnchorWord`/`KanaChar` types (`src/data/types.ts`) are NOT modified — `word.kana` is reused as the authoritative reading. Do not add a `reading` field.
- `src/data/accents.ts` is NOT touched in this phase (F0/accent analysis is Phase 2, out of scope here).
- No paid API call may happen without an explicit, separate `--regenerate --yes` combination on the CLI (see Task 6). A bare `--regenerate` must be a dry run that only prints what would be regenerated.
- Do not actually invoke `scripts/generateAudioElevenLabs.ts` (or the regenerate path) for real during verification of any task — it costs money. Verify refactors via `tsc`/`npm run build` and code reading only.
- PASS/WARNING/FAIL thresholds must live in a config file, not be hardcoded inline in comparison logic.
- Follow existing code style in `src/lib/*.ts` and `scripts/*.ts`: flat files (no subfolders), header comments explaining *why*, not *what*.
- Every new pure-logic file gets a co-located `.test.ts` using `describe`/`it` from `vitest`, matching `src/lib/answerCloseness.test.ts`'s style.
- Accent-related test coverage ("アクセント違い") is explicitly deferred to the Phase 2 plan — do not fabricate an accent test in this phase, since no accent-checking code exists yet.

---

## Task 1: Mora splitting (`src/lib/mora.ts`)

**Files:**
- Create: `src/lib/mora.ts`
- Test: `src/lib/mora.test.ts`

**Interfaces:**
- Produces: `toMorae(kana: string): string[]` — splits a kana string into Japanese morae. Small kana (ゃゅょぁぃぅぇぉ and katakana equivalents) attach to the preceding character (きゃ = 1 mora). っ/ッ, ー, ん/ン are each their own mora.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/mora.test.ts
import { describe, expect, it } from 'vitest'
import { toMorae } from './mora'

describe('toMorae', () => {
  it('splits plain seion kana one mora per character', () => {
    expect(toMorae('さくら')).toEqual(['さ', 'く', 'ら'])
  })

  it('splits dakuten kana one mora per character', () => {
    expect(toMorae('がぎぐげご')).toEqual(['が', 'ぎ', 'ぐ', 'げ', 'ご'])
  })

  it('treats sokuon (っ) as its own mora', () => {
    expect(toMorae('がっこう')).toEqual(['が', 'っ', 'こ', 'う'])
  })

  it('treats chōon (ー) as its own mora', () => {
    expect(toMorae('コーヒー')).toEqual(['コ', 'ー', 'ヒ', 'ー'])
  })

  it('treats hatsuon (ん) as its own mora', () => {
    expect(toMorae('ほん')).toEqual(['ほ', 'ん'])
  })

  it('merges a small ゃゅょ with the preceding kana into one yōon mora', () => {
    expect(toMorae('きゃく')).toEqual(['きゃ', 'く'])
    expect(toMorae('ひゃく')).toEqual(['ひゃ', 'く'])
  })

  it('merges katakana small kana the same way', () => {
    expect(toMorae('キャット')).toEqual(['キャ', 'ッ', 'ト'])
  })

  it('returns an empty array for an empty string', () => {
    expect(toMorae('')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/mora.test.ts`
Expected: FAIL with "Cannot find module './mora'" (or similar — the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/mora.ts
// Small kana (ゃゅょぁぃぅぇぉ and katakana equivalents) attach to the
// preceding kana to form one mora (きゃ = 1 mora, not 2) — see CLAUDE.md's
// "one kana glyph = one mora, EXCEPT yōon" note. っ/ッ (sokuon), ー
// (chōon), and ん/ン (hatsuon) each count as their own mora and are never
// merged, matching standard Japanese mora counting. Used by
// src/lib/voiceQuality.ts to compare an ASR transcript against a word's
// expected reading mora-by-mora rather than character-by-character.
const SMALL_COMBINING = new Set([
  'ゃ', 'ゅ', 'ょ', 'ゎ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ',
  'ャ', 'ュ', 'ョ', 'ヮ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ',
])

export function toMorae(kana: string): string[] {
  const morae: string[] = []
  for (const ch of kana) {
    if (SMALL_COMBINING.has(ch) && morae.length > 0) {
      morae[morae.length - 1] += ch
    } else {
      morae.push(ch)
    }
  }
  return morae
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/mora.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mora.ts src/lib/mora.test.ts
git commit -m "$(cat <<'EOF'
Add toMorae() for Japanese mora splitting

Foundation for the voice-quality checker's mora-level comparison
(src/lib/voiceQuality.ts, added next) — sokuon/chōon/hatsuon each count
as their own mora, small ゃゅょ merge into the preceding kana.
EOF
)"
```

---

## Task 2: Pronunciation-check scoring (`src/lib/voiceQuality.ts`)

**Files:**
- Modify: `src/lib/answerChecking.ts:39` (export the existing `toHiragana` helper)
- Create: `src/lib/voiceQuality.ts`
- Test: `src/lib/voiceQuality.test.ts`

**Interfaces:**
- Consumes: `toMorae(kana: string): string[]` (Task 1), `levenshteinDistance<T>(a: readonly T[], b: readonly T[]): number` (`src/lib/answerCloseness.ts`, existing), `toHiragana(text: string): string` (`src/lib/answerChecking.ts`, existing — being exported in this task).
- Produces: `checkPronunciation(expectedKana: string, detectedHiragana: string, thresholds: VoiceCheckThresholds): PronunciationCheckResult`, and the `VoiceCheckThresholds` / `PronunciationCheckResult` / `PronunciationStatus` types, consumed by `scripts/checkVoiceQuality.ts` in Task 6.

- [ ] **Step 1: Export `toHiragana`**

In `src/lib/answerChecking.ts`, change line 40 from:

```ts
const toHiragana = (text: string) => shiftKanaScript(text, [0x30a1, 0x30f6], -0x60)
```

to:

```ts
export const toHiragana = (text: string) => shiftKanaScript(text, [0x30a1, 0x30f6], -0x60)
```

(`toKatakana` on the line above stays unexported — nothing outside this file needs it yet.)

- [ ] **Step 2: Run existing tests to confirm the export didn't break anything**

Run: `npm test -- src/lib/answerChecking.test.ts`
Expected: PASS (no behavior change, only visibility).

- [ ] **Step 3: Write the failing tests**

```ts
// src/lib/voiceQuality.test.ts
import { describe, expect, it } from 'vitest'
import { checkPronunciation, type VoiceCheckThresholds } from './voiceQuality'

const THRESHOLDS: VoiceCheckThresholds = { passScore: 90, warningScore: 70 }

describe('checkPronunciation', () => {
  it('PASSes an exact reading match', () => {
    const result = checkPronunciation('おばあさん', 'おばあさん', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('PASS')
    expect(result.pronunciationScore).toBe(100)
  })

  it('FAILs the documented お祖母さん misreading (おばあさん heard as おそぼさん)', () => {
    const result = checkPronunciation('おばあさん', 'おそぼさん', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('FAIL')
    expect(result.reasons[0]).toContain('おばあさん')
    expect(result.reasons[0]).toContain('おそぼさん')
  })

  it('FAILs a dakuten (voicing) misread — かき heard as がき', () => {
    const result = checkPronunciation('かき', 'がき', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('FAIL')
  })

  it('FAILs a sokuon minimal-pair confusion — おっと heard as おと', () => {
    const result = checkPronunciation('おっと', 'おと', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('FAIL')
  })

  it('FAILs a dropped hatsuon — かばん heard as かば', () => {
    const result = checkPronunciation('かばん', 'かば', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('FAIL')
  })

  it('FAILs a yōon confusion — きゃく heard as かく', () => {
    const result = checkPronunciation('きゃく', 'かく', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('FAIL')
  })

  it('WARNs on a chōon minimal-pair confusion in a longer word — おばあさん heard as おばさん', () => {
    const result = checkPronunciation('おばあさん', 'おばさん', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('WARNING')
  })

  it('normalizes a katakana expected reading to hiragana before comparing', () => {
    const result = checkPronunciation('タコ', 'たこ', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('PASS')
    expect(result.expectedReading).toBe('たこ')
  })

  it('does not throw on an empty detected reading (ASR found nothing)', () => {
    const result = checkPronunciation('ねこ', '', THRESHOLDS)
    expect(result.pronunciationStatus).toBe('FAIL')
    expect(result.detectedReading).toBe('')
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- src/lib/voiceQuality.test.ts`
Expected: FAIL with "Cannot find module './voiceQuality'".

- [ ] **Step 5: Write the implementation**

```ts
// src/lib/voiceQuality.ts
// Compares an ASR-transcribed reading of a generated word clip against the
// word's expected reading (word.kana — already the authoritative reading in
// this codebase, since kana never contains kanji; see
// docs/2026-08-15-voice-quality-check-design.md). Comparison is mora-based,
// not character-based, so e.g. a single dropped/added mora scores as "one
// mistake" regardless of how many UTF-16 characters that mora happens to be
// (きゃ is 2 characters but 1 mora). Pure and framework-agnostic — no ASR
// call or file I/O here, see scripts/asr.ts for that.
import { toHiragana } from './answerChecking'
import { levenshteinDistance } from './answerCloseness'
import { toMorae } from './mora'

export interface VoiceCheckThresholds {
  passScore: number
  warningScore: number
}

export type PronunciationStatus = 'PASS' | 'WARNING' | 'FAIL'

export interface PronunciationCheckResult {
  expectedReading: string
  detectedReading: string
  pronunciationScore: number
  pronunciationStatus: PronunciationStatus
  reasons: string[]
}

export function checkPronunciation(
  expectedKana: string,
  detectedHiragana: string,
  thresholds: VoiceCheckThresholds,
): PronunciationCheckResult {
  const expectedReading = toHiragana(expectedKana)
  const expectedMorae = toMorae(expectedReading)
  const detectedMorae = toMorae(detectedHiragana)

  const distance = levenshteinDistance(expectedMorae, detectedMorae)
  const maxLen = Math.max(expectedMorae.length, detectedMorae.length, 1)
  const pronunciationScore = Math.round(100 * (1 - distance / maxLen))

  const pronunciationStatus: PronunciationStatus =
    pronunciationScore >= thresholds.passScore
      ? 'PASS'
      : pronunciationScore >= thresholds.warningScore
        ? 'WARNING'
        : 'FAIL'

  const reasons: string[] =
    pronunciationStatus === 'PASS'
      ? []
      : [`Expected ${expectedReading} but detected ${detectedHiragana || '(empty)'}`]

  return { expectedReading, detectedReading: detectedHiragana, pronunciationScore, pronunciationStatus, reasons }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/lib/voiceQuality.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/answerChecking.ts src/lib/voiceQuality.ts src/lib/voiceQuality.test.ts
git commit -m "$(cat <<'EOF'
Add checkPronunciation() mora-level reading comparison

Scores an ASR transcript against a word's expected kana reading using
mora-level edit distance, reusing the existing levenshteinDistance and
toHiragana helpers rather than reimplementing them. Covers the FAIL
case from docs/2026-08-15-voice-quality-check-design.md
(おばあさん misheard as おそぼさん) plus sokuon/chōon/hatsuon/yōon/
dakuten variants.
EOF
)"
```

---

## Task 3: Extract shared ElevenLabs client

**Files:**
- Create: `scripts/elevenLabsClient.ts`
- Modify: `scripts/generateAudioElevenLabs.ts` (full rewrite using the extracted client — behavior-preserving)

**Interfaces:**
- Produces: `requireApiKey(): string`, `pcmToWav(pcm: Buffer, sampleRate?, numChannels?, bitsPerSample?): Buffer`, `synthesize(text: string, apiKey: string): Promise<Buffer>`, `fileExists(p: string): Promise<boolean>`, `synthesizeToFile(outPath: string, text: string, apiKey: string): Promise<void>`, `OUT_DIR: string` — consumed by `scripts/checkVoiceQuality.ts` (Task 6) for its `--regenerate` path, and by the rewritten `generateAudioElevenLabs.ts` itself.

This task has no automated test (it's a thin I/O wrapper around a paid HTTP API, matching the existing convention that `scripts/*.ts` files aren't unit tested). Verification is `tsc`/build-only plus a manual read-through — **do not actually run either script**, since both call the paid ElevenLabs API.

- [ ] **Step 1: Create the shared client**

```ts
// scripts/elevenLabsClient.ts
// ElevenLabs TTS client shared by scripts/generateAudioElevenLabs.ts (bulk
// character/word generation) and scripts/checkVoiceQuality.ts (single-word
// regeneration after a FAIL verdict) — extracted so neither script
// reimplements PCM->WAV framing or the synthesis HTTP call. Narrator voice,
// distinct from Tamamizu (the mascot's voice) — see
// generateAudioElevenLabs.ts's header for the full history.
import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const VOICE_ID = 'LX07LNNrSwlByKloPCtW'
export const MODEL_ID = 'eleven_v3'
export const SAMPLE_RATE = 24000
export const OUT_DIR = path.resolve(import.meta.dirname, '../public/audio')

export function requireApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    console.error('Set ELEVENLABS_API_KEY first.')
    process.exit(1)
  }
  return apiKey
}

export function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export async function synthesize(text: string, apiKey: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=pcm_${SAMPLE_RATE}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL_ID }),
  })
  if (!res.ok) throw new Error(`synthesis failed (${res.status}) for "${text}": ${await res.text()}`)
  const pcm = Buffer.from(await res.arrayBuffer())
  return pcmToWav(pcm)
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

// Always overwrites — the skip-if-exists decision belongs to the caller
// (generateAudioElevenLabs.ts's bulk loop skips; checkVoiceQuality.ts's
// --regenerate path deliberately wants to overwrite a bad clip).
export async function synthesizeToFile(outPath: string, text: string, apiKey: string): Promise<void> {
  await mkdir(path.dirname(outPath), { recursive: true })
  const wav = await synthesize(text, apiKey)
  await writeFile(outPath, wav)
}
```

- [ ] **Step 2: Rewrite `generateAudioElevenLabs.ts` to use the shared client**

Replace the full file contents with:

```ts
// Pre-generates every character and word pronunciation clip (public/audio/
// characters/<id>.wav, public/audio/words/<id>.wav) with a dedicated
// ElevenLabs narrator voice — distinct from Tamamizu (the mascot's voice,
// used only for in-game feedback lines; see scripts/generateFeedbackAudio
// -related history and project_kana_game_elevenlabs_voice memory). This
// voice was chosen specifically for clear, well-enunciated pronunciation
// since that's what a kana-learning app actually needs, and replaces both
// the previous COEIROINK word audio and the real-human character
// recordings.
//
// Text sent to the API is `word.audioText ?? word.kana` for words (see
// src/data/words.ts's audioText comment for why bare kana is often the
// wrong input) and the bare kana character for single kana.
//
// SKIPS any id that already has a clip on disk (same safety convention as
// scripts/generateFeedbackAudio.ts) — re-running this after adding new
// content only pays for what's actually new/missing, never re-charges for
// clips that already exist. Delete a specific .wav first if you deliberately
// want to regenerate just that one (or use `npm run check-voices --
// --regenerate --yes`, which does this for FAILed clips automatically).
//   ELEVENLABS_API_KEY=sk_... npx tsx scripts/generateAudioElevenLabs.ts
import path from 'node:path'
import { CHARACTERS } from '../src/data/characters'
import { ALL_WORDS } from '../src/data/words'
import { fileExists, OUT_DIR, requireApiKey, synthesizeToFile } from './elevenLabsClient'

const apiKey = requireApiKey()

async function generateAll(subdir: string, items: { id: string; text: string }[]) {
  const dir = path.join(OUT_DIR, subdir)
  for (const { id, text } of items) {
    const outPath = path.join(dir, `${id}.wav`)
    if (await fileExists(outPath)) {
      console.log(`  skip ${subdir}/${id}.wav (already exists)`)
      continue
    }
    await synthesizeToFile(outPath, text, apiKey)
    console.log(`  wrote ${subdir}/${id}.wav  ("${text}")`)
  }
}

async function main() {
  console.log(`Generating ${CHARACTERS.length} character clips...`)
  await generateAll(
    'characters',
    CHARACTERS.map((c) => ({ id: c.id, text: c.kana })),
  )

  console.log(`Generating ${ALL_WORDS.length} word clips...`)
  await generateAll(
    'words',
    ALL_WORDS.map((w) => ({ id: w.id, text: w.audioText ?? w.kana })),
  )

  console.log('Done.')
}

main()
```

- [ ] **Step 3: Type-check (do NOT run either script — both call the paid API)**

Run: `npm run build`
Expected: succeeds with no type errors. This is the only verification for this task — confirm by reading the diff that `generateAll`'s skip-then-synthesize behavior is unchanged, just delegated to the extracted helpers.

- [ ] **Step 4: Commit**

```bash
git add scripts/elevenLabsClient.ts scripts/generateAudioElevenLabs.ts
git commit -m "$(cat <<'EOF'
Extract ElevenLabs client so checkVoiceQuality.ts can reuse it

scripts/elevenLabsClient.ts now owns PCM->WAV framing and the synthesis
HTTP call; generateAudioElevenLabs.ts's bulk-generation behavior
(skip-if-exists, same voice/model) is unchanged. Needed so the
upcoming voice-quality checker's --regenerate path doesn't duplicate
this logic.
EOF
)"
```

---

## Task 4: Add ASR + reading-normalization dependencies

**Files:**
- Modify: `package.json` (new devDependencies)
- Create: `scripts/asr.ts`

**Interfaces:**
- Produces: `transcribeToHiragana(wavPath: string, modelName: string): Promise<string>` — consumed by `scripts/checkVoiceQuality.ts` (Task 6).

No automated test for this task (it wraps a native binding and a multi-second local model inference call — matches the design doc's "ASRエンジン自体は単体テスト対象外" decision). Verification is a manual one-off smoke test, described in Step 3.

- [ ] **Step 1: Install the dependencies**

```bash
npm install --save-dev @lumen-labs-dev/whisper-node kuroshiro kuroshiro-analyzer-kuromoji
```

This adds three MIT-licensed devDependencies to `package.json`. `@lumen-labs-dev/whisper-node` downloads a precompiled `whisper.cpp` binary on Windows (no local build toolchain needed — just the Microsoft Visual C++ 2015–2022 Redistributable (x64), which is present on most Windows machines already; install it manually if the first run reports a missing DLL). The whisper model itself (~1.5GB for `medium`) downloads on first use, not at `npm install` time.

- [ ] **Step 2: Write the ASR wrapper**

```ts
// scripts/asr.ts
// Runs local Japanese ASR (whisper.cpp, via a binding that ships
// precompiled Windows binaries so no local build toolchain is needed) on a
// generated word clip, then normalizes whisper's output — which can mix
// kanji, katakana, and hiragana depending on what it "guesses" the word is
// — to hiragana via kuroshiro, so it can be compared mora-by-mora against a
// word's pure-kana `kana` field (src/lib/voiceQuality.ts does that
// comparison; this file only produces the hiragana string to feed it).
import { whisper } from '@lumen-labs-dev/whisper-node'
import Kuroshiro from 'kuroshiro'
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji'

let kuroshiroInstance: Kuroshiro | undefined

async function getKuroshiro(): Promise<Kuroshiro> {
  if (!kuroshiroInstance) {
    kuroshiroInstance = new Kuroshiro()
    await kuroshiroInstance.init(new KuromojiAnalyzer())
  }
  return kuroshiroInstance
}

export async function transcribeToHiragana(wavPath: string, modelName: string): Promise<string> {
  const segments = await whisper(wavPath, {
    modelName,
    whisperOptions: { language: 'ja' },
  })
  const rawText = segments
    .map((segment: { speech: string }) => segment.speech)
    .join('')
    .trim()
  if (!rawText) return ''
  const kuroshiro = await getKuroshiro()
  const hiragana: string = await kuroshiro.convert(rawText, { to: 'hiragana', mode: 'normal' })
  return hiragana
}
```

- [ ] **Step 3: Manual smoke test (one-off, not part of automated suite)**

Run against one already-generated clip to confirm the whole chain works end to end before wiring up the full CLI in Task 6:

```bash
npx tsx -e "import('./scripts/asr.ts').then(m => m.transcribeToHiragana('public/audio/words/a-ai.wav', 'medium')).then(console.log)"
```

Expected: prints `あい` (or something close to it) after the first run downloads the `medium` model. If it errors with a missing DLL, install the Microsoft Visual C++ 2015–2022 Redistributable (x64) and retry.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json scripts/asr.ts
git commit -m "$(cat <<'EOF'
Add local Japanese ASR wrapper (whisper.cpp + kuroshiro)

transcribeToHiragana() runs a generated word clip through a local,
free whisper.cpp binding and normalizes the result to hiragana via
kuroshiro, so it can be compared against a word's expected kana
reading. All new dependencies are MIT-licensed and run locally — no
new recurring API cost.
EOF
)"
```

---

## Task 5: Voice-check configuration

**Files:**
- Create: `scripts/voiceCheckConfig.ts`

**Interfaces:**
- Consumes: `VoiceCheckThresholds` (Task 2, `src/lib/voiceQuality.ts`).
- Produces: `DEFAULT_THRESHOLDS: VoiceCheckThresholds`, `WHISPER_MODEL: string`, `MAX_REGENERATE_ATTEMPTS: number` — consumed by `scripts/checkVoiceQuality.ts` (Task 6).

No test — this is a plain config object, not logic.

- [ ] **Step 1: Write the config file**

```ts
// scripts/voiceCheckConfig.ts
// Score thresholds and ASR/regeneration knobs for scripts/checkVoiceQuality.ts.
// Kept out of the comparison logic itself (src/lib/voiceQuality.ts) so they
// can be retuned without touching scoring code — see
// docs/2026-08-15-voice-quality-check-design.md's "PASS / WARNING / FAIL"
// section for why these aren't hardcoded.
import type { VoiceCheckThresholds } from '../src/lib/voiceQuality'

export const DEFAULT_THRESHOLDS: VoiceCheckThresholds = {
  passScore: 90,
  warningScore: 70,
}

// 'medium' balances Japanese accuracy against local download size/CPU time.
// Bump to 'large-v3' if WARNING volume turns out too high in practice.
export const WHISPER_MODEL = 'medium'

export const MAX_REGENERATE_ATTEMPTS = 3
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds (no consumer exists yet, but the file itself must type-check against `VoiceCheckThresholds`).

- [ ] **Step 3: Commit**

```bash
git add scripts/voiceCheckConfig.ts
git commit -m "Add configurable thresholds for the voice-quality checker"
```

---

## Task 6: CLI tool + JSON report (`npm run check-voices`)

**Files:**
- Create: `scripts/checkVoiceQuality.ts`
- Modify: `package.json` (add `check-voices` script)
- Modify: `.gitignore` (ignore the generated report)

**Interfaces:**
- Consumes: `checkPronunciation`, `PronunciationCheckResult`, `VoiceCheckThresholds` (Task 2); `OUT_DIR`, `fileExists`, `requireApiKey`, `synthesizeToFile` (Task 3); `transcribeToHiragana` (Task 4); `DEFAULT_THRESHOLDS`, `WHISPER_MODEL`, `MAX_REGENERATE_ATTEMPTS` (Task 5); `ALL_WORDS`, `WORDS_BY_ROW` (existing, `src/data/words.ts`); `AnchorWord` (existing, `src/data/types.ts`).
- Produces: the `npm run check-voices` CLI itself (no exports consumed elsewhere).

This task's own logic (argv parsing, report shape) is exercised by the manual runs in Steps 3–5 rather than a Vitest suite — it's an I/O-heavy CLI entrypoint, matching this repo's existing convention that `scripts/*.ts` orchestration code isn't unit-tested (only the pure logic it calls into, already covered in Tasks 1–2).

- [ ] **Step 1: Write the CLI**

```ts
// scripts/checkVoiceQuality.ts
// CLI entry point for the automated voice-quality pipeline described in
// docs/2026-08-15-voice-quality-check-design.md. For every word (or every
// word in one row, with --row), transcribes its existing clip locally,
// scores it against the word's expected reading, and writes both a console
// summary and voice-check-report.json. Never calls the paid ElevenLabs API
// unless BOTH --regenerate and --yes are given — see the --regenerate
// handling below.
//
//   npm run check-voices                          # check everything
//   npm run check-voices -- --row ka-row           # check one row
//   npm run check-voices -- --regenerate           # dry run: show what would be regenerated
//   npm run check-voices -- --regenerate --yes     # actually regenerate FAILed clips (paid)
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import type { AnchorWord } from '../src/data/types'
import { ALL_WORDS, WORDS_BY_ROW } from '../src/data/words'
import { checkPronunciation, type PronunciationStatus } from '../src/lib/voiceQuality'
import { transcribeToHiragana } from './asr'
import { fileExists, OUT_DIR, requireApiKey, synthesizeToFile } from './elevenLabsClient'
import { DEFAULT_THRESHOLDS, MAX_REGENERATE_ATTEMPTS, WHISPER_MODEL } from './voiceCheckConfig'

type ReportStatus = PronunciationStatus | 'MISSING_AUDIO'

interface VoiceCheckEntry {
  wordId: string
  expectedReading: string
  audioTextUsed: string
  detectedReading: string
  pronunciationScore: number
  pronunciationStatus: ReportStatus
  reasons: string[]
}

interface VoiceCheckReport {
  generatedAt: string
  config: typeof DEFAULT_THRESHOLDS
  totals: Record<ReportStatus, number>
  results: VoiceCheckEntry[]
}

function wavPathFor(wordId: string): string {
  return path.join(OUT_DIR, 'words', `${wordId}.wav`)
}

async function checkWord(word: AnchorWord): Promise<VoiceCheckEntry> {
  const audioTextUsed = word.audioText ?? word.kana
  const wavPath = wavPathFor(word.id)

  if (!(await fileExists(wavPath))) {
    return {
      wordId: word.id,
      expectedReading: word.kana,
      audioTextUsed,
      detectedReading: '',
      pronunciationScore: 0,
      pronunciationStatus: 'MISSING_AUDIO',
      reasons: ['audio file not found'],
    }
  }

  let detectedHiragana: string
  try {
    detectedHiragana = await transcribeToHiragana(wavPath, WHISPER_MODEL)
  } catch (err) {
    return {
      wordId: word.id,
      expectedReading: word.kana,
      audioTextUsed,
      detectedReading: '',
      pronunciationScore: 0,
      pronunciationStatus: 'WARNING',
      reasons: [`ASR failed: ${err instanceof Error ? err.message : String(err)}`],
    }
  }

  const result = checkPronunciation(word.kana, detectedHiragana, DEFAULT_THRESHOLDS)
  return {
    wordId: word.id,
    expectedReading: result.expectedReading,
    audioTextUsed,
    detectedReading: result.detectedReading,
    pronunciationScore: result.pronunciationScore,
    pronunciationStatus: result.pronunciationStatus,
    reasons: result.reasons,
  }
}

function printSummary(results: VoiceCheckEntry[]) {
  const totals: Record<ReportStatus, number> = { PASS: 0, WARNING: 0, FAIL: 0, MISSING_AUDIO: 0 }
  for (const r of results) totals[r.pronunciationStatus]++

  console.log('\nJapanese Voice Quality Check\n')
  console.log(`Total: ${results.length}\n`)
  console.log(`PASS:    ${totals.PASS}`)
  console.log(`WARNING: ${totals.WARNING}`)
  console.log(`FAIL:    ${totals.FAIL}`)
  if (totals.MISSING_AUDIO > 0) console.log(`MISSING: ${totals.MISSING_AUDIO}`)

  const fails = results.filter((r) => r.pronunciationStatus === 'FAIL')
  if (fails.length > 0) {
    console.log('\nFAILURES\n')
    fails.forEach((r, i) => {
      console.log(`${i + 1}. ${r.wordId}`)
      console.log(`   Expected: ${r.expectedReading}`)
      console.log(`   Detected: ${r.detectedReading}`)
      console.log(`   Reason: ${r.reasons.join('; ')}\n`)
    })
  }
}

async function writeReport(results: VoiceCheckEntry[]): Promise<void> {
  const totals: Record<ReportStatus, number> = { PASS: 0, WARNING: 0, FAIL: 0, MISSING_AUDIO: 0 }
  for (const r of results) totals[r.pronunciationStatus]++
  const report: VoiceCheckReport = { generatedAt: new Date().toISOString(), config: DEFAULT_THRESHOLDS, totals, results }
  const reportPath = path.resolve(import.meta.dirname, '../voice-check-report.json')
  await writeFile(reportPath, JSON.stringify(report, null, 2))
  console.log(`\nReport written to ${reportPath}`)
}

async function regenerateFailures(results: VoiceCheckEntry[], words: AnchorWord[], confirmed: boolean): Promise<VoiceCheckEntry[]> {
  const wordsById = new Map(words.map((w) => [w.id, w]))
  const fails = results.filter((r) => r.pronunciationStatus === 'FAIL')

  if (fails.length === 0) {
    console.log('\nNo FAILed words to regenerate.')
    return results
  }

  console.log(`\n${fails.length} word(s) would be regenerated via ElevenLabs (paid), up to ${MAX_REGENERATE_ATTEMPTS} attempt(s) each:`)
  for (const f of fails) console.log(`  - ${f.wordId}`)

  if (!confirmed) {
    console.log('\nThis was a dry run. Re-run with --regenerate --yes to actually spend API credits.')
    return results
  }

  const apiKey = requireApiKey()
  const updated = [...results]
  for (const fail of fails) {
    const word = wordsById.get(fail.wordId)
    if (!word) continue
    const audioTextUsed = word.audioText ?? word.kana
    const wavPath = wavPathFor(word.id)
    let latest = fail
    for (let attempt = 1; attempt <= MAX_REGENERATE_ATTEMPTS; attempt++) {
      console.log(`  regenerating ${word.id} (attempt ${attempt}/${MAX_REGENERATE_ATTEMPTS})...`)
      await synthesizeToFile(wavPath, audioTextUsed, apiKey)
      latest = await checkWord(word)
      if (latest.pronunciationStatus !== 'FAIL') break
    }
    const index = updated.findIndex((r) => r.wordId === word.id)
    if (index !== -1) updated[index] = latest
  }
  return updated
}

function parseArgs(argv: string[]) {
  const rowIndex = argv.indexOf('--row')
  const rowFilter = rowIndex !== -1 ? argv[rowIndex + 1] : undefined
  return {
    rowFilter,
    regenerate: argv.includes('--regenerate'),
    confirmed: argv.includes('--yes'),
  }
}

async function main() {
  const { rowFilter, regenerate, confirmed } = parseArgs(process.argv.slice(2))
  const words: AnchorWord[] = rowFilter ? (WORDS_BY_ROW[rowFilter] ?? []) : ALL_WORDS

  if (rowFilter && words.length === 0) {
    console.error(`No words found for row "${rowFilter}".`)
    process.exit(1)
  }

  console.log(`Checking ${words.length} word clip(s)...`)
  let results: VoiceCheckEntry[] = []
  for (const word of words) {
    results.push(await checkWord(word))
  }

  if (regenerate) {
    results = await regenerateFailures(results, words, confirmed)
  }

  printSummary(results)
  await writeReport(results)
}

main()
```

- [ ] **Step 2: Register the npm script and ignore the generated report**

In `package.json`, add to `"scripts"`:

```json
    "check-voices": "tsx scripts/checkVoiceQuality.ts",
```

(placed after `"test": "vitest run"`, matching the existing alphabetically-loose ordering in that file).

In `.gitignore`, add a new section at the end:

```
# Generated by npm run check-voices
voice-check-report.json
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 4: Manual dry run (no API cost — this path never calls ElevenLabs)**

```bash
npm run check-voices -- --row a-row
```

Expected: console prints "Checking 4 word clip(s)...", then a PASS/WARNING/FAIL summary (first run also downloads the `medium` whisper model, per Task 4), then "Report written to .../voice-check-report.json". Confirm `voice-check-report.json` was created and its `results` array has 4 entries matching `a-row`'s words.

- [ ] **Step 5: Manual regenerate dry-run check (still no API cost)**

If Step 4 produced any FAIL entries:

```bash
npm run check-voices -- --row a-row --regenerate
```

Expected: prints the list of words that *would* be regenerated and "This was a dry run. Re-run with --regenerate --yes to actually spend API credits." — confirm it does NOT call ElevenLabs (no `ELEVENLABS_API_KEY` needed for this dry-run path). Do not run the `--yes` variant during this verification — that spends real money and is the user's call, not part of implementation verification.

- [ ] **Step 6: Commit**

```bash
git add scripts/checkVoiceQuality.ts package.json .gitignore
git commit -m "$(cat <<'EOF'
Add npm run check-voices CLI for automated voice-quality checking

Checks every word's generated clip (or one row via --row) against its
expected reading using local ASR, prints a PASS/WARNING/FAIL summary,
and writes voice-check-report.json. Regeneration of FAILed clips via
ElevenLabs requires both --regenerate and --yes — a bare --regenerate
is a dry run that spends no API credits.
EOF
)"
```

---

## Task 7: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new `src/lib/mora.test.ts` and `src/lib/voiceQuality.test.ts` suites and the untouched existing suites (notably `src/lib/answerChecking.test.ts` and `src/data/curriculum.test.ts`).

- [ ] **Step 2: Run the full build**

Run: `npm run build`
Expected: `tsc -b && vite build` succeeds with no errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: no new lint errors from the files added in this plan.

No commit for this task — it's a checkpoint, not a change.

---

## Out of scope (future phases, not part of this plan)

- **Phase 2 — accent/F0 analysis**: pitch-contour comparison against `src/data/accents.ts`'s `ACCENT_PATTERNS`, using `pitchy` (MIT) for local F0 extraction. Deliberately excluded here because mora-level forced alignment (needed to know *which* pitch samples belong to *which* mora) is significantly harder and less reliable for Japanese than the reading check in this plan — see the design doc's "調査結果のまとめ". Includes the "アクセント違い" test case requested but not covered here.
- **Phase 3 — developer review screen**: a dev-only route listing PASS/WARNING/FAIL/Human-Verified status per word, filterable, with playback. No such dev-only route pattern currently exists in `src/routes/` (all are user-facing) — Phase 3 must design that pattern in its own brainstorming pass, not inherit one from this plan.
