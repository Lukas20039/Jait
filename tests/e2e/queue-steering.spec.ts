import { expect, test } from '@playwright/test'
import path from 'node:path'

for (const width of [390, 1280]) {
  test(`queue steering menu dispatches both actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(width === 390 ? '/?mobile' : '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => import('/src/e2e-fixtures/queue-steering.tsx'))
    await page.getByRole('button', { name: 'Steer with message', exact: true }).click()
    await expect(page.getByTestId('action')).toHaveText('steer:q-selected')
    await page.getByRole('button', { name: 'Steering options', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Stop and steer', exact: true })).toBeVisible()
    await page.screenshot({ path: path.resolve(__dirname, `../../.jait/shots/queue-steering-${width}.png`) })
    await page.getByRole('menuitem', { name: 'Stop and steer', exact: true }).click()
    await expect(page.getByTestId('action')).toHaveText('stop-and-steer:q-selected')
    await expect(page.getByRole('menu')).toBeHidden()
    await page.getByRole('button', { name: 'Steering options', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: 'Steer', exact: true }).click()
    await expect(page.getByTestId('action')).toHaveText('steer:q-selected')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}
