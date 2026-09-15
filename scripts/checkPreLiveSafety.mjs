import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const failures = []

function fail(message) {
  failures.push(message)
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

function isTracked(relativePath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
      cwd: root,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

function walk(relativePath, files = []) {
  const absolutePath = join(root, relativePath)
  for (const entry of readdirSync(absolutePath)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
    const childRelativePath = join(relativePath, entry)
    const childAbsolutePath = join(root, childRelativePath)
    if (statSync(childAbsolutePath).isDirectory()) {
      walk(childRelativePath, files)
    } else {
      files.push(childRelativePath)
    }
  }
  return files
}

function assertEmptyConfigValue(source, key) {
  const expression = new RegExp("'" + key + "'\\s*=>\\s*''")
  if (!expression.test(source)) {
    fail('Expected ' + key + ' to be blank in server/config.example.php.')
  }
}

for (const path of ['server/config.php', '.env', '.env.local']) {
  if (isTracked(path)) {
    fail(path + ' must not be committed.')
  }
}

const configExample = read('server/config.example.php')
for (const key of [
  'PADDLE_ENVIRONMENT',
  'PADDLE_SANDBOX_WEBHOOK_SECRET',
  'PADDLE_LIVE_WEBHOOK_SECRET',
  'PADDLE_LIVE_FULL_TAMAMIZU_PRICE_ID',
  'PADDLE_LIVE_FULL_TAMAMIZU_PRODUCT_ID',
  'RESEND_API_KEY',
  'DEV_HARNESS_ENABLED',
]) {
  assertEmptyConfigValue(configExample, key)
}

const envExample = read('.env.example')
if (!/^VITE_PADDLE_ENVIRONMENT=sandbox$/m.test(envExample)) {
  fail('VITE_PADDLE_ENVIRONMENT in .env.example must stay sandbox.')
}
for (const key of [
  'VITE_PADDLE_CLIENT_TOKEN',
  'VITE_PADDLE_PRICE_ID',
  'VITE_PADDLE_ENTITLEMENT_API_URL',
  'VITE_PADDLE_AUTH_API_BASE_URL',
  'VITE_PRODUCTION_AUTH_API_BASE_URL',
]) {
  if (!new RegExp('^' + key + '=$', 'm').test(envExample)) {
    fail('Expected ' + key + ' to be blank in .env.example.')
  }
}

const aiEndpointPattern = /(?:api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.elevenlabs\.io)/i
const sourceFilePattern = /\.(?:[cm]?[jt]sx?|css|json)$/i
const directRuntimeAiPackages = new Set([
  '@anthropic-ai/sdk',
  '@google/genai',
  '@google/generative-ai',
  '@mistralai/mistralai',
  'ai',
  'cohere',
  'cohere-ai',
  'elevenlabs',
  'groq-sdk',
  'openai',
  'replicate',
  'together-ai',
])

// A regression here would make the scan silently vacuous. Keep these
// self-checks in the executable guard instead of relying on review alone.
if (!aiEndpointPattern.test('https://api.openai.com/v1')) {
  fail('Internal regression: AI endpoint matcher is not active.')
}
if (!sourceFilePattern.test('src/example.ts')) {
  fail('Internal regression: runtime source-file matcher is not active.')
}
if (!directRuntimeAiPackages.has('openai')) {
  fail('Internal regression: runtime AI dependency matcher is not active.')
}

const runtimeDependencies = Object.keys(JSON.parse(read('package.json')).dependencies || {})
for (const dependency of runtimeDependencies) {
  if (directRuntimeAiPackages.has(dependency)) {
    fail('Runtime AI dependency found in package.json: ' + dependency + '.')
  }
}

for (const path of walk('src')) {
  if (!sourceFilePattern.test(path)) continue
  if (aiEndpointPattern.test(read(path))) {
    fail('Runtime AI endpoint found in ' + path + '.')
  }
}

for (const path of walk('.github/workflows')) {
  if (!/\.ya?ml$/i.test(path)) continue
  const workflow = read(path)
  if (/TAMAMIZU_PRODUCTION_SSH_|productionReadOnlyPreflight/i.test(workflow)) {
    fail(path + ' must not run the local-only Production SSH preflight or receive its connection inputs.')
  }
}

if (failures.length > 0) {
  console.error('Pre-Live Safety check failed:')
  for (const failure of failures) console.error('- ' + failure)
  process.exit(1)
}

console.log('Pre-Live Safety passed: AI_REACHABLE=0 for shipped runtime source and production dependencies; tracked secret config is absent and examples are safe.')
