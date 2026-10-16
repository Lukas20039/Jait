import path from 'node:path'
import { expect, test } from '@playwright/test'

test.use({ screenshot: 'off' })
test('Matrix search links restore room, service, and message filters, and preserve parameters', async ({ page }) => {
  await page.goto('/src/e2e-fixtures/messenger-tools.html?q=Homelab&service=WhatsApp&messageQ=firewall&roomId=%21lab%3Atest')
  await expect(page.getByLabel('Search conversations')).toHaveValue('Homelab')
  await expect(page.getByLabel('Filter by service')).toHaveValue('WhatsApp')
  await expect(page.getByLabel('Search loaded messages')).toHaveValue('firewall')
  await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Firewall ready')
  await expect(page.getByRole('log', { name: 'Messages' })).not.toContainText('Hello')
  await page.getByLabel('Search conversations').fill('missing')
  await expect(page).toHaveURL(/q=missing/)
  expect(new URL(page.url()).searchParams.get('messageQ')).toBe('firewall')
  expect(new URL(page.url()).searchParams.get('roomId')).toBe('!lab:test')
  await page.evaluate(() => {
    window.history.pushState(null, '', '/messenger?q=Team&service=Telegram&messageQ=Hello')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByLabel('Search conversations')).toHaveValue('Team')
  await expect(page.getByLabel('Filter by service')).toHaveValue('Telegram')
  await expect(page.getByLabel('Search loaded messages')).toHaveValue('Hello')
  await expect(page.getByRole('button', { name: /Team Telegram/ })).toBeVisible()
})

for (const width of [1280, 390]) {
  test('Matrix assistant access control at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/src/e2e-fixtures/messenger-tools.html')
    await page.getByRole('button', { name: 'Connections', exact: true }).click()
    const access = page.getByLabel('Allow assistant access', { exact: true })
    await expect(access).not.toBeChecked()
    await expect(page.getByText('Requested message text is shared', { exact: false })).toBeVisible()
    await access.check()
    await expect(access).toBeChecked()
    await access.uncheck()
    await expect(access).not.toBeChecked()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/messenger-tools-' + width + '.png') })
  })
}
