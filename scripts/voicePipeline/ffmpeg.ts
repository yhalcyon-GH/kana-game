// Thin wrapper around the pinned FFmpeg/FFprobe binaries this machine
// already has installed (via winget, Gyan.FFmpeg full build — see
// scripts/voicePipeline/README.md for the license note). Same path
// convention as scripts/normalizeAudioVolume.mjs so both scripts keep
// working if that install ever moves.
import { execFile, spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const FFMPEG_DIR = 'C:\\Users\\halcy\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin'
export const FFMPEG = `${FFMPEG_DIR}\\ffmpeg.exe`
export const FFPROBE = `${FFMPEG_DIR}\\ffprobe.exe`

export interface ProbeResult {
  sampleRate: number
  channels: number
  durationSec: number
  codecName: string
}

export async function probe(inputPath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(FFPROBE, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-select_streams', 'a:0',
    inputPath,
  ])
  const parsed = JSON.parse(stdout) as { streams: Array<Record<string, unknown>> }
  const stream = parsed.streams[0]
  if (!stream) throw new Error(`ffprobe found no audio stream in ${inputPath}`)
  return {
    sampleRate: Number(stream.sample_rate),
    channels: Number(stream.channels),
    durationSec: Number(stream.duration),
    codecName: String(stream.codec_name),
  }
}

// Decodes any input file to raw mono 16-bit PCM (native sample rate
// preserved — no resampling at analysis time, only at final export).
export async function decodeToMonoPcm(inputPath: string, sampleRate: number): Promise<Int16Array> {
  const buf = await runFfmpegCapture([
    '-v', 'error',
    '-i', inputPath,
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    '-ac', '1',
    '-ar', String(sampleRate),
    'pipe:1',
  ])
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
}

// Writes raw mono 16-bit PCM back out as a WAV file, optionally applying an
// FFmpeg filter chain (afftdn/loudnorm/alimiter etc.) and/or resampling.
export async function writePcmAsWav(
  pcm: Int16Array,
  sampleRateIn: number,
  outPath: string,
  opts?: { filter?: string; outputSampleRateHz?: number },
): Promise<void> {
  mkdirSync(path.dirname(outPath), { recursive: true })
  const args = [
    '-v', 'error', '-y',
    '-f', 's16le', '-ar', String(sampleRateIn), '-ac', '1',
    '-i', 'pipe:0',
  ]
  if (opts?.filter) args.push('-af', opts.filter)
  if (opts?.outputSampleRateHz) args.push('-ar', String(opts.outputSampleRateHz))
  args.push(outPath)
  await runFfmpegWithStdin(args, Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength))
}

function execFileAsync(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${err.message}\n${stderr}`))
      else resolve({ stdout, stderr })
    })
  })
}

function runFfmpegCapture(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}: ${stderr}`))
      else resolve(Buffer.concat(chunks))
    })
  })
}

function runFfmpegWithStdin(args: string[], input: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}: ${stderr}`))
      else resolve()
    })
    child.stdin.write(input)
    child.stdin.end()
  })
}
