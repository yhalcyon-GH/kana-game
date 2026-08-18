// Generates word-icon illustrations for every word in words.ts missing an
// `image` field (as of 2026-08-18 every word has one — this is for future
// new vocabulary) via the Gemini image API ("Nano Banana", same model/prompt
// style as the original hiragana set — see design/画像/語彙イラスト/hiragana/
// for those originals, and design/画像/語彙イラスト/*-gemini-review or
// *-chatgpt for later batches' provenance).
//
// Writes to design/画像/語彙イラスト/pending-review/<id>.webp for review
// FIRST — this does NOT touch words.ts or public/word-icons/. Once the
// batch is approved, move the files into a permanently-named provenance
// folder under design/画像/語彙イラスト/, copy them into public/word-icons/,
// and add each word's `image:` field.
//
// See reference_gemini_image_generation_workflow memory: paid tier only
// (free tier 429s with limit:0 on image models), ~$0.039/image.
//
//   GEMINI_API_KEY=... node scripts/generateWordIcons.mjs
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const FFMPEG = 'C:\\Users\\halcy\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin\\ffmpeg.exe'
const MODEL = 'gemini-2.5-flash-image'
const OUT_SUBDIR = 'design/画像/語彙イラスト/pending-review'

function buildPrompt(meaning, romaji) {
  return `A simple, cute, flat-design icon illustration of "${meaning}" (${romaji}), for a children's Japanese-vocabulary-learning app. The single most important goal: a learner must be able to instantly recognize this word's meaning at a glance — clarity beats decoration every time.

Draw EXACTLY ONE thing: the object/subject itself, alone, in its single most iconic, unmistakable, stereotypical form, filling most of the frame.

STRICTLY FORBIDDEN, no matter how natural it may seem: any second object, any companion character, any mascot, any background scenery or setting, any decorative props, sparkles, motion lines, steam/smoke unless the word itself literally means steam/smoke, or any other addition beyond the one subject. If you feel tempted to add something "cute" alongside it (an animal, a flower, a face, a plate, a container it doesn't strictly need) — do not. One subject, nothing else, on a plain solid white background.

Clean vector style, bright cheerful colors, no shadows, no gradients. ABSOLUTELY NO TEXT, NO LETTERS, NO KANJI, NO WRITING ANYWHERE IN THE IMAGE.`
}

async function generateImage(prompt, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  )
  if (!res.ok) throw new Error(`Gemini API failed (${res.status}): ${await res.text()}`)
  const data = await res.json()
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p) => p.inlineData)
  if (!imagePart) throw new Error(`No image in response: ${JSON.stringify(data).slice(0, 300)}`)
  return Buffer.from(imagePart.inlineData.data, 'base64')
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('Set GEMINI_API_KEY first.')
    process.exit(1)
  }

  const wordsPath = path.join(root, 'src/data/words.ts')
  const src = await readFile(wordsPath, 'utf8')

  const re = /\{ id: '([^']+)', kana: '([^']+)', romaji: '([^']+)', meaning: '([^']+)'([^}]*)\}/g
  const missing = []
  let m
  while ((m = re.exec(src))) {
    const [, id, kana, romaji, meaning, rest] = m
    if (!rest.includes('image:')) missing.push({ id, kana, romaji, meaning })
  }
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : missing.length
  const batch = missing.slice(0, limit)
  console.log(`${missing.length} word(s) missing images; processing ${batch.length}. Writing to ${OUT_SUBDIR}/`)

  const outDir = path.join(root, OUT_SUBDIR)
  await mkdir(outDir, { recursive: true })
  const tmpDir = path.join(root, '.tmp-icons')
  await mkdir(tmpDir, { recursive: true })

  let done = 0
  for (const w of batch) {
    const webpPath = path.join(outDir, `${w.id}.webp`)
    try {
      const png = await generateImage(buildPrompt(w.meaning, w.romaji), apiKey)
      const pngPath = path.join(tmpDir, `${w.id}.png`)
      await writeFile(pngPath, png)
      await execFileAsync(FFMPEG, ['-y', '-i', pngPath, '-vf', 'scale=256:256', webpPath])
      done++
      console.log(`  [${done}/${batch.length}] ${w.id} ("${w.meaning}")`)
    } catch (err) {
      console.error(`  FAILED ${w.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`\nDone. ${done}/${batch.length} generated into ${OUT_SUBDIR}/.`)
}

main()
