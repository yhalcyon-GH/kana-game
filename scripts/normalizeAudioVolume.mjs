// Normalizes loudness across every character + word audio clip using
// ffmpeg's loudnorm (EBU R128) filter, single-pass, targeted at a
// consistent -16 LUFS / -1.5dB true peak — fixes the volume inconsistency
// across clips recorded in different batches/sessions.
//   node scripts/normalizeAudioVolume.mjs
import { execFile } from 'node:child_process'
import { readdir, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const FFMPEG = 'C:\\Users\\halcy\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin\\ffmpeg.exe'

async function normalizeDir(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.wav'))
  let done = 0
  for (const f of files) {
    const inPath = path.join(dir, f)
    const tmpPath = path.join(dir, `${f}.tmp.wav`)
    try {
      await execFileAsync(FFMPEG, ['-y', '-i', inPath, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', tmpPath])
      await rename(tmpPath, inPath)
      done++
    } catch (err) {
      console.error(`  FAILED ${f}: ${err.message}`)
    }
  }
  console.log(`${dir}: normalized ${done}/${files.length}`)
}

async function main() {
  await normalizeDir(path.join(root, 'public/audio/characters'))
  await normalizeDir(path.join(root, 'public/audio/words'))
}

main()
