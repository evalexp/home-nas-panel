import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { chromium } from 'playwright'
import { preview } from 'vite'

const frontendRoot = fileURLToPath(new URL('../', import.meta.url))
const themeKey = 'home-nas-panel-theme'
const themeColors = { light: '#f2f4f8', dark: '#1c2332' }
const opposite = (theme) => theme === 'light' ? 'dark' : 'light'
const toggleLabel = (theme) => theme === 'light' ? '切换到暗色主题' : '切换到亮色主题'
const visible = (locator) => locator.filter({ visible: true }).first()

function browserOptions() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  const executablePath = candidates.find((path) => path && existsSync(path))
  assert.ok(executablePath, 'Install Chromium with npx playwright install chromium')
  return { executablePath }
}

const fixtures = {
  '/api/auth/status': { initialized: true, hasPasskey: false },
  '/api/auth/me': { id: 1, username: 'theme-test', passkeys: [] },
  '/api/nav': [{
    id: 1, title: 'Theme test service', url: 'https://service.example.test/',
    icon: 'Server', category: '家庭服务', description: 'Local mock navigation entry', orderIndex: 0,
  }],
  '/api/nav/icons': [],
  '/api/pve/online': {
    online: true, node: 'theme-pve', pveConfigured: true, wolConfigured: true,
    wolDeviceBound: true, wolDeviceId: 1, wolDeviceName: 'Theme test NAS',
    wolDeviceMac: 'aa:bb:cc:dd:ee:ff',
  },
  '/api/pve/status': {
    status: 'online', node: 'theme-pve', cpuUsage: 0.12, cpus: 8,
    memoryUsed: 4 * 1024 ** 3, memoryTotal: 16 * 1024 ** 3,
    diskUsed: 20 * 1024 ** 3, diskTotal: 100 * 1024 ** 3,
    uptime: 86400, kversion: 'Linux test', pveversion: 'PVE test',
  },
  '/api/pve/guests': [{
    vmid: 101, name: 'theme-guest', type: 'qemu', status: 'running',
    cpu: 0.1, cpus: 2, mem: 1024 ** 3, maxmem: 2 * 1024 ** 3, uptime: 3600,
  }],
  '/api/pve/config': {
    configured: true, endpoint: 'https://pve.example.test:8006',
    tokenId: 'test@pve!panel', defaultNode: 'theme-pve', wolDeviceId: 1,
    insecureSkipVerify: false, enabled: true,
  },
  '/api/wol/config': {
    configured: true, wakeUrl: 'https://router.example.test/wake?mac={mac}',
    statusUrl: 'https://router.example.test/status?mac={mac}', tlsSkipVerify: false,
  },
  '/api/wol/devices': [{
    id: 1, name: 'Theme test NAS', mac: 'aa:bb:cc:dd:ee:ff', createdAt: '2026-01-01T00:00:00Z',
  }],
  '/api/wol/devices/status': [{ deviceId: 1, status: 'online', checkedAt: '2026-01-01T00:00:00Z' }],
}

async function expectTheme(page, theme, { bootstrapOnly = false } = {}) {
  await page.waitForFunction(({ theme, color }) => {
    const root = document.documentElement
    return root.dataset.theme === theme && root.style.colorScheme === theme &&
      getComputedStyle(root).colorScheme === theme &&
      document.querySelector('meta[name="theme-color"]')?.content.toLowerCase() === color
  }, { theme, color: themeColors[theme] })
  if (!bootstrapOnly) {
    const toggle = page.getByRole('button', { name: toggleLabel(theme), exact: true })
    await toggle.waitFor({ state: 'visible' })
    assert.equal(await toggle.isEnabled(), true)
  }
}

async function switchTheme(page, from) {
  await page.getByRole('button', { name: toggleLabel(from), exact: true }).click()
  await expectTheme(page, opposite(from))
}

async function expectStoredTheme(page, theme) {
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), themeKey), theme)
}

