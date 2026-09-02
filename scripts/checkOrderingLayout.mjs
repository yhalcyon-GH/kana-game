import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { access, readFile, stat } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'

const DIST_DIR = resolve('dist')
const BASE_PATH = '/kana-game'
const SERVER_PORT = 4173
const DEBUG_PORT = 9222
const ORIGIN = `http://127.0.0.1:${SERVER_PORT}`

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms))

async function startStaticServer() {
  await access(join(DIST_DIR, 'index.html'), fsConstants.R_OK)

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', ORIGIN)
      let pathname = decodeURIComponent(url.pathname)

      if (pathname === BASE_PATH || pathname === `${BASE_PATH}/`) {
        pathname = '/index.html'
      } else if (pathname.startsWith(`${BASE_PATH}/`)) {
        pathname = pathname.slice(BASE_PATH.length)
      } else {
        response.writeHead(404).end('Not found')
        return
      }

      const relativePath = normalize(pathname).replace(/^[/\\]+/, '')
      const filePath = join(DIST_DIR, relativePath)
      if (!filePath.startsWith(DIST_DIR)) {
        response.writeHead(403).end('Forbidden')
        return
      }

      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) {
        response.writeHead(404).end('Not found')
        return
      }

      const body = await readFile(filePath)
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
      })
      response.end(body)
    } catch {
      response.writeHead(404).end('Not found')
    }
  })

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(SERVER_PORT, '127.0.0.1', resolveListen)
  })
  return server
}

function findChrome() {
  const candidates = [process.env.CHROME_BIN, 'google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser'].filter(Boolean)
  for (const candidate of candidates) {
    const result = spawnSync('which', [candidate], { encoding: 'utf8' })
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim()
  }
  throw new Error(`Chrome/Chromium not found. Checked: ${candidates.join(', ')}`)
}

async function waitForDebugger() {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find((target) => target.type === 'page')
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
      }
    } catch {
      // Chrome is still starting.
    }
    await delay(100)
  }
  throw new Error('Timed out waiting for Chrome remote debugging')
}

