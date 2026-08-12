// Rebuilds the self-hosted Klee One subset used by the .font-kana class
// (see src/index.css for why: the full @fontsource/klee-one Japanese
// subset is ~4MB per weight, but this app only ever renders hiragana/～/・
// with it). Scans src/data for every string ever assigned to a `kana` or
// `label` field, subsets the two weights down to just those glyphs, and
// writes them to src/assets/fonts/. Re-run whenever a new character needs
// adding to the curriculum (e.g. a future katakana row):
//   npx tsx scripts/subsetKanaFont.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import subsetFont from 'subset-font'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

async function extractChars() {
  const sources = await Promise.all(
    ['src/data/characters.ts', 'src/data/words.ts', 'src/data/curriculum.ts'].map((f) =>
      readFile(path.join(root, f), 'utf8'),
    ),
  )
  const chars = new Set()
  for (const src of sources) {
    for (const m of src.matchAll(/(?:kana|label): '([^']*)'/g)) {
      for (const ch of m[1]) chars.add(ch)
    }
  }
  return [...chars].sort().join('')
}

const text = await extractChars()
console.log(`Subsetting to ${text.length} characters: ${text}`)

const filesDir = path.join(root, 'node_modules/@fontsource/klee-one/files')
const outDir = path.join(root, 'src/assets/fonts')
await mkdir(outDir, { recursive: true })

for (const weight of [400, 600]) {
  const input = await readFile(path.join(filesDir, `klee-one-japanese-${weight}-normal.woff2`))
  const subsetBuf = await subsetFont(input, text, { targetFormat: 'woff2' })
  const outPath = path.join(outDir, `klee-one-hiragana-${weight}.woff2`)
  await writeFile(outPath, subsetBuf)
  console.log(`${weight}: ${(input.length / 1024).toFixed(0)}KB -> ${(subsetBuf.length / 1024).toFixed(1)}KB`)
}
console.log('Done.')
