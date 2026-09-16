import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadProjectState, validateProjectState } from './checkProjectState.mjs'

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

async function githubJson(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'kana-game-resume-protocol',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!response.ok) throw new Error(`GitHub API ${path} failed: ${response.status} ${response.statusText}`)
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

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.argv.includes('--self-test')) {
    selfTest()
    console.log('resume-protocol: self-test passed')
  } else {
    const state = loadProjectState()
    const failures = validateProjectState(state)
    if (failures.length > 0) throw new Error(`Invalid ops/project-state.json:\n${failures.join('\n')}`)
    const live = await readLiveGitHubState()
    const comparison = compareCheckpoint(state, live)
    console.log(JSON.stringify({ comparison, next_machine_action: state.next_machine_action }, null, 2))
  }
}
