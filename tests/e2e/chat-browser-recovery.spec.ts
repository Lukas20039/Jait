import path from 'node:path'
import { expect, test } from '@playwright/test'

test('a dropped browser connection reconnects with a fresh scoped grant and preserves control', async ({ page }) => {
  let accessRequests = 0
  // The VNC transport is external; use the real viewer, wrapper, and grant lifecycle.
  await page.route('**/noVNC/core/rfb.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export default class RFB extends EventTarget {
      constructor(screen) {
        super(); this.screen = screen; window.__rfb = this;
        screen.textContent = 'Remote browser connected';
        queueMicrotask(() => this.dispatchEvent(new Event('connect')));
      }
      loseConnection() {
        this.screen.textContent = '';
        this.dispatchEvent(new CustomEvent('disconnect', { detail: { clean: false } }));
      }
      disconnect() {}
      focus() {}
      sendKey() {}
    }
  ` }))
  await page.route('**/api/preview/access', async route => {
    accessRequests++
    const { source } = route.request().postDataJSON()
    const url = new URL(source, 'http://gateway')
    url.searchParams.set('path', 'preview/scoped-test/live/6080/websockify')
    url.searchParams.set('grant', String(accessRequests))
    await route.fulfill({ json: { url: url.pathname + url.search } })
  })
  await page.goto('/')
  await page.evaluate(() => import('/src/e2e-fixtures/browser-recovery.tsx'))
  const browser = page.frameLocator('iframe[title="Remote session"]')
  await expect(browser.getByText('Remote browser connected')).toBeVisible()
  const frame = () => page.frames().find(frame => frame.url().includes('/noVNC/vnc_lite.html'))!
  expect(Boolean(await frame().evaluate(() => (window as any).__rfb.viewOnly))).toBe(true)
  await frame().evaluate(() => (window as any).__rfb.loseConnection())
  await expect.poll(() => accessRequests).toBe(2)
  await expect(browser.getByText('Remote browser connected')).toBeVisible()
  expect(Boolean(await frame().evaluate(() => (window as any).__rfb.viewOnly))).toBe(true)
  await page.getByRole('button', { name: 'Take control', exact: true }).click()
  await expect(browser.getByText('Remote browser connected')).toBeVisible()
  await expect.poll(async () => frame() ? Boolean(await frame().evaluate(() => (window as any).__rfb?.viewOnly)) : true).toBe(false)
  await frame().evaluate(() => (window as any).__rfb.loseConnection())
  await expect.poll(() => accessRequests).toBe(4)
  await expect(browser.getByText('Remote browser connected')).toBeVisible()
  expect(Boolean(await frame().evaluate(() => (window as any).__rfb.viewOnly))).toBe(false)
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/browser-recovery.png') })
})

test('outage retries are bounded and hiding the browser cancels recovery', async ({ page }) => {
  let accessRequests = 0
  await page.route('**/noVNC/core/rfb.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export default class RFB extends EventTarget {
      constructor() {
        super();
        queueMicrotask(() => this.dispatchEvent(new CustomEvent('disconnect', { detail: { clean: false } })));
      }
      disconnect() {}
    }
  ` }))
  await page.route('**/api/preview/access', async route => {
    accessRequests++
    await route.fulfill({ json: { url: '/noVNC/vnc_lite.html?path=preview/test/live/6080/websockify&grant=' + accessRequests } })
  })
  await page.goto('/')
  await page.evaluate(() => import('/src/e2e-fixtures/browser-recovery.tsx'))
  await expect.poll(() => accessRequests, { timeout: 15000 }).toBe(4)
  await expect(page.getByText('Browser connection interrupted.', { exact: true })).toBeVisible()
  await page.waitForTimeout(4500)
  expect(accessRequests).toBe(4)
  await page.getByRole('button', { name: 'Reconnect browser', exact: true }).click()
  await expect.poll(() => accessRequests).toBe(5)
  await page.getByRole('button', { name: 'Hide browser', exact: true }).click()
  await page.waitForTimeout(1500)
  expect(accessRequests).toBe(5)
})
