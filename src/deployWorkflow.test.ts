/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('GitHub Pages deployment workflow', () => {
  it('runs lint, tests, and the TypeScript production build before upload', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/deploy.yml'), 'utf8')
    const lint = workflow.indexOf('- run: npm run lint')
    const test = workflow.indexOf('- run: npm test')
    const build = workflow.indexOf('- run: npm run build')
    const upload = workflow.indexOf('actions/upload-pages-artifact@')
    expect(lint).toBeGreaterThan(-1)
    expect(test).toBeGreaterThan(lint)
    expect(build).toBeGreaterThan(test)
    expect(upload).toBeGreaterThan(build)
  })
})
