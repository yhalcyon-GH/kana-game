import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadProjectState, validateProjectState } from './checkProjectState.mjs'

export function parseGitHubRepository(remoteUrl) {
  const match = remoteUrl.trim().match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/)
  if (!match) throw new Error(`origin is not a GitHub repository URL: ${remoteUrl.trim()}`)
  return { owner: match[1], repo: match[2] }
}

// Bounds every GitHub API read so a network/DNS/hang failure fails closed
// instead of blocking `npm run resume` indefinitely.
export const GITHUB_API_TIMEOUT_MS = 10_000

export class GitHubUnreachableError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'GitHubUnreachableError'
  }
}

export function compareCheckpoint(state, live) {
  const checkpointOpen = state.open_prs.map((pr) => pr.number).sort((a, b) => a - b)
  const liveOpen = live.open_prs.map((pr) => pr.number).sort((a, b) => a - b)
  const activeBranch = state.active_work_item?.branch
  const activeOpenPr = live.open_prs.find((pr) => pr.head?.ref === activeBranch)
  const activeMergedPr = live.recent_merged_prs.find((pr) => pr.head?.ref === activeBranch)

  return {
    checkpoint_main_sha: state.current_main_sha,
    origin_main_sha: live.origin_main_sha,
    main_sha_matches: state.current_main_sha === live.origin_main_sha,
    checkpoint_open_pr_numbers: checkpointOpen,
    live_open_pr_numbers: liveOpen,
    open_prs_match: JSON.stringify(checkpointOpen) === JSON.stringify(liveOpen),
    active_work_item_status: activeMergedPr ? 'merged' : activeOpenPr ? 'open' : 'not_found',
    active_work_item_pr: activeMergedPr ?? activeOpenPr ?? null,
  }
}

function git(args, root) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

// Bounds the read-only `git fetch origin main` the same way githubJson bounds
// REST reads, so a network/DNS/hang failure on the fetch also fails closed
// instead of blocking `npm run resume` indefinitely.
export function fetchOriginMain(
  root,
  { timeoutMs = GITHUB_API_TIMEOUT_MS, execFileSyncImpl = execFileSync } = {},
) {
  try {
    execFileSyncImpl('git', ['fetch', '--quiet', 'origin', 'main'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    })
  } catch (error) {
    if (error?.killed || error?.signal) {
      throw new GitHubUnreachableError(`git fetch origin main timed out after ${timeoutMs}ms`, { cause: error })
    }
    throw new GitHubUnreachableError(
      `git fetch origin main failed: ${error?.stderr?.toString?.().trim() || error?.message || error}`,
      { cause: error },
    )
  }
}

export async function githubJson(path, { token, timeoutMs = GITHUB_API_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  let response
  try {
    response = await fetchImpl(`https://api.github.com${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'kana-game-resume-protocol',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new GitHubUnreachableError(`GitHub API request timed out after ${timeoutMs}ms: ${path}`, { cause: error })
    }
    throw new GitHubUnreachableError(`GitHub API request failed: ${path} (${error?.message ?? error})`, { cause: error })
  }
  if (!response.ok) {
    throw new GitHubUnreachableError(`GitHub API ${path} failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export async function readLiveGitHubState(
  root = process.cwd(),
  token = process.env.GITHUB_TOKEN,
  { timeoutMs, fetchImpl, execFileSyncImpl } = {},
) {
  fetchOriginMain(root, { timeoutMs, execFileSyncImpl })
  const originMainSha = git(['rev-parse', 'origin/main'], root)
  const remoteUrl = git(['remote', 'get-url', 'origin'], root)
  const { owner, repo } = parseGitHubRepository(remoteUrl)
  const [open_prs, closed_prs] = await Promise.all([
    githubJson(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`, { token, timeoutMs, fetchImpl }),
    githubJson(`/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`, { token, timeoutMs, fetchImpl }),
  ])
  return {
    origin_main_sha: originMainSha,
    repository: `${owner}/${repo}`,
    open_prs,
    recent_merged_prs: closed_prs.filter((pr) => pr.merged_at),
  }
}

// Fails closed: on GitHubUnreachableError this returns a non-zero result
// instead of throwing, so the CLI can report that no mutating action was
// attempted and exit without retrying automatically.
export async function runResumePreflight({
  root = process.cwd(),
  token = process.env.GITHUB_TOKEN,
  timeoutMs = GITHUB_API_TIMEOUT_MS,
  fetchImpl = fetch,
  loadState = loadProjectState,
  validate = validateProjectState,
  readLiveState = readLiveGitHubState,
} = {}) {
  const state = loadState(root)
  const failures = validate(state)
  if (failures.length > 0) {
    return { ok: false, message: `Invalid ops/project-state.json:\n${failures.join('\n')}` }
  }

  let live
  try {
    live = await readLiveState(root, token, { timeoutMs, fetchImpl })
  } catch (error) {
    if (error instanceof GitHubUnreachableError) {
      return {
        ok: false,
        message:
          `Resume preflight could not reach GitHub (${error.message}). ` +
          'No mutating action was attempted. Retry the read-only resume preflight later once GitHub is reachable.',
      }
    }
    throw error
  }

  const comparison = compareCheckpoint(state, live)
  return { ok: true, comparison, next_machine_action: state.next_machine_action }
}

function selfTest() {
  const parsed = parseGitHubRepository('git@github.com:yhalcyon-GH/kana-game.git')
  if (parsed.owner !== 'yhalcyon-GH' || parsed.repo !== 'kana-game') throw new Error('Self-test failed: SSH remote parsing.')
  const state = {
    current_main_sha: 'a'.repeat(40),
    open_prs: [{ number: 8 }],
    active_work_item: { branch: 'example/branch' },
  }
  const report = compareCheckpoint(state, {
    origin_main_sha: 'b'.repeat(40),
    open_prs: [{ number: 8 }],
    recent_merged_prs: [{ head: { ref: 'example/branch' }, number: 7 }],
  })
  if (report.main_sha_matches || !report.open_prs_match || report.active_work_item_status !== 'merged') {
    throw new Error('Self-test failed: checkpoint comparison.')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.argv.includes('--self-test')) {
    selfTest()
    console.log('resume-protocol: self-test passed')
  } else {
    const result = await runResumePreflight()
    if (!result.ok) {
      console.error(result.message)
      process.exitCode = 1
    } else {
      console.log(JSON.stringify({ comparison: result.comparison, next_machine_action: result.next_machine_action }, null, 2))
    }
  }
}
