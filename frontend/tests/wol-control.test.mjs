import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { chromium } from 'playwright'
import { preview } from 'vite'

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

test('WOL status polling, refresh, wake, mobile display and webhook settings', { timeout: 60_000 }, async (t) => {
  // Serve only the built frontend. All API requests are mocked; no database is opened.
  const server = await preview({ envDir: false, logLevel: 'silent', preview: { host: '127.0.0.1', port: 0 } })
  let browser
  try {
    browser = await chromium.launch({ headless: true, ...browserOptions() })
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.clock.install()
    await page.addInitScript(() => localStorage.setItem('token', 'wol-test-session'))
    const devices = [{ id: 1, name: 'Test NAS', mac: 'aa:bb:cc:dd:ee:ff' }]
    let config = {
      configured: true,
      wakeUrl: 'http://router.test/wakeup?token=TEST&mac={mac}',
      statusUrl: 'https://router.test/wakeup?token=TEST&checkOnline={mac}',
      tlsSkipVerify: false,
    }
    let checks = 0
    let status = 'offline'
    let failCheck = false
    let releaseCheck
    let savedConfig
    let wakeCalls = 0
    const unexpected = []
    await page.route('**/api/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()
      const respond = (data, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(data) })
      if (path === '/api/auth/me') return respond({ id: 1, username: 'wol-test', passkeys: [] })
      if (path === '/api/nav') return respond([])
      if (path === '/api/pve/online') return respond({ online: false, pveConfigured: false, wolConfigured: true })
      if (path === '/api/pve/config') return respond({ configured: true, wolDeviceId: 1 })
      if (path === '/api/wol/config' && method === 'GET') return respond(config)
      if (path === '/api/wol/config' && method === 'POST') {
        savedConfig = request.postDataJSON()
        config = { ...savedConfig, configured: true }
        return respond({ ...config, message: 'WOL Control 配置已成功保存' })
      }
      if (path === '/api/wol/devices') return respond(devices)
      if (path === '/api/wol/devices/1/wake') {
        assert.equal(method, 'POST')
        wakeCalls++
        return respond({ success: true, message: '唤醒指令已成功发送' })
      }
      if (path === '/api/wol/devices/status') {
        assert.equal(method, 'GET')
        checks++
        if (releaseCheck) await new Promise((resolve) => { releaseCheck = resolve })
        if (failCheck) return respond({ error: '在线检测暂时不可用' }, 502)
        return respond([{ deviceId: 1, status, checkedAt: new Date().toISOString() }])
      }
      unexpected.push(`${method} ${path}`)
      return route.abort()
    })

    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`)
    await page.getByRole('button', { name: 'WOL Control', exact: true }).click()
    const row = page.locator('tbody tr').first()
    await row.getByText('离线', { exact: true }).waitFor()
    assert.equal(checks, 1)
    await row.getByText('PVE 绑定宿主机', { exact: true }).waitFor()
    await page.getByText('在线状态每 15 秒自动刷新', { exact: true }).waitFor()

    status = 'online'
    await page.clock.runFor(15001)
    await row.getByText('在线', { exact: true }).waitFor()
    assert.equal(checks, 2)
    t.diagnostic('Page entry checks immediately; 15-second polling updates the bound host from offline to online')

    failCheck = true
    await page.clock.runFor(15001)
    await row.getByText('检测失败', { exact: true }).waitFor()
    assert.equal(await row.getByText('离线', { exact: true }).count(), 0)
    failCheck = false
    status = 'offline'
    await page.getByRole('button', { name: '刷新列表', exact: true }).click()
    await row.getByText('离线', { exact: true }).waitFor()
    const beforeWake = checks
    status = 'online'
    await row.getByRole('button', { name: '开机唤醒', exact: true }).click()
    await row.getByText('在线', { exact: true }).waitFor()
    assert.equal(wakeCalls, 1)
    assert.equal(checks, beforeWake + 1)
    t.diagnostic('Failures remain distinct from offline; manual refresh and waking both trigger fresh checks')

    await page.setViewportSize({ width: 390, height: 844 })
    assert.ok(await page.getByText('在线', { exact: true }).last().isVisible())
    await page.setViewportSize({ width: 1280, height: 900 })

    // Hold a status request across several polling intervals: no overlapping request may start.
    releaseCheck = true
    const beforeHeldCheck = checks
    await page.clock.runFor(15001)
    // The request remains pending until explicitly released below.
    await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('正在检测在线状态'))
    await page.clock.runFor(45000)
    assert.equal(checks, beforeHeldCheck + 1)
    const release = releaseCheck
    releaseCheck = undefined
    release()
    await page.getByText('在线状态每 15 秒自动刷新', { exact: true }).waitFor()

    await page.getByRole('button', { name: 'Setting', exact: true }).click()
    await page.getByLabel('唤醒 URL', { exact: false }).waitFor()
    const beforeLeave = checks
    await page.clock.runFor(45000)
    assert.equal(checks, beforeLeave)
    assert.equal(await page.getByText('HTTP 原始报文模板', { exact: false }).count(), 0)
    const wakeInput = page.getByLabel('唤醒 URL', { exact: false })
    const statusInput = page.getByLabel('在线检测 URL', { exact: false })
    await wakeInput.fill('ftp://router.test/wakeup?mac={mac}')
    await page.getByRole('button', { name: '保存 WOL 配置', exact: true }).click()
    await page.getByText('唤醒 URL 必须是以 http:// 或 https:// 开头的完整 URL', { exact: true }).waitFor()
    assert.equal(savedConfig, undefined)
    await wakeInput.fill(config.wakeUrl)
    await statusInput.fill(config.statusUrl)
    await page.getByLabel('允许跳过 TLS 证书校验', { exact: false }).check()
    await page.getByRole('button', { name: '保存 WOL 配置', exact: true }).click()
    await page.getByText('WOL Control 配置已成功保存', { exact: true }).waitFor()
    assert.deepEqual(savedConfig, { wakeUrl: config.wakeUrl, statusUrl: config.statusUrl, tlsSkipVerify: true })
    t.diagnostic('Mobile status is visible; requests do not overlap; leaving the page stops polling; settings save only URLs and TLS verification option')
    assert.deepEqual(unexpected, [])
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
  }
})
