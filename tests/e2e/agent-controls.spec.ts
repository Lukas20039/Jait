import path from 'node:path'
import { expect, test } from '@playwright/test'

for (const width of [1280, 390, 320]) {
  test(`agent controls stop and resume without a banner at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    let halted = false
    let stopCalls = 0
    let rejectStop = false
    let releaseStop: (() => void) | undefined
    const state = () => ({ halted, reason: null, haltedAt: halted ? '2026-10-14T12:00:00Z' : null, updatedAt: null })
    await page.route('**/api/persona-agents', route => route.fulfill({ json: { agents: [
      { avatar: 'Sage' }, { avatar: 'Bolt' }, { avatar: 'Muse' },
    ] } }))
    await page.route('**/api/agent-control{,/**}', async route => {
      const url = route.request().url()
      if (url.endsWith('/halt')) {
        stopCalls += 1
        if (rejectStop) return route.fulfill({ status: 500, json: { error: 'Could not stop agents' } })
        await new Promise<void>(resolve => { releaseStop = resolve })
        halted = true
      } else if (url.endsWith('/resume')) halted = false
      await route.fulfill({ json: { state: state() } })
    })
    await page.goto('/')
    await page.evaluate(() => import('/src/e2e-fixtures/agent-controls.tsx'))
    const scope = width < 768 ? page.locator('header') : page.getByRole('complementary', { name: 'Workspace sidebar' })
    const stop = scope.getByRole('button', { name: 'Stop all agents', exact: true })
    await expect(stop).toBeVisible()
    await expect(stop.locator('svg.agent-creature')).toHaveCount(3)
    if (width >= 768) {
      const account = scope.getByRole('button', { name: 'Account menu' })
      expect((await stop.boundingBox())!.y).toBeLessThan((await account.boundingBox())!.y)
      await scope.getByRole('button', { name: 'Collapse sidebar' }).click()
      await expect(scope).toHaveCSS('width', '56px')
      await expect(stop).toBeVisible()
    } else {
      const header = await scope.boundingBox()
      expect(header!.height).toBe(40)
      const control = await stop.boundingBox()
      expect(control!.width).toBeLessThanOrEqual(40)
      expect(control!.height).toBeLessThanOrEqual(40)
      const modes = await scope.getByRole('tablist', { name: 'View mode' }).boundingBox()
      expect(modes!.x + modes!.width).toBeLessThanOrEqual(control!.x)
      expect(control!.x).toBeGreaterThanOrEqual(header!.x)
      expect(control!.x + control!.width).toBeLessThanOrEqual(header!.x + header!.width)
    }
    await stop.click()
    await expect(stop).toBeDisabled()
    await expect.poll(() => stopCalls).toBe(1)
    releaseStop!()
    const resume = scope.getByRole('button', { name: 'Resume agents', exact: true })
    await expect(resume).toBeEnabled()
    await expect(page.getByText('Autonomous work is halted.', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `agent-control-halted-${width}.png`) })
    await resume.click()
    await expect(stop).toBeEnabled()
    rejectStop = true
    await stop.click()
    await expect(scope.getByRole('alert')).toHaveText('Could not stop agents')
    await expect(stop).toBeEnabled()
    expect(halted).toBe(false)
    if (width < 768) {
      await scope.getByRole('button', { name: 'Open menu', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: 'Navigation' })
      const drawerStop = drawer.getByRole('button', { name: 'Stop all agents', exact: true })
      await expect(drawerStop).toBeVisible()
      expect((await drawerStop.boundingBox())!.y).toBeLessThan((await drawer.getByRole('button', { name: 'Account settings' }).boundingBox())!.y)
    }
  })
}
