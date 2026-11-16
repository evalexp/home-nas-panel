import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { chromium } from 'playwright'
import { preview } from 'vite'

const frontendRoot = fileURLToPath(new URL('../', import.meta.url))
const modeKey = 'home-nas-panel-network-mode'
const internal = 'http://nas.internal.test:8096/'
const bookmarks = [
  { id: 1, title: 'Legacy NAS', url: 'https://legacy.example.test/',
    icon: 'Server', category: '家庭服务', description: 'Short description', orderIndex: 0 },
  { id: 2, title: 'Dual address NAS with a deliberately long title that must remain on one line',
    url: 'https://nas.example.test/', internalUrl: `  ${internal}  `, icon: 'Globe',
    category: '家庭服务', description: 'Long description with many words '.repeat(18), orderIndex: 1 },
  { id: 3, title: 'Blank internal NAS', url: 'https://blank.example.test/', internalUrl: '   ',
    icon: 'Router', category: '家庭服务', description: '', orderIndex: 2 },
]
const switchFor = (page) => page.getByRole('switch', { name: '使用内网地址', exact: true })
const cardFor = (page, title) => page.locator('[data-nav-card]').filter({
  has: page.getByRole('heading', { name: title, exact: true }),
})

function browserOptions() {
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    chromium.executablePath(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  const executablePath = candidates.find((path) => path && existsSync(path))
  assert.ok(executablePath, 'Install Chromium with npx playwright install chromium')
  return { executablePath }
}

async function expectMode(page, mode) {
  await page.waitForFunction((checked) =>
    document.querySelector('[role="switch"][aria-label="使用内网地址"]')?.getAttribute('aria-checked') === checked,
  String(mode === 'internal'))
}

async function expectTargets(page, item, expected) {
  const card = cardFor(page, item.title)
  await page.evaluate(() => { window.__opened = []; window.__copied = [] })
  await card.click()
  await card.click({ button: 'middle' })
  await card.focus()
  await card.press('Enter')
  await card.press('Space')
  assert.deepEqual(await page.evaluate(() => window.__opened),
    Array.from({ length: 4 }, () => [expected, '_blank', 'noopener,noreferrer']))
  await card.click({ button: 'right' })
  const link = page.getByRole('link', { name: '在新标签页打开', exact: true })
  assert.equal(await link.getAttribute('href'), expected)
  assert.equal(await link.getAttribute('target'), '_blank')
  await page.getByRole('button', { name: '复制链接地址', exact: true }).click()
  assert.deepEqual(await page.evaluate(() => window.__copied), [expected])
}

async function editBookmark(page, title) {
  await cardFor(page, title).click({ button: 'right' })
  await page.getByRole('button', { name: '编辑服务书签', exact: true }).click()
  await page.getByRole('heading', { name: '编辑服务书签', exact: true }).waitFor()
}

async function saveBookmark(page) {
  await page.getByRole('button', { name: '保存书签', exact: true }).click()
  await page.getByRole('button', { name: '保存书签', exact: true }).waitFor({ state: 'hidden' })
}

async function expectLayout(page, label) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const toggle = switchFor(page)
  await toggle.click({ trial: true })
  const box = await toggle.boundingBox()
  assert.ok(box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0 &&
    box.x + box.width <= page.viewportSize().width + 1, `${label}: switch fits viewport`)
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    root: document.documentElement.scrollWidth, body: document.body.scrollWidth,
    cards: [...document.querySelectorAll('[data-nav-card]')].map((card) => {
      const title = card.querySelector('h4')
      const description = card.querySelector('p')
      const icon = title.parentElement.previousElementSibling
      const c = card.getBoundingClientRect(), i = icon.getBoundingClientRect()
      const badge = icon.firstElementChild.getBoundingClientRect()
      const t = title.getBoundingClientRect(), d = description.getBoundingClientRect()
      const ts = getComputedStyle(title), ds = getComputedStyle(description)
      return { height: c.height, innerHeight: card.clientHeight, iconHeight: i.height,
        iconWidth: i.width, badgeWidth: badge.width, badgeHeight: badge.height,
        badgeTop: badge.top, badgeBottom: badge.bottom, titleTop: t.top, descriptionBottom: d.bottom,
        iconTop: i.top - c.top, iconLeft: i.left - c.left,
        textLeft: t.left, descriptionLeft: d.left, titleHeight: t.height,
        titleLineHeight: parseFloat(ts.lineHeight), nowrap: ts.whiteSpace,
        ellipsis: ts.textOverflow, descriptionHeight: d.height,
        descriptionLineHeight: parseFloat(ds.lineHeight), clamp: ds.webkitLineClamp,
        titleRight: t.right, descriptionRight: d.right, right: c.right }
    }),
  }))
  assert.ok(layout.root <= layout.viewport + 1 && layout.body <= layout.viewport + 1,
    `${label}: document must not overflow horizontally`)
  assert.equal(layout.cards.length, bookmarks.length)
  for (const card of layout.cards) {
    assert.equal(card.height, 80, `${label}: short, long and empty descriptions keep h-20`)
    assert.ok(Math.abs(card.iconHeight - card.innerHeight) <= 1, `${label}: full height icon slot`)
    assert.ok(card.iconWidth > card.badgeWidth && card.iconHeight > card.badgeHeight,
      `${label}: icon badge has surrounding whitespace`)
    assert.ok(Math.abs(card.badgeWidth - card.badgeHeight) <= 1, `${label}: square icon badge`)
    assert.ok(Math.abs(card.badgeTop - card.titleTop) <= 1,
      `${label}: icon top aligns with the title line`)
    assert.ok(Math.abs(card.badgeBottom - card.descriptionBottom) <= 1,
      `${label}: icon bottom aligns with the reserved two-line description area`)
    assert.ok(card.iconTop <= 2 && card.iconLeft <= 2, `${label}: icon starts at card edge`)
    assert.ok(Math.abs(card.textLeft - card.descriptionLeft) <= 1, `${label}: text left edges align`)
    assert.ok(card.titleHeight <= card.titleLineHeight + 1)
    assert.equal(card.nowrap, 'nowrap')
    assert.equal(card.ellipsis, 'ellipsis')
    assert.equal(card.clamp, '2')
    assert.ok(card.descriptionHeight <= card.descriptionLineHeight * 2 + 1)
    assert.ok(card.titleRight <= card.right && card.descriptionRight <= card.right)
  }
}