async function nextPaint(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

async function expectNoOverflow(page, description) {
  await nextPaint(page)
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    root: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  // A table may scroll inside its own container; the document must stay within the viewport.
  assert.ok(widths.root <= widths.viewport + 1 && widths.body <= widths.viewport + 1,
    `${description}: horizontal page overflow ${JSON.stringify(widths)}`)
}

async function expectUsableInHeader(page, button) {
  await button.waitFor({ state: 'visible' })
  const box = await button.boundingBox()
  const viewport = page.viewportSize()
  assert.ok(box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0 &&
    box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height,
  `Header button must fit the viewport: ${JSON.stringify(box)}`)
  await button.click({ trial: true })
}

async function selectTab(page, name, mobile = false) {
  if (mobile) {
    const menu = page.getByRole('button', { name: '打开侧边导航菜单', exact: true })
    await menu.click()
    assert.equal(await menu.getAttribute('aria-expanded'), 'true')
    await expectNoOverflow(page, 'open mobile drawer')
  }
  // getByRole excludes the hidden desktop/mobile copy; never pick a hidden duplicate by index.
  const tab = page.getByRole('button', { name, exact: true })
  await tab.click()
  if (mobile) {
    await page.getByRole('button', { name: '关闭侧边导航菜单', exact: true }).waitFor({ state: 'hidden' })
  } else {
    assert.equal(await tab.getAttribute('aria-current'), 'page')
  }
}

async function appearance(locator) {
  await locator.waitFor({ state: 'visible' })
  return locator.evaluate((element) => {
    let background = 'transparent'
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const candidate = getComputedStyle(ancestor).backgroundColor
      if (candidate !== 'transparent' && candidate !== 'rgba(0, 0, 0, 0)') {
        background = candidate
        break
      }
    }
    return { color: getComputedStyle(element).color, background }
  })
}

async function inspectPages(page, theme, mobile = false) {
  const styles = {}
  const main = page.getByRole('main')
  await selectTab(page, 'Navigation', mobile)
  const navigation = main.getByRole('heading', { name: '导航中心', exact: true })
  await main.getByRole('heading', { name: 'Theme test service', exact: true }).waitFor()
  styles.navigation = await appearance(navigation)
  await expectTheme(page, theme)
  await expectNoOverflow(page, `${theme} navigation`)

  await selectTab(page, 'WOL Control', mobile)
  const wol = main.getByRole('heading', { name: /WOL 控制/ })
  await visible(main.getByText('Theme test NAS', { exact: true })).waitFor()
  await visible(main.getByText('在线', { exact: true })).waitFor()
  styles.wol = await appearance(wol)
  await expectTheme(page, theme)
  await expectNoOverflow(page, `${theme} WOL`)
  await main.getByRole('button', { name: '新增设备', exact: true }).click()
  const modalHeading = page.getByRole('heading', { name: '新增 WOL 设备', exact: true })
  styles.modal = await appearance(modalHeading)
  // Existing forms use placeholders; do not depend on incidental DOM ancestry or unassociated labels.
  await page.getByPlaceholder(/例如: PVE 宿主机/).fill('Unsaved theme test device')
  await page.getByPlaceholder(/例如: 00:11:22:33:44:55/).fill('00:11:22:33:44:55')
  await page.getByRole('button', { name: '确认添加', exact: true }).waitFor()
  await expectTheme(page, theme)
  await expectNoOverflow(page, `${theme} add device modal`)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await modalHeading.waitFor({ state: 'hidden' })

  await selectTab(page, 'PVE Status', mobile)
  const pve = main.getByRole('heading', { name: 'theme-pve', exact: true })
  await main.getByRole('cell', { name: 'theme-guest', exact: true }).waitFor()
  await main.getByText('宿主机运行中', { exact: true }).waitFor()
  styles.pve = await appearance(pve)
  await expectTheme(page, theme)
  await expectNoOverflow(page, `${theme} PVE (table may scroll internally)`)

  await selectTab(page, 'Setting', mobile)
  const setting = main.getByRole('heading', { name: 'Proxmox VE (PVE) 节点配置', exact: true })
  await main.getByRole('heading', { name: '通行密钥 (Passkey) 管理', exact: true }).waitFor()
  const wake = main.getByLabel('唤醒 URL', { exact: false })
  const status = main.getByLabel('在线检测 URL', { exact: false })
  await page.waitForFunction(({ wakeUrl, statusUrl }) =>
    document.querySelector('#wolWakeUrl')?.value === wakeUrl &&
    document.querySelector('#wolStatusUrl')?.value === statusUrl,
  fixtures['/api/wol/config'])
  assert.equal(await wake.isVisible(), true)
  assert.equal(await status.isVisible(), true)
  styles.setting = await appearance(setting)
  await expectTheme(page, theme)
  await expectNoOverflow(page, `${theme} settings`)
  return styles
}

