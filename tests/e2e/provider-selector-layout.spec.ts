import path from 'node:path'
import { expect, test } from '@playwright/test'

for (const width of [320, 390, 1280]) {
  test(`model names remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.route(/\/api\/providers(?:\?|$)/, route => route.fulfill({ json: {
      providers: [{ id: 'codex', providerType: 'codex', name: 'Codex', available: true, modes: ['full-access'], nodeId: 'gateway' }], remoteProviders: [],
    } }))
    await page.route('**/api/providers/*/models*', route => route.fulfill({ json: { models: [
      { id: 'gpt-6.1', name: 'GPT-6.1', isDefault: true },
      { id: 'gpt-6.1-long', name: 'GPT-6.1 with an extended model name' },
    ] } }))
    await page.route(url => url.pathname === '/', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()).replace('/src/main.tsx', '/src/e2e-fixtures/provider-selector-layout.tsx') })
    })
    await page.route('**/api/auth/refresh', route => route.fulfill({ json: { access_token: 'layout-fixture-token' } }))
    await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'fixture', username: 'fixture' } }))
    await page.route('**/api/settings', route => route.fulfill({ json: {} }))
    await page.goto('/')
    await page.getByRole('button', { name: /^Provider Codex, model/ }).click()
    const models = page.getByRole('listbox', { name: 'Models', exact: true })
    const name = models.getByText('GPT-6.1', { exact: true })
    await expect(name).toBeVisible()
    await expect.poll(() => name.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    if (width < 768) {
      const longName = models.getByText('GPT-6.1 with an extended model name', { exact: true })
      await expect.poll(() => longName.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      const dialog = page.getByRole('dialog', { name: 'Provider and model', exact: true })
      await expect.poll(() => dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      const box = await models.boundingBox()
      expect(box!.x + box!.width).toBeGreaterThan(width - 12)
    }
    await page.screenshot({ path: path.resolve(__dirname, `../../.jait/shots/provider-selector-${width}.png`) })
    await models.getByRole('option').filter({ hasText: 'GPT-6.1 with an extended model name' }).click()
    await expect(page.getByRole('button', { name: /^Provider Codex, model/ })).toHaveAccessibleName(/extended model name/)
  })
}
