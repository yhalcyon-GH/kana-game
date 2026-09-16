import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadProjectState, validateProjectState } from './checkProjectState.mjs'

// Bounds every GitHub REST read below so a restricted/offline Work
// environment fails closed instead of hanging indefinitely on api.github.com.
export const GITHUB_API_TIMEOUT_MS = 10_000

// Distinguishes "GitHub could not be read" (timeout, network, or API error)
// from programming/validation errors, so the CLI can fail closed with a
// concise, non-mutating message instead of an unrelated stack trace.
export class GitHubUnreachableError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'GitHubUnreachableError'
  }
}

export function parseGitHubRepository(remoteUrl) {
  const match = remoteUrl.trim().match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/)
  if (!match) throw new Error(`origin is not a GitHub repository URL: ${remoteUrl.trim()}`)
  return { owner: match[1], repo: match[2] }
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

export async function githubJson(path, token, timeoutMs = GITHUB_API_TIMEOUT_MS) {
  let response
  try {
    response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'kana-game-resume-protocol',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    throw new GitHubUnreachableError(
      timedOut
        ? `GitHub API ${path} timed out after ${timeoutMs}ms`
        : `GitHub API ${path} is unreachable: ${error?.message ?? error}`,
      { cause: error },
    )
  }
  if (!response.ok) {
    throw new GitHubUnreachableError(`GitHub API ${path} failed: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export async function readLiveGitHubState(root = process.cwd(), token = process.env.GITHUB_TOKEN) {
  git(['fetch', '--quiet', 'origin', 'main'], root)
  const originMainSha = git(['rev-parse', 'origin/main'], root)
  const remoteUrl = git(['remote', 'get-url', 'origin'], root)
  const { owner, repo } = parseGitHubRepository(remoteUrl)
  const [open_prs, closed_prs] = await Promise.all([
    githubJson(`/repos/${owner}/${repo}/pulls?state=open&per_page=100`, token),
    githubJson(`/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`, token),
  ])
  return {
    origin_main_sha: originMainSha,
    repository: `${owner}/${repo}`,
    open_prs,
    recent_merged_prs: closed_prs.filter((pr) => pr.merged_at),
  }
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

// Runs the read-only preflight and reports outcome as data (exit code +
// message) instead of calling process.exit/console directly, so tests can
// exercise the fail-closed path with an injected readLiveGitHubStateFn and
// without triggering real network calls or killing the test process.
export async function runResumePreflight({
  loadProjectStateFn = loadProjectState,
  validateProjectStateFn = validateProjectState,
  readLiveGitHubStateFn = readLiveGitHubState,
} = {}) {
  const state = loadProjectStateFn()
  const failures = validateProjectStateFn(state)
  if (failures.length > 0) {
    return { exitCode: 1, message: `Invalid ops/project-state.json:\n${failures.join('\n')}` }
  }
  let live
  try {
    live = await readLiveGitHubStateFn()
  } catch (error) {
    if (error instanceof GitHubUnreachableError) {
      return {
        exitCode: 1,
        message:
          `resume-protocol: GitHub is unreachable (${error.message}). No mutating action was attempted. ` +
          'Retry the read-only resume preflight later.',
      }
    }
    throw error
  }
  const comparison = compareCheckpoint(state, live)
  return {
    exitCode: 0,
    message: JSON.stringify({ comparison, next_machine_action: state.next_machine_action }, null, 2),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.argv.includes('--self-test')) {
    selfTest()
    console.log('resume-protocol: self-test passed')
  } else {
    const result = await runResumePreflight()
    if (result.exitCode === 0) {
      console.log(result.message)
    } else {
      console.error(result.message)
    }
    process.exitCode = result.exitCode
  }
}
