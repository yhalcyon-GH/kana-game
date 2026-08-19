// Maps an input recording's basename (no extension) to a named sequence
// from sequences.ts — this is what lets "drop a new file in input/, add one
// line here" work without touching any code (see README.md). --sequence on
// the CLI always overrides this for one-off/test runs.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MANIFEST_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'voicePipeline.manifest.json')

export function loadManifest(): Record<string, string> {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Record<string, string>
}

export function sequenceNameForFile(inputPath: string, explicitSequence?: string): string {
  if (explicitSequence) return explicitSequence
  const basename = path.basename(inputPath, path.extname(inputPath))
  const manifest = loadManifest()
  const sequenceName = manifest[basename]
  if (!sequenceName) {
    throw new Error(
      `No sequence mapping for "${basename}" in scripts/voicePipeline/voicePipeline.manifest.json, and no --sequence flag given. ` +
      `Add "${basename}": "<sequence-name>" to the manifest, or pass --sequence explicitly.`,
    )
  }
  return sequenceName
}