async function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', rejectOpen, { once: true })
  })

  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (!message.id || !pending.has(message.id)) return
    const { resolve: resolveMessage, reject: rejectMessage } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) rejectMessage(new Error(`${message.error.code}: ${message.error.message}`))
    else resolveMessage(message.result)
  })

  return {
    close: () => socket.close(),
    send(method, params = {}) {
      return new Promise((resolveMessage, rejectMessage) => {
        const id = ++nextId
        pending.set(id, { resolve: resolveMessage, reject: rejectMessage })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
  }
}

async function runBrowserCheck() {
  const chromePath = findChrome()
  const userDataDir = await mkdtemp(join(tmpdir(), 'kana-game-layout-'))
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let client
  try {
    client = await createCdpClient(await waitForDebugger())
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: 'light' }],
    })

    const evaluate = async (expression) => {
      const result = await client.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text ?? 'Browser evaluation failed')
      }
      return result.result.value
    }

    const waitFor = async (expression, label, timeout = 10_000) => {
      const deadline = Date.now() + timeout
      while (Date.now() < deadline) {
        if (await evaluate(expression)) return
        await delay(100)
      }
      throw new Error(`Timed out waiting for ${label}`)
    }

    const buttonExpression = (label) =>
      `Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === ${JSON.stringify(label)})`

    const clickButton = async (label) => {
      await waitFor(`Boolean(${buttonExpression(label)})`, `button ${JSON.stringify(label)}`)
      await evaluate(`(() => { const button = ${buttonExpression(label)}; button.click(); return true })()`)
    }

    const setViewport = async (width) => {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await delay(100)
    }

    const navigate = async (hashPath) => {
      await client.send('Page.navigate', { url: `${ORIGIN}${BASE_PATH}/#${hashPath}` })
      await waitFor('document.readyState === "complete" && Boolean(document.querySelector("#root"))', hashPath)
      await delay(200)
    }

    const dismissIntroIfNeeded = async () => {
      if (await evaluate(`Boolean(${buttonExpression('Skip')})`)) {
        await clickButton('Skip')
        await delay(100)
      }
    }

    const advanceToQuestionFive = async (prefix) => {
      await clickButton('Start')
      await waitFor('document.body.innerText.includes("Question 1 / 8")', `${prefix} question 1`)

      for (let question = 1; question <= 4; question++) {
        await clickButton('Choose in Romaji')
        await waitFor(
          `Boolean(document.querySelector('[data-testid="${prefix}-romaji-fallback"] button[data-testid^="${prefix}-romaji-"]'))`,
          `${prefix} romaji choices`,
        )
        await evaluate(
          `(() => { const button = document.querySelector('[data-testid="${prefix}-romaji-fallback"] button[data-testid^="${prefix}-romaji-"]'); button.click(); return true })()`,
        )
        await waitFor(
          `Boolean(${buttonExpression('Next')}) || Boolean(${buttonExpression('Show Answer')})`,
          `${prefix} question ${question} result`,
        )
        if (!(await evaluate(`Boolean(${buttonExpression('Next')})`))) {
          await clickButton('Show Answer')
        }
        await clickButton('Next')
        await waitFor(
          `document.body.innerText.includes("Question ${question + 1} / 8")`,
          `${prefix} question ${question + 1}`,
        )
      }
    }

    const measure = async (prefix) =>
      evaluate(`(() => {
        const root = document.documentElement
        const menu = document.querySelector('[data-testid="${prefix}-menu"]')
        const order = document.querySelector('[data-testid="${prefix}-order-template"]')
        const menuRect = menu.getBoundingClientRect()
        const orderRect = order.getBoundingClientRect()
        return {
          innerWidth,
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          overflow: root.scrollWidth - root.clientWidth,
          menuShadow: getComputedStyle(menu).boxShadow,
          menu: { x: menuRect.x, width: menuRect.width, right: menuRect.right, height: menuRect.height },
          order: {
            x: orderRect.x,
            width: orderRect.width,
            right: orderRect.right,
            height: orderRect.height,
            clientWidth: order.clientWidth,
            scrollWidth: order.scrollWidth,
          },
        }
      })()`)

    const checkGame = async ({ route, prefix }) => {
      await setViewport(320)
      await navigate(route)
      await dismissIntroIfNeeded()
      await advanceToQuestionFive(prefix)

      const narrow = await measure(prefix)
      console.log(`${prefix} 320px: ${JSON.stringify(narrow)}`)
      if (narrow.scrollWidth > narrow.clientWidth) {
        throw new Error(`${prefix} document still overflows at 320px: scrollWidth=${narrow.scrollWidth}, clientWidth=${narrow.clientWidth}`)
      }
      if (narrow.order.scrollWidth > narrow.order.clientWidth) {
        throw new Error(`${prefix} order template still overflows at 320px: scrollWidth=${narrow.order.scrollWidth}, clientWidth=${narrow.order.clientWidth}`)
      }

      await setViewport(640)
      const wide = await measure(prefix)
      console.log(`${prefix} 640px: ${JSON.stringify(wide)}`)
      if (wide.scrollWidth > wide.clientWidth) {
        throw new Error(`${prefix} document overflows at 640px: scrollWidth=${wide.scrollWidth}, clientWidth=${wide.clientWidth}`)
      }
      if (wide.order.scrollWidth > wide.order.clientWidth) {
        throw new Error(`${prefix} order template overflows at 640px: scrollWidth=${wide.order.scrollWidth}, clientWidth=${wide.order.clientWidth}`)
      }
    }

    await checkGame({ route: '/restaurant/na-row', prefix: 'restaurant' })
    await checkGame({ route: '/cafe/katakana-ha-row', prefix: 'cafe' })
  } finally {
    client?.close()
    const chromeExited = new Promise((resolveExit) => chrome.once('exit', resolveExit))
    chrome.kill('SIGTERM')
    await Promise.race([chromeExited, delay(2000)])
    try {
      await rm(userDataDir, { recursive: true, force: true })
    } catch (cleanupError) {
      console.error(`Warning: failed to remove Chrome temp profile ${userDataDir}: ${cleanupError.message}`)
    }
  }
}

const server = await startStaticServer()
try {
  await runBrowserCheck()
  console.log('Ordering mobile layout browser smoke passed.')
} finally {
  await new Promise((resolveClose) => server.close(resolveClose))
}
