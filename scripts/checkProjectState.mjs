import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const REQUIRED_TOP_LEVEL_FIELDS = [
  'schema_version',
  'current_main_sha',
  'latest_completed_work',
  'open_prs',
  'active_work_item',
  'next_machine_action',
  'unresolved_ai_items',
  'human_gates',
  'production_live_restrictions',
  'last_verified_at',
  'last_verified_by',
  'known_non_blockers',
  'optional_post_launch',
]

const SECRET_KEY_PATTERN = /(token|password|credential|private[_-]?key|api[_-]?key)/i

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function findSecretLikeKeys(value, path = '$') {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSecretLikeKeys(item, `${path}[${index}]`))
  }
  if (!isObject(value)) return []

  return Object.entries(value).flatMap(([key, item]) => {
    const keyPath = `${path}.${key}`
    return [
      ...(SECRET_KEY_PATTERN.test(key) ? [keyPath] : []),
      ...findSecretLikeKeys(item, keyPath),
    ]
  })
}

export function validateProjectState(state) {
  const failures = []
  if (!isObject(state)) return ['Project state must be a JSON object.']

  for (const key of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(key in state)) failures.push(`Missing required top-level field: ${key}`)
  }
  if (state.schema_version !== 1) failures.push('schema_version must be 1.')
  if (typeof state.current_main_sha !== 'string' || !/^[0-9a-f]{40}$/i.test(state.current_main_sha)) {
    failures.push('current_main_sha must be a 40-character Git SHA.')
  }
  if (!Array.isArray(state.open_prs)) failures.push('open_prs must be an array.')
  if (!Array.isArray(state.unresolved_ai_items)) failures.push('unresolved_ai_items must be an array.')
  if (!Array.isArray(state.human_gates)) failures.push('human_gates must be an array.')
  if (!Array.isArray(state.known_non_blockers)) failures.push('known_non_blockers must be an array.')
  if (!Array.isArray(state.optional_post_launch)) failures.push('optional_post_launch must be an array.')
  if (!isObject(state.latest_completed_work)) failures.push('latest_completed_work must be an object.')
  if (!isObject(state.active_work_item)) failures.push('active_work_item must be an object.')
  if (typeof state.next_machine_action !== 'string' || state.next_machine_action.length === 0) {
    failures.push('next_machine_action must be a non-empty string.')
  }
  if (typeof state.production_live_restrictions !== 'string' || !/NO MONEY WITHOUT EXPLICIT HUMAN APPROVAL/.test(state.production_live_restrictions)) {
    failures.push('production_live_restrictions must retain the explicit no-money rule.')
  }
  if (typeof state.last_verified_at !== 'string' || Number.isNaN(Date.parse(state.last_verified_at))) {
    failures.push('last_verified_at must be an ISO-8601 timestamp.')
  }

  for (const keyPath of findSecretLikeKeys(state)) {
    failures.push(`Secret-like field name is forbidden in project state: ${keyPath}`)
  }
  return failures
}

export function loadProjectState(root = process.cwd()) {
  const path = resolve(root, 'ops/project-state.json')
  return JSON.parse(readFileSync(path, 'utf8'))
}

function selfTest() {
  const valid = {
    schema_version: 1,
    current_main_sha: 'a'.repeat(40),
    latest_completed_work: {}, open_prs: [], active_work_item: {}, next_machine_action: 'resume',
    unresolved_ai_items: [], human_gates: [],
    production_live_restrictions: 'NO MONEY WITHOUT EXPLICIT HUMAN APPROVAL.',
    last_verified_at: '2026-01-01T00:00:00Z', last_verified_by: 'test',
    known_non_blockers: [], optional_post_launch: [],
  }
  if (validateProjectState(valid).length !== 0) throw new Error('Self-test failed: valid state was rejected.')
  if (!validateProjectState({ ...valid, current_main_sha: 'bad' }).some((failure) => failure.includes('current_main_sha'))) {
    throw new Error('Self-test failed: invalid SHA was accepted.')
  }
  if (!validateProjectState({ ...valid, api_token: 'do-not-store' }).some((failure) => failure.includes('Secret-like'))) {
    throw new Error('Self-test failed: secret-like key was accepted.')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.argv.includes('--self-test')) selfTest()
  const failures = validateProjectState(loadProjectState())
  if (failures.length > 0) {
    console.error(failures.map((failure) => `project-state: ${failure}`).join('\n'))
    process.exitCode = 1
  } else {
    console.log('project-state: valid')
  }
}