test('network mode browser regressions against built frontend', { timeout: 180_000 }, async (t) => {
  assert.ok(existsSync(new URL('../dist/index.html', import.meta.url)), 'Build frontend/dist before running this test')
  // Serve dist only: no project plugins, .env, proxy, backend or database.
  const server = await preview({ configFile: false, envDir: false, root: frontendRoot, logLevel: 'silent',
    build: { outDir: 'dist' }, preview: { host: '127.0.0.1', port: 0, strictPort: true, proxy: {} } })
  let browser
  try {
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    browser = await chromium.launch({ headless: true, ...browserOptions() })
    async function session(options, run) {
      const context = await browser.newContext({ serviceWorkers: 'block', colorScheme: 'light',
        viewport: { width: 1280, height: 900 } })
      context.setDefaultTimeout(7000)
      const unexpected = [], errors = [], mutations = [], calls = []
      let items = structuredClone(bookmarks)
      context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)))
      await context.route('**/*', async (route) => {
        const request = route.request(), url = new URL(request.url()), method = request.method()
        const respond = (data) => route.fulfill({ status: 200,
          contentType: 'application/json', body: JSON.stringify(data) })
        if (url.origin !== origin) {
          unexpected.push(`${method} external ${url.origin}${url.pathname}`)
          return route.abort()
        }
        if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
          calls.push(`${method} ${url.pathname}`)
          if (method === 'GET') {
            if (url.pathname === '/api/auth/status') return respond({ initialized: true, hasPasskey: false })
            if (url.pathname === '/api/auth/me') return respond({ id: 1, username: 'network-test', passkeys: [] })
            if (url.pathname === '/api/nav') return respond(items)
            if (url.pathname === '/api/nav/icons') return respond([])
          }
          if (options.mutate && method === 'POST' && url.pathname === '/api/nav/reorder') {
            const payload = request.postDataJSON()
            mutations.push({ method, path: url.pathname, payload })
            items = items.map((item) => ({ ...item, ...payload.find((entry) => entry.id === item.id) }))
            return respond({ success: true })
          }
          if (options.mutate && ((method === 'POST' && url.pathname === '/api/nav') ||
            (method === 'PUT' && /^\/api\/nav\/\d+$/.test(url.pathname)))) {
            const payload = request.postDataJSON()
            mutations.push({ method, path: url.pathname, payload })
            const id = method === 'POST' ? 4 : Number(url.pathname.split('/').pop())
            const saved = { ...items.find((item) => item.id === id), ...payload, id }
            items = [...items.filter((item) => item.id !== id), saved]
            return respond(saved)
          }
          unexpected.push(`${method} ${url.pathname}`)
          return route.abort()
        }
        if (method === 'GET') return route.continue()
        unexpected.push(`${method} ${url.pathname}`)
        return route.abort()
      })
      await context.addInitScript(({ origin, modeKey, seed, restricted }) => {
        // about:blank has an opaque origin; never touch either storage before this guard.
        if (location.origin !== origin) return
        localStorage.setItem('token', 'network-test-session')
        if (seed !== undefined && !sessionStorage.getItem('network-test-seeded')) {
          localStorage.setItem(modeKey, seed)
          sessionStorage.setItem('network-test-seeded', 'true')
        }
        if (restricted) {
          for (const method of ['getItem', 'setItem', 'removeItem']) {
            const original = Storage.prototype[method]
            Storage.prototype[method] = function (key, ...args) {
              if (key === modeKey) throw new DOMException('Network storage unavailable', 'SecurityError')
              return original.call(this, key, ...args)
            }
          }
        }
        window.__opened = []; window.__copied = []
        window.open = (...args) => { window.__opened.push(args); return null }
        Object.defineProperty(navigator, 'clipboard', { configurable: true,
          value: { writeText: async (value) => { window.__copied.push(value) } } })
      }, { origin, modeKey, seed: options.seed, restricted: options.restricted })
      try {
        const page = await context.newPage()
        await page.goto(origin)
        await cardFor(page, bookmarks[0].title).waitFor()
        await run({ page, context, mutations })
        assert.deepEqual(unexpected, [], 'Unexpected API, asset or external request')
        assert.ok(!calls.some((call) => call.includes('/api/pve/online')), 'Homepage must not poll PVE online')
        if (!options.mutate) assert.deepEqual(mutations, [], 'Switching must not mutate API state')
        assert.deepEqual(errors, [], 'No uncaught browser errors')
      } finally { await context.close() }
    }

    await t.test('all opening methods, context menu and search resolve current address', async () => {
      await session({}, async ({ page }) => {
        await expectMode(page, 'external')
        for (const mode of ['external', 'internal']) {
          if (mode === 'internal') await switchFor(page).click()
          await expectMode(page, mode)
          for (const item of bookmarks) {
            await expectTargets(page, item, mode === 'internal' && item.id === 2 ? internal : item.url)
          }
          const search = page.getByPlaceholder('搜索服务或分类...')
          await search.fill('nas.internal.test')
          assert.equal(await page.locator('[data-nav-card]').count(), 1)
          await cardFor(page, bookmarks[1].title).waitFor()
          await search.fill('')
        }
      })
    })

    await t.test('persistence and real cross-tab storage events in both directions', async () => {
      await session({}, async ({ page, context }) => {
        const second = await context.newPage()
        await second.goto(origin)
        await expectMode(second, 'external')
        await switchFor(page).click()
        await expectMode(second, 'internal')
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), modeKey), 'internal')
        await page.reload()
        await expectMode(page, 'internal')
        await expectTargets(page, bookmarks[1], internal)
        await switchFor(second).click()
        await expectMode(page, 'external')
        await page.reload()
        await expectMode(page, 'external')
        assert.equal(await page.evaluate((key) => localStorage.getItem(key), modeKey), 'external')
      })
    })

    await t.test('invalid storage and restricted reads/writes preserve usable page switching', async () => {
      for (const options of [{ seed: 'invalid-mode' }, { restricted: true }]) {
        await session(options, async ({ page }) => {
          await expectMode(page, 'external')
          await switchFor(page).click()
          await expectMode(page, 'internal')
          await expectTargets(page, bookmarks[1], internal)
          await switchFor(page).click()
          await expectMode(page, 'external')
          await expectTargets(page, bookmarks[0], bookmarks[0].url)
        })
      }
    })

    await t.test('add/edit load, trim, save and clear optional internalUrl', async () => {
      await session({ mutate: true }, async ({ page, mutations }) => {
        await page.getByRole('button', { name: '添加书签', exact: true }).click()
        await page.getByPlaceholder('例如: Jellyfin、OpenWrt、qBittorrent').fill('Added NAS')
        const externalField = page.getByLabel('外网地址（默认）', { exact: false })
        const internalField = page.getByLabel(/内网地址\s*（选填）/)
        assert.equal(await externalField.getAttribute('id'), 'nav-external-url')
        assert.equal(await internalField.getAttribute('id'), 'nav-internal-url')
        await externalField.fill('https://added.example.test/')
        await internalField.fill('  http://added.internal.test/  ')
        await saveBookmark(page)
        assert.equal(mutations[0].method, 'POST')
        assert.equal(mutations[0].payload.url, 'https://added.example.test/')
        assert.equal(mutations[0].payload.internalUrl, 'http://added.internal.test/')
        await editBookmark(page, 'Added NAS')
        assert.equal(await internalField.inputValue(), 'http://added.internal.test/')
        assert.equal(await externalField.inputValue(), 'https://added.example.test/')
        await internalField.fill('  http://updated.internal.test/  ')
        await saveBookmark(page)
        assert.equal(mutations[1].path, '/api/nav/reorder')
        assert.equal(mutations[2].method, 'PUT')
        assert.equal(mutations[2].payload.internalUrl, 'http://updated.internal.test/')
        await editBookmark(page, 'Added NAS')
        assert.equal(await internalField.inputValue(), 'http://updated.internal.test/')
        await internalField.fill('   ')
        await saveBookmark(page)
        assert.equal(mutations[3].payload.internalUrl, '')
        assert.equal(mutations.length, 4)
        await page.reload()
        await editBookmark(page, 'Added NAS')
        assert.equal(await internalField.inputValue(), '')
        await page.getByRole('button', { name: '取消', exact: true }).click()
        await switchFor(page).click()
        await expectTargets(page, { title: 'Added NAS' }, 'https://added.example.test/')
        assert.equal(mutations.length, 4, 'Switching and opening do not save bookmarks')
      })
    })

    await t.test('320/390/desktop headers and card geometry in both themes', async () => {
      await session({}, async ({ page }) => {
        for (const theme of ['light', 'dark']) {
          if (theme === 'dark') await page.getByRole('button', { name: '切换到暗色主题', exact: true }).click()
          await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, theme)
          for (const width of [320, 390, 1280]) {
            await page.setViewportSize({ width, height: 900 })
            await expectLayout(page, `${theme}/${width}`)
            await switchFor(page).click()
            await expectMode(page, 'internal')
            await switchFor(page).click()
            await expectMode(page, 'external')
          }
        }
      })
    })
  } finally {
    await browser?.close()
    await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
  }
})
