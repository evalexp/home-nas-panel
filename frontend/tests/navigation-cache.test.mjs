import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../../', import.meta.url))
const image = (color) => 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="${color}"/></svg>`,
).toString('base64')

async function freePort() {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForServer(url, process) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (process.exitCode !== null) throw new Error('Test backend exited before startup')
    try {
      if ((await fetch(url + '/api/auth/status')).ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Test backend did not start')
}

function browserOptions() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
  }
  if (existsSync(chromium.executablePath())) return {}
  // Reuse an installed browser on Windows; CI can use `npx playwright install chromium`.
  const candidates = [
    join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  ]
  const executablePath = candidates.find((path) => existsSync(path))
  if (!executablePath) throw new Error('Install Chromium with `npx playwright install chromium`')
  return { executablePath }
}

test('navigation API, lazy icons, persistent SW cache, refresh and invalidation', { timeout: 120_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nas-navigation-'))
  const executable = join(directory, process.platform === 'win32' ? 'server.exe' : 'server')
  let server
  let browser
  try {
    execFileSync('go', ['build', '-o', executable, './cmd/server'], { cwd: root, stdio: 'pipe' })
    const port = await freePort()
    const origin = `http://localhost:${port}`
    server = spawn(executable, [], {
      cwd: root,
      env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), JWT_SECRET: randomBytes(32).toString('hex') },
      stdio: 'ignore',
    })
    await waitForServer(origin, server)
    let token
    const backend = async (path, method = 'GET', body) => {
      const response = await fetch(origin + '/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      assert.ok(response.ok, `${method} ${path}: ${response.status}`)
      return response.json()
    }
    const credentials = { username: 'nav-test', password: randomBytes(18).toString('hex') }
    token = (await backend('/auth/register', 'POST', credentials)).token
    const icon = await backend('/nav/icons', 'POST', { name: 'Shared icon', data: image('red') })
    const unused = await backend('/nav/icons', 'POST', { name: 'Unused icon', data: image('blue') })
    const first = await backend('/nav', 'POST', { title: 'Alpha service', url: 'https://example.com/a', iconId: icon.id, icon: '', category: 'Services', orderIndex: 1 })
    await backend('/nav', 'POST', { title: 'Beta service', url: 'https://example.com/b', iconId: icon.id, icon: '', category: 'Services', orderIndex: 2 })
    await backend('/nav', 'POST', { title: 'Preset service', url: 'https://example.com/c', icon: 'Server', category: 'Services', orderIndex: 3 })
    assert.ok(!(JSON.stringify(await backend('/nav'))).includes('base64'))
    const metadata = await backend('/nav/icons')
    assert.equal(metadata.length, 2)
    assert.ok(metadata.every((entry) => !('data' in entry)))
    assert.equal((await backend(`/nav/icons/${icon.id}`)).data, icon.data)

    browser = await chromium.launch({ headless: true, ...browserOptions() })
    const context = await browser.newContext()
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const network = []
    context.on('request', (request) => {
      if (request.serviceWorker()) network.push({ path: new URL(request.url()).pathname, method: request.method() })
    })
    await page.goto(origin)
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
      if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
    })
    await page.evaluate((value) => localStorage.setItem('token', value), token)
    await page.reload()
    await page.getByRole('heading', { name: 'Alpha service' }).waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('[data-nav-card] img')].length === 2 &&
      [...document.querySelectorAll('[data-nav-card] img')].every((image) => image.complete && image.naturalWidth > 0))
    assert.equal(network.filter((entry) => entry.path === '/api/nav').length, 1)
    assert.equal(network.filter((entry) => entry.path === `/api/nav/icons/${icon.id}`).length, 1)
    assert.equal(network.filter((entry) => entry.path === '/api/nav/icons').length, 0)
    assert.equal(network.filter((entry) => entry.path === `/api/nav/icons/${unused.id}`).length, 0)
    assert.equal(await page.locator('[data-nav-card]').filter({ hasText: 'Preset service' }).locator('img').count(), 0)
    assert.equal(await page.locator('[data-nav-card]').filter({ hasText: 'Preset service' }).locator('svg.lucide-server').count(), 1)
    t.diagnostic('Cold load: one nav request, one shared icon request, no library or unused icon request')
    await page.setViewportSize({ width: 320, height: 800 })
    await page.getByRole('button', { name: '刷新导航', exact: true }).waitFor({ state: 'visible' })
    const toolbarFits = await page.getByRole('button', { name: '刷新导航', exact: true }).evaluate((button) =>
      [...button.parentElement.children].every((element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.left >= 0 && bounds.right <= innerWidth
      }))
    assert.ok(toolbarFits, 'Navigation toolbar must fit the mobile viewport')
    await page.setViewportSize({ width: 1280, height: 720 })

    network.length = 0
    await page.reload()
    await page.getByRole('heading', { name: 'Alpha service' }).waitFor()
    await page.locator('[data-nav-card] img').first().waitFor()
    assert.equal(network.filter((entry) => entry.path.startsWith('/api/nav')).length, 0)
    t.diagnostic('Reload: navigation and icons served from persistent cache')

    const browserAPI = (path, method = 'GET', body, cache = 'no-cache') => page.evaluate(async ({ path, method, body, cache }) => {
      const response = await fetch('/api' + path, {
        method, cache,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: response.status, data: await response.json() }
    }, { path, method, body, cache })

    await backend(`/nav/${first.id}`, 'PUT', { ...first, title: 'Updated service' })
    assert.equal((await browserAPI('/nav')).data[0].title, 'Alpha service')
    network.length = 0
    await page.getByRole('button', { name: '刷新导航', exact: true }).click()
    await page.getByRole('heading', { name: 'Updated service' }).waitFor()
    await page.waitForFunction(() => !document.querySelector('[aria-label="刷新导航"]').disabled)
    assert.equal(network.filter((entry) => entry.path === '/api/nav').length, 1)
    assert.equal(network.filter((entry) => entry.path === `/api/nav/icons/${icon.id}`).length, 1)
    t.diagnostic('Manual refresh bypasses both caches and refreshes each referenced icon once')

    await page.getByRole('button', { name: '添加书签', exact: true }).click()
    assert.equal(network.filter((entry) => entry.path === '/api/nav/icons').length, 0)
    await page.getByRole('button', { name: /^图标库/ }).click()
    await page.getByText('Unused icon', { exact: true }).waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('img[alt="Unused icon"]')].some((image) => image.complete && image.naturalWidth > 0))
    assert.equal(network.filter((entry) => entry.path === '/api/nav/icons').length, 1)
    assert.equal(network.filter((entry) => entry.path === `/api/nav/icons/${unused.id}`).length, 1)
    await page.getByRole('button', { name: '取消', exact: true }).click()
    t.diagnostic('Library metadata and unused thumbnails load only when the library is opened')

    const updated = { ...first, title: 'Written service' }
    assert.equal((await browserAPI(`/nav/${first.id}`, 'PUT', updated)).status, 200)
    assert.equal((await browserAPI('/nav')).data.find((item) => item.id === first.id).title, 'Written service')
    const uploaded = (await browserAPI('/nav/icons', 'POST', { name: 'New icon', data: image('green') })).data
    assert.ok((await browserAPI('/nav/icons')).data.some((entry) => entry.id === uploaded.id))
    await browserAPI('/nav/reorder', 'POST', [
      { id: first.id, category: 'Moved', orderIndex: 10 },
    ])
    assert.equal((await browserAPI('/nav')).data.find((item) => item.id === first.id).category, 'Moved')
    await browserAPI(`/nav/icons/${icon.id}`, 'DELETE')
    assert.equal((await browserAPI(`/nav/icons/${icon.id}`)).status, 404)
    assert.ok((await browserAPI('/nav')).data.every((item) => item.iconId !== icon.id))
    assert.ok(!(await browserAPI('/nav/icons')).data.some((entry) => entry.id === icon.id))
    t.diagnostic('Writes and reordering invalidate indexes; icon deletion clears content and all references')

    // Expire a real stored entry and verify that its next read reaches the backend.
    await backend(`/nav/${first.id}`, 'PUT', { ...updated, title: 'After expiration', iconId: null })
    await page.evaluate(async () => {
      for (const name of await caches.keys()) {
        if (!name.startsWith('nas-nav-v1-')) continue
        const cache = await caches.open(name)
        const response = await cache.match('/api/nav')
        if (!response) continue
        const headers = new Headers(response.headers)
        headers.set('X-Nav-Cached-At', String(Date.now() - 8 * 24 * 60 * 60 * 1000))
        await cache.put('/api/nav', new Response(await response.arrayBuffer(), { headers }))
      }
    })
    assert.equal((await browserAPI('/nav')).data.find((item) => item.id === first.id).title, 'After expiration')

    await context.setOffline(true)
    assert.equal((await browserAPI('/nav')).status, 200)
    await page.getByRole('button', { name: '刷新导航', exact: true }).click()
    await page.getByRole('alert').waitFor()
    assert.equal(await page.locator('[data-nav-card]').count(), 3)
    await context.setOffline(false)
    t.diagnostic('Expired entries refetch; failed manual refresh retains cards and reports an error')

    // Hold a forced icon response while deleting a card; the old refresh must not restore it.
    await browserAPI(`/nav/${first.id}`, 'PUT', { ...updated, title: 'After expiration', iconId: uploaded.id })
    await page.reload()
    await page.getByRole('heading', { name: 'After expiration' }).waitFor()
    let releaseIcon
    let iconStarted
    const held = new Promise((resolve) => { releaseIcon = resolve })
    const started = new Promise((resolve) => { iconStarted = resolve })
    await context.route(`**/api/nav/icons/${uploaded.id}`, async (route) => {
      const response = await route.fetch()
      iconStarted()
      await held
      await route.fulfill({ response })
    })
    const iconResponse = page.waitForResponse((response) => response.url() === `${origin}/api/nav/icons/${uploaded.id}`)
    await page.getByRole('button', { name: '刷新导航', exact: true }).click()
    await started
    await page.locator('[data-nav-card]').filter({ hasText: 'After expiration' }).click({ button: 'right' })
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '删除此书签', exact: true }).click()
    await page.getByRole('heading', { name: 'After expiration' }).waitFor({ state: 'detached' })
    releaseIcon()
    await (await iconResponse).finished()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.getByRole('heading', { name: 'After expiration' }).count(), 0)
    assert.equal(await page.locator('[data-nav-card]').count(), 2)
    await context.unroute(`**/api/nav/icons/${uploaded.id}`)
    t.diagnostic('A slow refresh cannot restore a card deleted while its icon request was pending')

    // A different or expired bearer token must never reuse the current session's cached 200.
    const invalidStatus = await page.evaluate(async () => {
      const current = localStorage.getItem('token')
      const invalid = current.slice(0, current.lastIndexOf('.') + 1) + 'invalid-signature'
      return (await fetch('/api/nav', { headers: { Authorization: `Bearer ${invalid}` } })).status
    })
    assert.equal(invalidStatus, 401)

    // Logout must also prevent an already running GET from repopulating its session cache.
    let releaseRead
    let readStarted
    const heldRead = new Promise((resolve) => { releaseRead = resolve })
    const startedRead = new Promise((resolve) => { readStarted = resolve })
    await context.route('**/api/nav', async (route) => {
      const response = await route.fetch()
      readStarted()
      await heldRead
      await route.fulfill({ response })
    })
    const pendingRead = browserAPI('/nav', 'GET', undefined, 'reload')
    await startedRead
    await page.getByRole('button', { name: '用户账户选项', exact: true }).click()
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await page.waitForFunction(async () => !(await caches.keys()).some((name) => name.startsWith('nas-nav-v1-')))
    releaseRead()
    await pendingRead
    await context.unroute('**/api/nav')
    assert.ok(!(await page.evaluate(() => caches.keys())).some((name) => name.startsWith('nas-nav-v1-')))
    assert.equal((await browserAPI('/nav')).status, 401)
    token = (await backend('/auth/login', 'POST', credentials)).token
    await page.evaluate((value) => localStorage.setItem('token', value), token)
    await page.reload()
    await page.getByRole('heading', { name: 'Beta service' }).waitFor()
    assert.deepEqual(errors, [])
    t.diagnostic('Logout clears cached session; unauthenticated request gets 401; login reads current cards')

    const noWorker = await browser.newContext({ serviceWorkers: 'block' })
    await noWorker.addInitScript((value) => localStorage.setItem('token', value), token)
    const fallback = await noWorker.newPage()
    await fallback.goto(origin)
    await fallback.getByRole('heading', { name: 'Beta service' }).waitFor()
    await fallback.getByRole('button', { name: '刷新导航', exact: true }).click()
    await fallback.waitForFunction(() => !document.querySelector('[aria-label="刷新导航"]').disabled)
    assert.equal(await fallback.getByRole('alert').count(), 0)
    await noWorker.close()
    t.diagnostic('Navigation and manual refresh also work when Service Workers are unavailable')
    await context.close()
  } finally {
    await browser?.close()
    if (server && server.exitCode === null) {
      server.kill()
      await new Promise((resolve) => server.once('exit', resolve))
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