function expectDifferentPalettes(light, dark) {
  for (const surface of Object.keys(light)) {
    assert.notEqual(light[surface].background, dark[surface].background,
      `${surface}: the visible surface must change its background with the theme`)
    assert.notEqual(light[surface].color, dark[surface].color,
      `${surface}: the visible heading must change its text color with the theme`)
  }
}

test('light/dark theme browser regressions against built frontend', { timeout: 240_000 }, async (t) => {
  assert.ok(existsSync(new URL('../dist/index.html', import.meta.url)), 'Build frontend/dist before running this test')
  // No project config/plugins, .env loading, proxy, Go server or backend is needed.
  const server = await preview({
    configFile: false, envDir: false, root: frontendRoot, logLevel: 'silent',
    build: { outDir: 'dist' }, preview: { host: '127.0.0.1', port: 0, strictPort: true, proxy: {} },
  })
  let browser
  try {
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    browser = await chromium.launch({ headless: true, ...browserOptions() })

    async function session(options, run) {
      const { colorScheme = 'light', storedTheme, blockScripts = false,
        storageUnavailable = false, themeStorageUnavailable = false, width = 1280 } = options
      const context = await browser.newContext({
        serviceWorkers: 'block', colorScheme, viewport: { width, height: 900 },
        isMobile: width < 1024, hasTouch: width < 1024,
      })
      context.setDefaultTimeout(7000)
      const unexpected = []
      const errors = []
      let blockedScripts = 0
      let apiCalls = 0
      context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)))
      await context.route('**/*', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        const method = request.method()
        if (url.origin !== origin) {
          unexpected.push(`${method} external ${url.origin}${url.pathname}`)
          return route.abort()
        }
        if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
          apiCalls++
          if (method === 'GET' && Object.hasOwn(fixtures, url.pathname)) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtures[url.pathname]) })
          }
          unexpected.push(`${method} ${url.pathname}`)
          return route.abort()
        }
        if (blockScripts && request.resourceType() === 'script') {
          blockedScripts++
          return route.abort()
        }
        if (method !== 'GET') {
          unexpected.push(`${method} ${url.pathname}`)
          return route.abort()
        }
        return route.continue()
      })
      await context.addInitScript(({ origin, themeKey, storedTheme, storageUnavailable, themeStorageUnavailable }) => {
        if (location.origin !== origin) return
        // Seed once per tab so reload can actually detect a failed persistence write.
        if (storedTheme !== undefined && !sessionStorage.getItem('theme-test-seeded')) {
          localStorage.setItem(themeKey, storedTheme)
          sessionStorage.setItem('theme-test-seeded', 'true')
        }
        if (themeStorageUnavailable) {
          for (const method of ['getItem', 'setItem', 'removeItem']) {
            const original = Storage.prototype[method]
            Storage.prototype[method] = function (key, ...args) {
              if (key === themeKey) throw new DOMException('Test: theme storage unavailable', 'SecurityError')
              return original.call(this, key, ...args)
            }
          }
        }
        if (storageUnavailable) {
          Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() { throw new DOMException('Test: localStorage unavailable', 'SecurityError') },
          })
        }
      }, { origin, themeKey, storedTheme, storageUnavailable, themeStorageUnavailable })
      try {
        const page = await context.newPage()
        await page.goto(origin, { waitUntil: 'load' })
        await run({ page, context, origin, counts: () => ({ blockedScripts, apiCalls }) })
        assert.deepEqual(unexpected, [], 'All API calls must be mocked GETs; external requests and mutations are forbidden')
        assert.deepEqual(errors, [], 'No uncaught browser errors')
      } finally {
        await context.close()
      }
    }

    for (const theme of ['light', 'dark']) {
      await t.test(`first visit follows ${theme} system preference`, async () => {
        await session({ colorScheme: theme }, async ({ page }) => {
          await expectTheme(page, theme)
          await page.getByRole('heading', { name: 'Home NAS Panel', exact: true }).waitFor()
          await expectStoredTheme(page, null)
        })
      })

      await t.test(`stored ${theme} overrides system and explicit choice survives reload`, async () => {
        await session({ colorScheme: opposite(theme), storedTheme: theme }, async ({ page }) => {
          await expectTheme(page, theme)
          await page.reload()
          await expectTheme(page, theme)
          await switchTheme(page, theme)
          await expectStoredTheme(page, opposite(theme))
          await page.reload()
          await expectTheme(page, opposite(theme))
          await expectStoredTheme(page, opposite(theme))
        })
      })
    }

    await t.test('system changes follow automatically until a button makes an explicit choice', async () => {
      await session({}, async ({ page }) => {
        await expectTheme(page, 'light')
        await page.emulateMedia({ colorScheme: 'dark' })
        await expectTheme(page, 'dark')
        await page.emulateMedia({ colorScheme: 'light' })
        await expectTheme(page, 'light')
        await expectStoredTheme(page, null)
        await switchTheme(page, 'light')
        await page.emulateMedia({ colorScheme: 'dark' })
        await page.emulateMedia({ colorScheme: 'light' })
        await nextPaint(page)
        await expectTheme(page, 'dark')
        await expectStoredTheme(page, 'dark')
      })
    })

    await t.test('invalid stored values fall back to the system', async () => {
      await session({ colorScheme: 'dark', storedTheme: 'invalid-theme' }, async ({ page }) => {
        await expectTheme(page, 'dark')
        await page.emulateMedia({ colorScheme: 'light' })
        await expectTheme(page, 'light')
      })
    })

    await t.test('real storage events synchronize two tabs in both directions', async () => {
      await session({}, async ({ page, context, origin }) => {
        await expectTheme(page, 'light')
        const second = await context.newPage()
        await second.goto(origin)
        await expectTheme(second, 'light')
        await switchTheme(page, 'light')
        await expectTheme(second, 'dark')
        await switchTheme(second, 'dark')
        await expectTheme(page, 'light')
        await expectStoredTheme(page, 'light')
        // A synchronized choice must also stop following the OS in the receiving tab.
        await page.emulateMedia({ colorScheme: 'dark' })
        await nextPaint(page)
        await expectTheme(page, 'light')
        await second.evaluate((key) => localStorage.removeItem(key), themeKey)
        await expectTheme(page, 'dark')
        await page.emulateMedia({ colorScheme: 'light' })
        await expectTheme(page, 'light')
      })
    })

    await t.test('failed theme storage reads/writes still allow session toggles', async () => {
      await session({ themeStorageUnavailable: true }, async ({ page }) => {
        await expectTheme(page, 'light')
        await page.emulateMedia({ colorScheme: 'dark' })
        await expectTheme(page, 'dark')
        await switchTheme(page, 'dark')
        // Also test the localStorage getter itself throwing, after authentication has settled.
        await page.evaluate(() => {
          Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() { throw new DOMException('Test: localStorage unavailable', 'SecurityError') },
          })
        })
        await switchTheme(page, 'light')
        await page.emulateMedia({ colorScheme: 'light' })
        await nextPaint(page)
        await expectTheme(page, 'dark')
        await switchTheme(page, 'dark')
        await expectTheme(page, 'light')
      })
    })

    const bootstrapCases = [
      { colorScheme: 'light', expected: 'light' },
      { colorScheme: 'dark', expected: 'dark' },
      { colorScheme: 'dark', storedTheme: 'light', expected: 'light' },
      { colorScheme: 'light', storedTheme: 'dark', expected: 'dark' },
      { colorScheme: 'dark', storedTheme: 'invalid-theme', expected: 'dark' },
      { colorScheme: 'light', storageUnavailable: true, expected: 'light' },
      { colorScheme: 'dark', storageUnavailable: true, expected: 'dark' },
    ]
    for (const [index, scenario] of bootstrapCases.entries()) {
      await t.test(`head bootstrap before app scripts #${index + 1}: ${JSON.stringify(scenario)}`, async () => {
        await session({ ...scenario, blockScripts: true }, async ({ page, counts }) => {
          await expectTheme(page, scenario.expected, { bootstrapOnly: true })
          assert.ok(counts().blockedScripts > 0, 'The built application JS must be blocked')
          assert.equal(counts().apiCalls, 0, 'Head bootstrap must not need an API')
          assert.equal(await page.locator('#root').evaluate((root) => root.childElementCount), 0,
            'Theme must be applied before React mounts')
        })
      })
    }

    await t.test('login, navbar, navigation, WOL, PVE, settings and device modal use both palettes', async () => {
      await session({}, async ({ page }) => {
        const login = {}
        for (const theme of ['light', 'dark']) {
          await expectTheme(page, theme)
          login[theme] = { login: await appearance(page.getByRole('heading', { name: 'Home NAS Panel', exact: true })) }
          const toggle = page.getByRole('button', { name: toggleLabel(theme), exact: true })
          await expectUsableInHeader(page, toggle)
          const box = await toggle.boundingBox()
          assert.ok(box.x > page.viewportSize().width / 2 && box.y < 100, 'Login theme toggle belongs in the upper right')
          await switchTheme(page, theme)
        }
        expectDifferentPalettes(login.light, login.dark)
        await page.evaluate(() => localStorage.setItem('token', 'theme-test-session'))
        await page.reload()
        const palettes = {}
        for (const theme of ['light', 'dark']) {
          await expectTheme(page, theme)
          await expectUsableInHeader(page, page.getByRole('button', { name: toggleLabel(theme), exact: true }))
          palettes[theme] = await inspectPages(page, theme)
          await switchTheme(page, theme)
        }
        expectDifferentPalettes(palettes.light, palettes.dark)
      })
    })

    for (const width of [320, 390]) {
      for (const theme of ['light', 'dark']) {
        await t.test(`${width}px ${theme}: login/header controls, drawer and all pages fit`, async () => {
          await session({ width, colorScheme: theme }, async ({ page }) => {
            await expectTheme(page, theme)
            await page.getByRole('heading', { name: 'Home NAS Panel', exact: true }).waitFor()
            await expectUsableInHeader(page, page.getByRole('button', { name: toggleLabel(theme), exact: true }))
            await expectNoOverflow(page, `${width}px ${theme} login`)
            await switchTheme(page, theme)
            await switchTheme(page, opposite(theme))
            await page.evaluate(() => localStorage.setItem('token', 'theme-test-session'))
            await page.reload()
            const menu = page.getByRole('button', { name: '打开侧边导航菜单', exact: true })
            const account = page.getByRole('button', { name: '用户账户选项', exact: true })
            const toggle = page.getByRole('button', { name: toggleLabel(theme), exact: true })
            await expectUsableInHeader(page, menu)
            await expectUsableInHeader(page, toggle)
            await expectUsableInHeader(page, account)
            await switchTheme(page, theme)
            await switchTheme(page, opposite(theme))
            await account.click()
            await page.getByRole('button', { name: '系统设置', exact: true }).waitFor()
            await page.keyboard.press('Escape')
            assert.equal(await account.getAttribute('aria-expanded'), 'false')
            await menu.click()
            await page.getByRole('button', { name: '关闭侧边导航菜单', exact: true }).click()
            assert.equal(await menu.getAttribute('aria-expanded'), 'false')
            await inspectPages(page, theme, true)
          })
        })
      }
    }
  } finally {
    await browser?.close()
    await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
  }
})
