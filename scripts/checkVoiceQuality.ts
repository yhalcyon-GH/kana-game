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
    try {
      for (let attempt = 1; attempt <= MAX_REGENERATE_ATTEMPTS; attempt++) {
        console.log(`  regenerating ${word.id} (attempt ${attempt}/${MAX_REGENERATE_ATTEMPTS})...`)
        await synthesizeToFile(wavPath, audioTextUsed, apiKey)
        latest = await checkWord(word)
        if (latest.pronunciationStatus !== 'FAIL') break
      }
    } catch (err) {
      // A mid-loop ElevenLabs error (e.g. rate limit, network blip) must not
      // crash the whole run — money may already have been spent on words
      // regenerated earlier in this same loop, and their results would be
      // lost along with everyone else's report if this propagated as an
      // unhandled rejection. Record the failure and move on to the next word.
      console.error(`  regeneration failed for ${word.id}: ${err instanceof Error ? err.message : String(err)}`)
      latest = {
        ...fail,
        reasons: [...fail.reasons, `regeneration attempt failed: ${err instanceof Error ? err.message : String(err)}`],
      }
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

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
