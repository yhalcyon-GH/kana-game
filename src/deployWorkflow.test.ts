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

function productionBuildStep(workflow: string): string {
  workflow = workflow.replace(/\r\n/g, '\n')
  const buildStart = workflow.indexOf('\n  build:\n')
  const deployStart = workflow.indexOf('\n  deploy:', buildStart)
  if (buildStart < 0 || deployStart < 0) return ''

  const buildJob = workflow.slice(buildStart, deployStart)
  const stepStart = buildJob.indexOf('\n      - run: npm run build\n')
  if (stepStart < 0) return ''

  const rest = buildJob.slice(stepStart)
  const nextStep = rest.slice(1).search(/\n      - (?:run:|uses:)/)
  return nextStep < 0 ? rest : rest.slice(0, nextStep + 1)
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

  it('passes only the three public Paddle Sandbox variables into the production build', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/deploy.yml'), 'utf8')
    const buildStep = productionBuildStep(workflow)
    const paddleVariables = [...buildStep.matchAll(/^\s+(VITE_PADDLE_[A-Z_]+:\s*.+)$/gm)]
      .map((match) => match[1].trim())

    expect(paddleVariables).toEqual([
      'VITE_PADDLE_ENVIRONMENT: ${{ vars.VITE_PADDLE_ENVIRONMENT }}',
      'VITE_PADDLE_CLIENT_TOKEN: ${{ vars.VITE_PADDLE_CLIENT_TOKEN }}',
      'VITE_PADDLE_PRICE_ID: ${{ vars.VITE_PADDLE_PRICE_ID }}',
    ])
    expect(buildStep).not.toContain('${{ secrets.')
    expect(buildStep).not.toMatch(/\b(?:PADDLE_API_KEY|PADDLE_WEBHOOK_SECRET)\b/)
  })
})
