/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REQUIRED_BUILD_TAIL = [
  'run: npm ci',
  'run: npm run lint',
  'run: npm test',
  'run: npm run build',
  'uses: actions/upload-pages-artifact@v3',
]

function buildStepEntries(workflow: string): string[] {
  workflow = workflow.replace(/\r\n/g, '\n')
  const buildStart = workflow.indexOf('\n  build:\n')
  const deployStart = workflow.indexOf('\n  deploy:', buildStart)
  if (buildStart < 0 || deployStart < 0) return []

  const buildJob = workflow.slice(buildStart, deployStart)
  return [...buildJob.matchAll(/^\s+- (run: .+|uses: .+)$/gm)].map((match) => match[1].trim())
}

function hasRequiredBuildGateTail(workflow: string): boolean {
  const steps = buildStepEntries(workflow)
  return steps.slice(-REQUIRED_BUILD_TAIL.length).join('\n') === REQUIRED_BUILD_TAIL.join('\n')
}

describe('GitHub Pages deployment workflow', () => {
  it('runs the exact quality-gate tail in the build job before upload', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/deploy.yml'), 'utf8')

    expect(hasRequiredBuildGateTail(workflow)).toBe(true)
  })

  it('rejects gates that appear only in comments or another job', () => {
    const misleadingWorkflow = `
jobs:
  build:
    steps:
      - run: npm ci
      # - run: npm run lint
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
  deploy:
    steps:
      - run: npm run lint
      - run: npm test
`

    expect(hasRequiredBuildGateTail(misleadingWorkflow)).toBe(false)
  })
})
