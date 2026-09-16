// scripts/kanaFrequencyAudit.ts
// CLI entry point for the deterministic kana-frequency audit (Issue #272):
// how often each taught character id appears across the shipped vocabulary
// in src/data/words.ts, joined against src/data/characters.ts /
// src/data/curriculum.ts so a character with ZERO coverage still shows up
// instead of being silently dropped. All actual counting logic lives in
// src/lib/kanaFrequencyAudit.ts (covered by its own test suite); this file
// is presentation only.
//
//   npm run audit:kana-frequency                # full low-frequency tail (<=1 occurrence)
//   npm run audit:kana-frequency -- --max 3      # widen the tail threshold
//   npm run audit:kana-frequency -- --all        # print every character, not just the tail
import {
  computeKanaFrequency,
  DOCUMENTED_STRUCTURAL_EXCEPTIONS,
  getLowFrequencyTail,
} from '../src/lib/kanaFrequencyAudit'

function parseArgs(argv: string[]) {
  const all = argv.includes('--all')
  const maxIndex = argv.indexOf('--max')
  const max = maxIndex !== -1 ? Number(argv[maxIndex + 1]) : 1
  return { all, max: Number.isFinite(max) ? max : 1 }
}

function formatRow(f: ReturnType<typeof computeKanaFrequency>[number]): string {
  const exception = DOCUMENTED_STRUCTURAL_EXCEPTIONS[f.characterId]
  const flag = exception ? '  [documented exception]' : f.totalOccurrences <= 1 ? '  [check]' : ''
  return (
    `${f.characterId.padEnd(20)} ${f.kana.padEnd(6)} ${f.categoryId.padEnd(16)} `
    + `occurrences=${String(f.totalOccurrences).padStart(3)}  distinctWords=${String(f.distinctWordCount).padStart(3)}${flag}`
  )
}

const { all, max } = parseArgs(process.argv.slice(2))
const frequencies = computeKanaFrequency()
const rows = all ? frequencies : getLowFrequencyTail(frequencies, max)

console.log(
  all
    ? `All ${frequencies.length} taught characters:`
    : `Low-frequency tail (<= ${max} occurrence${max === 1 ? '' : 's'}): ${rows.length} of ${frequencies.length} characters`,
)
for (const row of rows) console.log(formatRow(row))

const undocumentedZero = frequencies.filter(
  (f) => f.totalOccurrences === 0 && !(f.characterId in DOCUMENTED_STRUCTURAL_EXCEPTIONS),
)
console.log(
  `\n${undocumentedZero.length} character(s) have ZERO occurrences with no documented structural reason `
  + '(accidental scarcity candidates): ' + undocumentedZero.map((f) => f.characterId).join(', '),
)
