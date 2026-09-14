import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const failures = []

function fail(message) {
  failures.push(message)
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
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
  const expression = new RegExp("\\'" + key + "\\'\\s*=>\\s*\\'\\'")
  if (!expression.test(source)) {
    fail(`Expected ${key} to be blank in server/config.example.php.`)
  }
}

for (const path of ['server/config.php', '.env', '.env.local']) {
  if (existsSync(join(root, path))) {
    fail(`${path} must not be committed or present in CI.`)
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
for (const key of [
  'VITE_PADDLE_ENVIRONMENT',
  'VITE_PADDLE_CLIENT_TOKEN',
  'VITE_PADDLE_PRICE_ID',
  'VITE_PRODUCTION_AUTH_API_BASE',
]) {
  if (!new RegExp('^' + key + '=$', 'm').test(envExample)) {
    fail(`Expected ${key} to be blank in .env.example.`)
  }
}

const aiEndpointPattern = /(?:api\\.openai\\.com|api\\.anthropic\\.com|generativelanguage\\.googleapis\\.com|api\\.elevenlabs\\.io)/i
for (const path of walk('src')) {
  if (!/\\.(?:[cm]?[jt]sx?|css|json)$/i.test(path)) continue
  if (aiEndpointPattern.test(read(path))) {
    fail(`Runtime AI endpoint found in ${relative(root, join(root, path))}.`)
  }
}

if (failures.length > 0) {
  console.error('Pre-Live Safety check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Pre-Live Safety passed: AI_REACHABLE=0 for shipped runtime source; example and local secret config are blank.')
