import { describe, expect, it } from 'vitest'
import { GitHubUnreachableError, githubJson, runResumePreflight } from './resumeProject.mjs'

const VALID_STATE = {
  schema_version: 1,
  current_main_sha: 'a'.repeat(40),
  open_prs: [{ number: 8, head: { ref: 'example/branch' } }],
  recent_merged_prs: [],
  active_work_item: { branch: 'example/branch' },
  next_machine_action: 'Inspect PR #8 CI.',
}

const LIVE_STATE = {
  origin_main_sha: 'a'.repeat(40),
  open_prs: [{ number: 8, head: { ref: 'example/branch' } }],
  recent_merged_prs: [],
}

describe('githubJson', () => {
  it('wraps a request timeout in GitHubUnreachableError without waiting for a real network call', async () => {
    const fetchImpl = (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'TimeoutError')))
      })

    await expect(githubJson('/repos/example/example/pulls', { timeoutMs: 5, fetchImpl })).rejects.toThrow(GitHubUnreachableError)
    await expect(githubJson('/repos/example/example/pulls', { timeoutMs: 5, fetchImpl })).rejects.toThrow(/timed out after 5ms/)
  })

  it('wraps a network/connection failure in GitHubUnreachableError', async () => {
    const fetchImpl = () => Promise.reject(new TypeError('fetch failed'))

    await expect(githubJson('/repos/example/example/pulls', { fetchImpl })).rejects.toThrow(GitHubUnreachableError)
    await expect(githubJson('/repos/example/example/pulls', { fetchImpl })).rejects.toThrow(/fetch failed/)
  })

  it('wraps a non-ok HTTP response in GitHubUnreachableError', async () => {
    const fetchImpl = () => Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable' })

    await expect(githubJson('/repos/example/example/pulls', { fetchImpl })).rejects.toThrow(GitHubUnreachableError)
    await expect(githubJson('/repos/example/example/pulls', { fetchImpl })).rejects.toThrow(/503/)
  })

  it('resolves normally on a reachable, ok response', async () => {
    const fetchImpl = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ hello: 'world' }) })

    await expect(githubJson('/repos/example/example/pulls', { fetchImpl })).resolves.toEqual({ hello: 'world' })
  })
})

describe('runResumePreflight', () => {
  it('fails closed with a concise, retry-later message when GitHub is unreachable', async () => {
    const result = await runResumePreflight({
      loadState: () => VALID_STATE,
      validate: () => [],
      readLiveState: () => Promise.reject(new GitHubUnreachableError('GitHub API request timed out after 10000ms: /repos/x/y/pulls')),
    })

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/could not reach GitHub/)
    expect(result.message).toMatch(/No mutating action was attempted/)
    expect(result.message).toMatch(/Retry the read-only resume preflight later/)
  })

  it('propagates unrelated errors instead of treating them as an unreachable-GitHub failure', async () => {
    await expect(
      runResumePreflight({
        loadState: () => VALID_STATE,
        validate: () => [],
        readLiveState: () => Promise.reject(new Error('boom')),
      }),
    ).rejects.toThrow('boom')
  })

  it('reports invalid checkpoint state without attempting a GitHub read', async () => {
    let readLiveStateCalled = false
    const result = await runResumePreflight({
      loadState: () => VALID_STATE,
      validate: () => ['schema_version must be 1.'],
      readLiveState: () => {
        readLiveStateCalled = true
        return Promise.resolve(LIVE_STATE)
      },
    })

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Invalid ops\/project-state\.json/)
    expect(readLiveStateCalled).toBe(false)
  })

  it('leaves the normal reachable-GitHub path and checkpoint comparison unchanged', async () => {
    const result = await runResumePreflight({
      loadState: () => VALID_STATE,
      validate: () => [],
      readLiveState: () => Promise.resolve(LIVE_STATE),
    })

    expect(result.ok).toBe(true)
    expect(result.comparison.main_sha_matches).toBe(true)
    expect(result.comparison.open_prs_match).toBe(true)
    expect(result.next_machine_action).toBe(VALID_STATE.next_machine_action)
  })
})
