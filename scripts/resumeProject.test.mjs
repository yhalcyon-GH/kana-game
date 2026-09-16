import { afterEach, describe, expect, it, vi } from 'vitest'
import { GITHUB_API_TIMEOUT_MS, GitHubUnreachableError, githubJson, runResumePreflight } from './resumeProject.mjs'

describe('githubJson', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('resolves parsed JSON on the normal reachable path (unchanged behavior)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => [{ number: 1 }],
    })

    await expect(githubJson('/repos/o/r/pulls', undefined)).resolves.toEqual([{ number: 1 }])
  })

  it('fails closed with GitHubUnreachableError when the request times out', async () => {
    // Simulates real fetch behavior: the request never settles on its own,
    // only the AbortSignal firing (from a tiny timeout) rejects it. This
    // exercises the actual AbortSignal.timeout wiring deterministically,
    // without any real network call or waiting for the real 10s default.
    globalThis.fetch = vi.fn((_url, options) => {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation timed out.', 'TimeoutError'))
        })
      })
    })

    await expect(githubJson('/repos/o/r/pulls', undefined, 5)).rejects.toMatchObject({
      name: 'GitHubUnreachableError',
      message: expect.stringContaining('timed out after 5ms'),
    })
  })

  it('fails closed with GitHubUnreachableError on a network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

    await expect(githubJson('/repos/o/r/pulls', undefined)).rejects.toMatchObject({
      name: 'GitHubUnreachableError',
      message: expect.stringContaining('is unreachable'),
    })
  })

  it('fails closed with GitHubUnreachableError on a non-ok API response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    })

    await expect(githubJson('/repos/o/r/pulls', undefined)).rejects.toMatchObject({
      name: 'GitHubUnreachableError',
      message: expect.stringContaining('503'),
    })
  })

  it('documents a finite default timeout', () => {
    expect(GITHUB_API_TIMEOUT_MS).toBeGreaterThan(0)
    expect(Number.isFinite(GITHUB_API_TIMEOUT_MS)).toBe(true)
  })
})

describe('runResumePreflight', () => {
  const validState = {
    schema_version: 1,
    current_main_sha: 'a'.repeat(40),
    open_prs: [{ number: 8 }],
    active_work_item: { branch: 'example/branch' },
    next_machine_action: 'resume',
  }

  it('exits non-zero with a concise, non-mutating retry message when GitHub is unreachable', async () => {
    const readLiveGitHubStateFn = vi
      .fn()
      .mockRejectedValue(new GitHubUnreachableError('GitHub API /repos/o/r/pulls timed out after 10000ms'))

    const result = await runResumePreflight({
      loadProjectStateFn: () => validState,
      validateProjectStateFn: () => [],
      readLiveGitHubStateFn,
    })

    expect(result.exitCode).toBe(1)
    expect(result.message).toContain('No mutating action was attempted')
    expect(result.message).toContain('Retry the read-only resume preflight later')
  })

  it('propagates unrelated errors instead of masking them as a GitHub-reachability failure', async () => {
    const readLiveGitHubStateFn = vi.fn().mockRejectedValue(new Error('boom'))

    await expect(
      runResumePreflight({
        loadProjectStateFn: () => validState,
        validateProjectStateFn: () => [],
        readLiveGitHubStateFn,
      }),
    ).rejects.toThrow('boom')
  })

  it('keeps the normal reachable-GitHub path and checkpoint comparison unchanged', async () => {
    const live = {
      origin_main_sha: 'a'.repeat(40),
      open_prs: [{ number: 8 }],
      recent_merged_prs: [],
    }
    const readLiveGitHubStateFn = vi.fn().mockResolvedValue(live)

    const result = await runResumePreflight({
      loadProjectStateFn: () => validState,
      validateProjectStateFn: () => [],
      readLiveGitHubStateFn,
    })

    expect(result.exitCode).toBe(0)
    const parsed = JSON.parse(result.message)
    expect(parsed.comparison.main_sha_matches).toBe(true)
    expect(parsed.comparison.open_prs_match).toBe(true)
    expect(parsed.next_machine_action).toBe('resume')
  })
})
